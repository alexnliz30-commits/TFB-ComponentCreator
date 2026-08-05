/**
 * Validación del árbol devuelto por el asistente de IA.
 *
 * El asistente devuelve datos (bloques con props), no código; pero siguen siendo
 * salida de un modelo, así que nada entra al lienzo sin pasar por aquí: tipos de
 * bloque desconocidos se descartan, las props se coercionan a cadenas, las
 * referencias a hijos o variables inexistentes se eliminan y los ciclos en el
 * grafo de hijos se cortan (un ciclo colgaría el renderizador). Si tras sanear
 * no queda un árbol utilizable, se devuelve null y el lienzo queda intacto.
 */

import { BLOCK_DEFINITIONS, getDefinition } from './defaults';
import type { BuilderBlock, BlockType } from './types';
import {
  isValidPattern, isValidVarName,
  type BlockAction, type BlockEvent, type ConditionOp, type StateVar, type StyleRule,
  type ValidationKind, type ValidationRule, type VisibilityRule,
} from './actions';
import { VALIDATABLE_TYPES } from './schema';
import { isOutOfFlow } from './style-utils';

export interface SanitizedTree {
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  stateVars: StateVar[];
}

/**
 * Lo que ya existe en el lienzo y el árbol devuelto puede referenciar.
 *
 * El modelo y las props de función no las inventa el asistente: las declara el
 * usuario en su panel. Aquí llegan solo para poder **comprobar** que lo que el
 * asistente nombra existe de verdad, con el mismo criterio que las variables de
 * estado: una regla sobre un campo inexistente se descarta en vez de viajar al
 * emisor y romper la compilación en el proyecto de destino.
 */
export interface TreeContext {
  fieldNames?: Iterable<string>;
  callbackNames?: Iterable<string>;
}

const KNOWN_TYPES = new Set(BLOCK_DEFINITIONS.map((d) => d.type as string));
const EVENT_NAMES = new Set([
  'click', 'change', 'submit', 'blur', 'focus', 'mouseenter', 'mouseleave', 'dblclick',
]);
const ACTION_KINDS = new Set(['toggle', 'set', 'increment', 'reset', 'call']);
const CONDITION_OPS = new Set<ConditionOp>([
  'is', 'not', 'gt', 'lt', 'contains', 'empty', 'filled',
]);
/**
 * Tope de clases de una regla de estilo.
 *
 * Es la única prop de la regla que el asistente escribe libre, y sin límite una
 * respuesta larga podría meter media hoja de estilos dentro de un literal de
 * plantilla. Con `!` no se cuela nada: el saneado del vocabulario de estilo ya
 * corre sobre `className`, y esto es el mismo tipo de dato en otro sitio.
 */
const MAX_CLASES_CONDICIONALES = 200;
const VAR_TYPES = new Set(['boolean', 'number', 'string']);
const VALIDATION_KINDS = new Set<ValidationKind>([
  'required', 'minLength', 'maxLength', 'pattern', 'email', 'min', 'max',
]);

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeStateVars(raw: unknown): StateVar[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StateVar[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = asString(item.name);
    const type = asString(item.type);
    if (!name || !isValidVarName(name) || seen.has(name)) continue;
    if (!type || !VAR_TYPES.has(type)) continue;
    seen.add(name);
    out.push({ name, type: type as StateVar['type'], initial: asString(item.initial) ?? '' });
  }
  return out;
}

function sanitizeEvents(
  raw: unknown,
  varNames: Set<string>,
  callbackNames: Set<string>,
): BlockEvent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const events: BlockEvent[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const event = asString(item.event);
    if (!event || !EVENT_NAMES.has(event) || !Array.isArray(item.actions)) continue;
    const actions: BlockAction[] = [];
    for (const action of item.actions) {
      if (!isRecord(action)) continue;
      const kind = asString(action.kind);
      if (!kind || !ACTION_KINDS.has(kind)) continue;
      if (kind === 'reset') {
        actions.push({ kind: 'reset' });
        continue;
      }
      const target = asString(action.target);
      if (kind === 'call') {
        // Las props de función se validan contra SU lista, no contra la de
        // variables: son espacios de nombres distintos y cruzarlos dejaría pasar
        // una llamada a algo que el componente no declara recibir.
        if (target && callbackNames.has(target)) actions.push({ kind: 'call', target });
        continue;
      }
      if (!target || !varNames.has(target)) continue;
      if (kind === 'toggle') actions.push({ kind: 'toggle', target });
      else if (kind === 'set') actions.push({ kind: 'set', target, value: asString(action.value) ?? '' });
      else actions.push({ kind: 'increment', target, by: asString(action.by) ?? '1' });
    }
    if (actions.length > 0) events.push({ event: event as BlockEvent['event'], actions });
  }
  return events.length > 0 ? events : undefined;
}

/**
 * Reglas de validación devueltas por la IA. Solo tienen sentido en bloques de
 * campo; un patrón que no compila se descarta aquí para que ni el emisor ni el
 * lienzo tengan que defenderse de él.
 */
function sanitizeValidations(raw: unknown, type: string): ValidationRule[] | undefined {
  if (!VALIDATABLE_TYPES.has(type) || !Array.isArray(raw)) return undefined;
  const out: ValidationRule[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const kind = asString(item.kind);
    if (!kind || !VALIDATION_KINDS.has(kind as ValidationKind)) continue;
    const value = asString(item.value) ?? undefined;
    if (kind === 'pattern' && (!value || !isValidPattern(value))) continue;
    out.push({
      kind: kind as ValidationKind,
      value,
      message: asString(item.message) ?? undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Condición devuelta por la IA, sobre una variable o sobre un campo del modelo.
 *
 * El campo manda sobre la variable cuando vienen los dos, con el mismo criterio
 * que aplica el esquema al evaluarla: si aquí ganara uno y allí el otro, la
 * regla saneada no sería la regla ejecutada.
 */
function sanitizeCondition(
  raw: unknown,
  varNames: Set<string>,
  fieldNames: Set<string>,
): VisibilityRule | undefined {
  if (!isRecord(raw)) return undefined;
  const op = asString(raw.op);
  if (!op || !CONDITION_OPS.has(op as ConditionOp)) return undefined;
  const value = asString(raw.value) ?? '';

  const field = asString(raw.field);
  if (field) {
    return fieldNames.has(field)
      ? { var: '', field, op: op as ConditionOp, value }
      : undefined;
  }

  const varName = asString(raw.var);
  if (!varName || !varNames.has(varName)) return undefined;
  return { var: varName, op: op as ConditionOp, value };
}

function sanitizeStyleRules(
  raw: unknown,
  varNames: Set<string>,
  fieldNames: Set<string>,
): StyleRule[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StyleRule[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const when = sanitizeCondition(item.when, varNames, fieldNames);
    const className = asString(item.className)?.trim();
    if (!when || !className || className.length > MAX_CLASES_CONDICIONALES) continue;
    out.push({ when, className });
  }
  return out.length > 0 ? out : undefined;
}

export function sanitizeTree(raw: unknown, context: TreeContext = {}): SanitizedTree | null {
  if (!isRecord(raw) || !isRecord(raw.blocks) || !Array.isArray(raw.rootIds)) return null;

  const fieldNames = new Set(context.fieldNames ?? []);
  const callbackNames = new Set(context.callbackNames ?? []);

  // Un árbol vacío devuelto a propósito significa «vacía el lienzo», no un
  // fallo de validación: hay que distinguirlo de un árbol con raíces que no
  // sobrevivieron al saneado (eso sí es un descarte).
  const askedForEmpty = raw.rootIds.length === 0;

  const stateVars = sanitizeStateVars(raw.stateVars);
  const varNames = new Set(stateVars.map((v) => v.name));

  // Primera pasada: bloques individuales válidos, con la clave del mapa como id.
  const blocks: Record<string, BuilderBlock> = {};
  for (const [id, value] of Object.entries(raw.blocks)) {
    if (!id || !isRecord(value)) continue;
    const type = asString(value.type);
    if (!type || !KNOWN_TYPES.has(type)) continue;

    // Las props se completan con las del bloque en la paleta.
    //
    // El esquema no tiene valores de reserva para casi nada (`schema.ts` hace
    // `p.className || ''`), así que una prop que la IA omita —o que se caiga
    // aquí por no ser una cadena, p. ej. `rows` enviado como array— dejaba el
    // bloque desnudo: un `button` sin `className` se renderizaba como botón
    // nativo del navegador en vez de con el estilo de la paleta.
    //
    // Solo se rellenan las AUSENTES: una cadena vacía es una decisión explícita
    // («quítale el estilo a este bloque») y debe ganar al valor por defecto.
    const props: Record<string, string> = { ...getDefinition(type as BlockType).defaultProps };
    if (isRecord(value.props)) {
      for (const [key, propValue] of Object.entries(value.props)) {
        const coerced = asString(propValue);
        if (coerced !== null) props[key] = coerced;
      }
    }

    const children = Array.isArray(value.children)
      ? value.children.filter((c): c is string => typeof c === 'string')
      : [];

    blocks[id] = {
      id,
      type: type as BlockType,
      props,
      children,
      events: sanitizeEvents(value.events, varNames, callbackNames),
      visibleIf: sanitizeCondition(value.visibleIf, varNames, fieldNames),
      validations: sanitizeValidations(value.validations, type),
      styleRules: sanitizeStyleRules(value.styleRules, varNames, fieldNames),
    };
  }

  // Segunda pasada: solo se conserva lo alcanzable desde las raíces, cortando
  // referencias a bloques inexistentes y ciclos (un bloque no puede ser su
  // propio ancestro ni aparecer dos veces en el árbol).
  const kept: Record<string, BuilderBlock> = {};
  const placed = new Set<string>();

  function visit(id: string, ancestors: Set<string>): boolean {
    const block = blocks[id];
    if (!block || placed.has(id) || ancestors.has(id)) return false;
    placed.add(id);
    const nextAncestors = new Set(ancestors).add(id);
    const children = block.children.filter((childId) => visit(childId, nextAncestors));
    kept[id] = { ...block, children };
    return true;
  }

  const rootIds = raw.rootIds
    .filter((id): id is string => typeof id === 'string')
    .filter((id) => visit(id, new Set()));

  if (rootIds.length === 0 && !askedForEmpty) return null;

  return { blocks: normalizePositionFrames(kept), rootIds, stateVars };
}

/**
 * Todo bloque fuera del flujo se coloca respecto a SU CONTENEDOR.
 *
 * Un elemento absoluto se mide contra el ancestro posicionado más cercano, y si
 * ninguno lo está se escapa hasta la raíz del componente. En el lienzo eso no
 * se nota —el envoltorio de edición del contenedor siempre está posicionado, así
 * que hace de marco de referencia por accidente— pero en el código exportado no
 * hay envoltorios: el mismo bloque aparecía en un sitio al editarlo y en otro
 * distinto al usarlo.
 *
 * `SET_FREE_POSITION` ya marcaba el contenedor al sacar un bloque del flujo con
 * el ratón, pero esa no es la única puerta de entrada: el asistente escribe
 * `className` libremente y el panel tiene un campo de clases en crudo. La regla
 * se aplica aquí, sobre el árbol entero, para que valga por todas.
 */
export function normalizePositionFrames(
  blocks: Record<string, BuilderBlock>,
): Record<string, BuilderBlock> {
  const parentOf = new Map<string, string>();
  for (const block of Object.values(blocks)) {
    for (const childId of block.children) parentOf.set(childId, block.id);
  }

  let out = blocks;
  for (const block of Object.values(blocks)) {
    if (!isOutOfFlow(block.props.className || '')) continue;
    const parentId = parentOf.get(block.id);
    // Sin contenedor el marco es la raíz del componente, que el emisor ya emite
    // posicionada (`ROOT_LAYOUT`): no hay nada que marcar.
    if (!parentId) continue;

    const parent = out[parentId];
    const parentCls = parent.props.className || '';
    if (parentCls.split(/\s+/).some((c) => POSITIONED.test(c))) continue;

    if (out === blocks) out = { ...blocks };
    out[parentId] = {
      ...parent,
      props: { ...parent.props, className: `${parentCls} relative`.trim() },
    };
  }
  return out;
}

/** Posiciones que convierten a un elemento en marco de referencia de sus hijos. */
const POSITIONED = /^(relative|absolute|fixed|sticky)$/;
