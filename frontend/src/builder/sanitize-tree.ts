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
import { isValidVarName, type BlockAction, type BlockEvent, type StateVar, type VisibilityRule } from './actions';

export interface SanitizedTree {
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  stateVars: StateVar[];
}

const KNOWN_TYPES = new Set(BLOCK_DEFINITIONS.map((d) => d.type as string));
const EVENT_NAMES = new Set(['click', 'change', 'submit']);
const ACTION_KINDS = new Set(['toggle', 'set', 'increment', 'reset']);
const VAR_TYPES = new Set(['boolean', 'number', 'string']);

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

function sanitizeEvents(raw: unknown, varNames: Set<string>): BlockEvent[] | undefined {
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
      if (!target || !varNames.has(target)) continue;
      if (kind === 'toggle') actions.push({ kind: 'toggle', target });
      else if (kind === 'set') actions.push({ kind: 'set', target, value: asString(action.value) ?? '' });
      else actions.push({ kind: 'increment', target, by: asString(action.by) ?? '1' });
    }
    if (actions.length > 0) events.push({ event: event as BlockEvent['event'], actions });
  }
  return events.length > 0 ? events : undefined;
}

function sanitizeVisibleIf(raw: unknown, varNames: Set<string>): VisibilityRule | undefined {
  if (!isRecord(raw)) return undefined;
  const varName = asString(raw.var);
  const op = asString(raw.op);
  if (!varName || !varNames.has(varName)) return undefined;
  if (op !== 'is' && op !== 'not') return undefined;
  return { var: varName, op, value: asString(raw.value) ?? '' };
}

export function sanitizeTree(raw: unknown): SanitizedTree | null {
  if (!isRecord(raw) || !isRecord(raw.blocks) || !Array.isArray(raw.rootIds)) return null;

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
      events: sanitizeEvents(value.events, varNames),
      visibleIf: sanitizeVisibleIf(value.visibleIf, varNames),
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

  return { blocks: kept, rootIds, stateVars };
}
