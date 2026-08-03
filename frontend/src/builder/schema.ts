/**
 * Esquema de bloques: la única definición de qué markup produce cada tipo.
 *
 * `buildNode()` traduce un `BuilderBlock` al árbol `UiNode` de `ui-node.ts`.
 * De ahí beben tanto el lienzo como los emisores de código, de modo que lo que
 * el usuario ve y lo que exporta no pueden divergir.
 *
 * Los afordances de edición (etiqueta del bloque, borde punteado, zona de
 * soltar, «Arrastra componentes aquí») NO viven aquí: son cosa del lienzo. Este
 * módulo produce markup limpio, listo para exportar.
 *
 * Interactividad: los bloques con estado natural (tabs, accordion, paginación,
 * stepper, switch, rating, slider, dropdown, popover, collapse, calendario)
 * son interactivos por defecto: si no están enlazados a una variable declarada
 * vía `bindTo`, sintetizan una variable *implícita* propia —nombre estable
 * derivado del id del bloque— que los emisores declaran como estado local y el
 * lienzo siembra en su runtime. Un tab que cambia o un dropdown que se abre no
 * es comportamiento oculto: es lo que ese bloque *es*. `bindTo` sigue teniendo
 * prioridad para compartir estado entre bloques.
 */

import type { BuilderBlock } from './types';
import type { BlockAction, StateVar, StateVarType, ValidationRule } from './actions';
import {
  EVENT_ATTR, WHOLE_BLOCK_EVENTS, actionStatements, effectiveRules, evalVisibility,
  eventHandler, runActions, runValidation, setterName, validatorCode, validatorName,
  visibilityPreview, visibilityTest,
} from './actions';
import {
  bind, csv, cx, el, expr, int, on, onStmts, pairs, slot, txt, when,
  type Attr, type Runtime, type UiNode,
} from './ui-node';

/** Lee una variable del runtime con un valor por defecto tipado. */
function num(rt: Runtime, name: string, fallback: number): number {
  const v = rt.get(name);
  return typeof v === 'number' ? v : fallback;
}

export interface SchemaCtx {
  /** Variables de estado declaradas en el lienzo. */
  vars: StateVar[];
  /**
   * Recolector de variables implícitas. El esquema lo invoca al sintetizar el
   * estado propio de un bloque no enlazado; quien construye el árbol completo
   * (emisores, runtime del lienzo) lo usa para saber qué debe declarar/sembrar.
   */
  collect?: (v: StateVar) => void;
  /**
   * Árbol completo de bloques. Lo necesita el envío de un formulario con campos
   * validados: el manejador debe validar a sus descendientes antes de ejecutar
   * las acciones, y para encontrarlos hay que poder recorrer el árbol.
   *
   * Es OBLIGATORIO a propósito. Cuando era opcional, el lienzo dejó de pasarlo
   * y nadie se enteró: compilaba, el emisor seguía validando y el canvas
   * enviaba el formulario sin comprobar nada — justo la divergencia entre
   * generador e intérprete que este esquema único existe para impedir. Que
   * falte tiene que ser un error de tipos, no un fallo silencioso.
   */
  blocks: Record<string, BuilderBlock>;
  /**
   * Recolector de funciones auxiliares (validadores de campo). El emisor las
   * declara una vez como constantes de módulo; el lienzo no lo usa, porque su
   * gemelo es `runValidation` ejecutado en los cierres `live`.
   */
  collectHelper?: (name: string, code: string) => void;
}

/**
 * Variable implícita de un bloque interactivo sin `bindTo`.
 *
 * El nombre sale del id del bloque (`block-12` → `tab12`), así que es estable
 * entre renders y entre los tres consumidores del esquema (lienzo, emisor de
 * verificación y paquete), que es lo que permite que el estado se declare en un
 * sitio y se use en otro sin coordinarse.
 */
function implicitVar(
  block: BuilderBlock,
  ctx: SchemaCtx,
  base: string,
  type: StateVarType,
  initial: string,
): StateVar {
  const suffix = block.id.replace(/\D+/g, '') || block.id.replace(/[^A-Za-z0-9]+/g, '');
  let name = `${base}${suffix}`;
  // Colisión con una variable del usuario: se esquiva de forma determinista.
  while (ctx.vars.some((v) => v.name === name)) name = `${name}x`;
  const v: StateVar = { name, type, initial };
  ctx.collect?.(v);
  return v;
}

/**
 * Variables implícitas de todo el árbol, en orden de recorrido.
 *
 * Los emisores las declaran como `useState` y el lienzo las siembra en su
 * runtime; sin esto, el código emitido referenciaría estado inexistente.
 */
export function collectImplicitVars(
  blocks: Record<string, BuilderBlock>,
  rootIds: string[],
  vars: StateVar[],
): StateVar[] {
  const out: StateVar[] = [];
  const seen = new Set<string>();
  const ctx: SchemaCtx = {
    vars,
    blocks,
    collect: (v) => {
      if (!seen.has(v.name)) {
        seen.add(v.name);
        out.push(v);
      }
    },
  };
  const visit = (id: string) => {
    const block = blocks[id];
    if (!block) return;
    buildNode(block, ctx);
    block.children.forEach(visit);
  };
  rootIds.forEach(visit);
  return out;
}

/** Tipos que aceptan bloques hijos. */
export const CONTAINER_TYPES = new Set([
  'div', 'section', 'header', 'footer', 'main', 'aside', 'article', 'nav-html',
  'form', 'card', 'modal', 'drawer', 'collapse', 'fieldset', 'navbar', 'sidebar',
  'grid', 'flex',
]);

export function isContainer(type: string): boolean {
  return CONTAINER_TYPES.has(type);
}

/** Tipos que admiten enlace a una variable de estado vía la prop `bindTo`. */
export const BINDABLE_TYPES = new Set([
  'tabs', 'accordion', 'pagination', 'stepper', 'switch', 'rating',
  'input', 'textarea', 'select', 'checkbox', 'date-picker',
]);

/** Tipo de variable que espera cada bloque enlazable. */
export const BINDABLE_VAR_TYPE: Record<string, StateVarType> = {
  tabs: 'number', accordion: 'number', pagination: 'number', stepper: 'number',
  rating: 'number', switch: 'boolean', checkbox: 'boolean',
  input: 'string', textarea: 'string', select: 'string', 'date-picker': 'string',
};

/** Bloques de campo que admiten reglas de validación. */
export const VALIDATABLE_TYPES = new Set([
  'input', 'textarea', 'select', 'checkbox', 'date-picker',
]);

/**
 * Cómo sintetiza cada tipo de campo su variable de valor implícita. La tabla es
 * la misma para el bloque que se construye y para el formulario que lo valida
 * al enviarse, así que ambos derivan nombres idénticos sin coordinarse.
 */
const FIELD_SPECS: Record<string, (p: Record<string, string>) => {
  type: StateVarType; base: string; initial: string;
}> = {
  input: () => ({ type: 'string', base: 'campo', initial: '' }),
  textarea: () => ({ type: 'string', base: 'campo', initial: '' }),
  select: () => ({ type: 'string', base: 'opcion', initial: '' }),
  'date-picker': () => ({ type: 'string', base: 'fecha', initial: '' }),
  checkbox: (p) => ({ type: 'boolean', base: 'marcado', initial: p.checked === 'true' ? 'true' : 'false' }),
};

/** Etiquetas que deben recibir los manejadores de evento del bloque. */
const INTERACTIVE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'form', 'a']);

/** Etiqueta HTML real de cada contenedor. */
const CONTAINER_TAGS: Record<string, string> = {
  'nav-html': 'nav', form: 'form', header: 'header', footer: 'footer',
  main: 'main', aside: 'aside', section: 'section', article: 'article',
  fieldset: 'fieldset', navbar: 'nav', sidebar: 'aside',
};

const LABEL_CLS = 'block text-sm font-medium text-[color:var(--vz-texto)] mb-1';
const FIELD_CLS =
  'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm shadow-sm ' +
  'focus:ring-2 focus:ring-[color:var(--vz-primario)]/20 focus:border-[color:var(--vz-primario)] outline-none transition-colors';

/**
 * Construye el árbol de un bloque, ya con eventos y visibilidad aplicados.
 */
/**
 * Utilidades que describen **al bloque dentro de su hueco**, no a su contenido:
 * tamaño, posición, margen y su comportamiento como hijo de un flex o un grid.
 *
 * Se distinguen porque tienen que acabar en el elemento MÁS EXTERNO del bloque,
 * y no todos los tipos ponen ahí su `className`: un `input` con etiqueta se
 * envuelve en un `div`, así que un `w-full` escrito por el usuario estiraba el
 * campo pero no el bloque, y un `absolute` habría posicionado el control dentro
 * de su propio envoltorio en vez de en el contenedor. Al izarlas en `buildNode`
 * —el único punto de entrada del esquema— el tamaño y la posición se comportan
 * igual en los 85 tipos sin tocar ninguno de ellos.
 */
const LAYOUT_UTILITY = new RegExp(
  '^(?:' +
  // Tamaño
  '(?:min-|max-)?[wh]-|size-|aspect-|' +
  // Posición y apilamiento
  'static$|relative$|absolute$|fixed$|sticky$|' +
  '(?:top|right|bottom|left|inset|inset-x|inset-y)-|z-|' +
  // Margen (espacio exterior del bloque)
  'm[xytrbl]?-|' +
  // Comportamiento como hijo de un flex o un grid
  'flex-(?:1|auto|initial|none)$|grow(?:-0)?$|shrink(?:-0)?$|basis-|' +
  'self-|order-|(?:col|row)-(?:span|start|end)-' +
  ')',
);

/** Separa las utilidades de hueco del resto del `className`. */
export function splitLayoutClasses(className: string): { layout: string; rest: string } {
  const layout: string[] = [];
  const rest: string[] = [];
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    // Las variantes (`md:`, `hover:`) no cambian a qué elemento pertenece la
    // clase: se mira la utilidad que hay detrás del último dos puntos.
    const bracket = cls.indexOf('[');
    const head = bracket === -1 ? cls : cls.slice(0, bracket);
    const idx = head.lastIndexOf(':');
    const bare = idx === -1 ? cls : cls.slice(idx + 1);
    (LAYOUT_UTILITY.test(bare) ? layout : rest).push(cls);
  }
  return { layout: layout.join(' '), rest: rest.join(' ') };
}

/** Añade clases al elemento más externo del nodo. */
function addRootClasses(node: UiNode, extra: string): UiNode {
  if (!extra) return node;

  if (node.kind === 'when') {
    // La condición envuelve al bloque: las clases van dentro, al elemento real.
    return { ...node, children: node.children.map((c) => addRootClasses(c, extra)) };
  }
  if (node.kind !== 'el') return node;

  const current = node.attrs.className;
  if (!current) {
    return { ...node, attrs: { ...node.attrs, className: { kind: 'static', value: extra } } };
  }
  if (current.kind === 'static') {
    return {
      ...node,
      attrs: { ...node.attrs, className: { kind: 'static', value: cx(current.value, extra) } },
    };
  }
  if (current.kind === 'expr') {
    // Raíz con clase calculada: se concatena conservando la expresión.
    const live = current.live;
    return {
      ...node,
      attrs: {
        ...node.attrs,
        className: {
          kind: 'expr',
          code: `${JSON.stringify(extra + ' ')} + (${current.code})`,
          preview: cx(extra, current.preview),
          live: live ? (rt) => cx(extra, live(rt)) : undefined,
        },
      },
    };
  }
  return node;
}

export function buildNode(block: BuilderBlock, ctx: SchemaCtx): UiNode {
  // Tamaño, posición y margen se apartan antes de construir y se devuelven a la
  // raíz después: así llegan al elemento correcto sea cual sea el tipo.
  const { layout, rest } = splitLayoutClasses(block.props.className ?? '');
  const inner = layout
    ? { ...block, props: { ...block.props, className: rest } }
    : block;

  let node = buildBase(inner, ctx);
  node = attachEvents(node, inner, ctx);
  node = addRootClasses(node, layout);

  if (block.visibleIf) {
    const rule = block.visibleIf;
    const test = visibilityTest(rule, ctx.vars);
    // Una regla que apunta a una variable borrada se ignora en vez de romper.
    if (test) {
      return when(test, visibilityPreview(rule, ctx.vars), [node],
        (rt) => evalVisibility(rule, ctx.vars, rt));
    }
  }
  return node;
}

/** Cuelga los manejadores del bloque donde corresponda a cada evento. */
function attachEvents(node: UiNode, block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const events = block.events ?? [];
  const validated = block.type === 'form' ? collectValidatedFields(block, ctx) : [];

  if (events.length === 0 && validated.length === 0) return node;

  const primary = findPrimary(node) ?? (node.kind === 'el' ? node : null);
  const root = node.kind === 'el' ? node : primary;

  // Un formulario con campos validados intercepta el envío aunque el usuario no
  // haya declarado acciones: sin manejador, el navegador recargaría la página y
  // los mensajes de error no llegarían a verse.
  if (validated.length > 0 && primary?.kind === 'el') {
    const submitActions = events.find((e) => e.event === 'submit')?.actions ?? [];
    primary.attrs.onSubmit = formSubmitHandler(validated, submitActions, ctx);
  }

  for (const event of block.events ?? []) {
    // Los eventos de ratón describen al bloque entero; el resto, a su control.
    const target = WHOLE_BLOCK_EVENTS.has(event.event) ? root : primary;
    if (!target || target.kind !== 'el') continue;

    const attrName = EVENT_ATTR[event.event];
    const existing = target.attrs[attrName];

    if (existing) {
      // El elemento ya trae un manejador propio (el enlace de un campo, el
      // envío validado). Si se construyó por sentencias, las acciones del
      // usuario se le añaden detrás; si no, las del usuario ceden: pisar el
      // enlace dejaría el control roto, que es peor que ignorar una acción.
      if (existing.kind === 'event' && existing.stmts) {
        const stmts = actionStatements(event.actions, ctx.vars);
        if (stmts.length > 0) {
          const previous = existing.run;
          target.attrs[attrName] = onStmts(
            existing.param ?? '',
            [...existing.stmts, ...stmts],
            (rt, payload) => {
              previous?.(rt, payload);
              runActions(event.actions, ctx.vars, rt);
            },
          );
        }
      }
      continue;
    }

    const handler = eventHandler(event, ctx.vars);
    if (handler) {
      target.attrs[attrName] = on(handler,
        (rt) => runActions(event.actions, ctx.vars, rt));
    }
  }
  return node;
}

/**
 * Primer elemento interactivo del árbol. Importa porque bloques como `input`
 * se envuelven en un `div` con su etiqueta: un `onChange` debe ir al `input`,
 * no al `div` que lo contiene.
 */
function findPrimary(node: UiNode): UiNode | null {
  if (node.kind === 'el') {
    if (INTERACTIVE_TAGS.has(node.tag)) return node;
    for (const child of node.children) {
      const found = findPrimary(child);
      if (found) return found;
    }
  } else if (node.kind === 'when') {
    for (const child of node.children) {
      const found = findPrimary(child);
      if (found) return found;
    }
  }
  return null;
}

/** Variable enlazada por `bindTo`, si existe. */
function boundVar(block: BuilderBlock, ctx: SchemaCtx): StateVar | null {
  const name = block.props.bindTo;
  if (!name) return null;
  return ctx.vars.find((v) => v.name === name) ?? null;
}

/** Campo con etiqueta opcional encima. */
function labelled(label: string | undefined, control: UiNode): UiNode {
  if (!label) return control;
  return el('div', null, [el('label', LABEL_CLS, [txt(label)]), control]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Campos con valor y validación
// ─────────────────────────────────────────────────────────────────────────────

/** Enlace de un campo: su variable de valor y, si tiene reglas, la de error. */
interface FieldBinding {
  v: StateVar;
  err: StateVar | null;
  rules: ValidationRule[];
  /** Nombre del validador emitido; `''` si el campo no tiene reglas. */
  validator: string;
}

/**
 * Resuelve el enlace de un bloque de campo.
 *
 * Un campo se vuelve controlado en dos situaciones: cuando el usuario lo enlaza
 * a una variable (`bindTo` de tipo compatible) o cuando tiene reglas de
 * validación —validar exige conocer el valor—. Sin ninguna de las dos, el campo
 * queda como siempre: markup sin estado.
 */
function fieldBinding(block: BuilderBlock, ctx: SchemaCtx): FieldBinding | null {
  const spec = FIELD_SPECS[block.type];
  if (!spec) return null;

  const opts = spec(block.props);
  const rules = effectiveRules(block.validations ?? []);
  const bound = boundVar(block, ctx);
  const usable = bound && bound.type === opts.type ? bound : null;
  if (!usable && rules.length === 0) return null;

  const v = usable ?? implicitVar(block, ctx, opts.base, opts.type, opts.initial);
  if (rules.length === 0) return { v, err: null, rules, validator: '' };

  const err = implicitVar(block, ctx, 'error', 'string', '');
  const validator = validatorName(v.name);
  ctx.collectHelper?.(validator, validatorCode(validator, rules, opts.type === 'boolean'));
  return { v, err, rules, validator };
}

const asStr = (value: unknown) => (value == null ? '' : String(value));

/** `className` del control, con el borde de error cuando hay mensaje. */
function fieldClass(base: string, fb: FieldBinding): Attr | string {
  if (!fb.err) return base;
  const err = fb.err.name;
  return bind(
    `\`${base}\${${err} !== '' ? ' border-red-500' : ''}\``,
    base,
    (rt) => cx(base, rt.get(err) ? 'border-red-500' : false),
  );
}

/**
 * Manejador de cambio del campo: guarda el valor y, si ya se estaba mostrando
 * un error, lo recalcula — así el mensaje desaparece en cuanto el usuario lo
 * corrige, pero no aparece mientras todavía está escribiendo por primera vez.
 */
function fieldChangeHandler(fb: FieldBinding): Attr {
  const set = setterName(fb.v.name);
  const boolField = fb.v.type === 'boolean';
  const valueExpr = boolField ? 'e.target.checked' : 'e.target.value';
  const param = boolField
    ? 'e: { target: { checked: boolean } }'
    : 'e: { target: { value: string } }';

  const stmts = [`${set}(${valueExpr});`];
  if (fb.err) {
    stmts.push(
      `${setterName(fb.err.name)}((previo) => (previo ? ${fb.validator}(${valueExpr}) : previo));`,
    );
  }

  const { rules } = fb;
  const varName = fb.v.name;
  const errName = fb.err?.name;
  return onStmts(param, stmts, (rt, payload) => {
    // El lienzo no recibe `checked` en el payload: un checkbox vivo se invierte.
    const value = boolField ? !rt.get(varName) : asStr(payload);
    rt.set(varName, value);
    if (errName && rt.get(errName)) rt.set(errName, runValidation(rules, value));
  });
}

/** Al salir del campo se valida: es el primer momento honesto para avisar. */
function fieldBlurHandler(fb: FieldBinding): Attr | null {
  if (!fb.err) return null;
  const err = fb.err.name;
  const { rules } = fb;
  const varName = fb.v.name;
  return onStmts('', [`${setterName(err)}(${fb.validator}(${varName}));`],
    (rt) => rt.set(err, runValidation(rules, rt.get(varName))));
}

/** `aria-invalid` vivo, para que el estado de error sea perceptible sin ver color. */
function fieldAriaInvalid(fb: FieldBinding): Attr | null {
  if (!fb.err) return null;
  const err = fb.err.name;
  return bind(`${err} !== ''`, 'false', (rt) => (rt.get(err) ? 'true' : 'false'));
}

/** Envuelve el control con su mensaje de error debajo. */
function withFieldError(fb: FieldBinding, control: UiNode): UiNode {
  if (!fb.err) return control;
  const err = fb.err.name;
  return el('div', null, [
    control,
    when(`${err} !== ''`, false, [
      el('p', 'mt-1 text-xs text-red-600', [expr(err, '', (rt) => asStr(rt.get(err)))]),
    ], (rt) => Boolean(rt.get(err))),
  ]);
}

/** Campos validados que descienden de un formulario. */
function collectValidatedFields(block: BuilderBlock, ctx: SchemaCtx): FieldBinding[] {
  const blocks = ctx.blocks;
  const out: FieldBinding[] = [];
  const visit = (id: string) => {
    const child = blocks[id];
    if (!child) return;
    const fb = fieldBinding(child, ctx);
    if (fb?.err) out.push(fb);
    child.children.forEach(visit);
  };
  block.children.forEach(visit);
  return out;
}

/**
 * Manejador de envío de un formulario con campos validados: valida todo, pinta
 * los mensajes y solo si no hay ninguno ejecuta las acciones del usuario.
 *
 * Se construye con `on` (sin sentencias componibles) a propósito: las acciones
 * de `submit` del usuario ya van incluidas aquí, y si el atributo se anunciara
 * componible, `attachEvents` las añadiría por segunda vez.
 */
function formSubmitHandler(
  fields: FieldBinding[],
  actions: BlockAction[],
  ctx: SchemaCtx,
): Attr {
  const stmts = actionStatements(actions, ctx.vars);
  const list = ctx.vars.some((v) => v.name === 'mensajes') ? 'mensajesDeValidacion' : 'mensajes';

  const checks = fields.map((f) => `${f.validator}(${f.v.name})`);
  const sets = fields.map((f, i) => `${setterName(f.err!.name)}(${list}[${i}]);`);

  // Indentación pensada para su destino: el emisor extrae los manejadores
  // multilínea como `const` dentro del componente (dos espacios de base).
  const code = [
    '(e: { preventDefault: () => void }) => {',
    '    e.preventDefault();',
    `    const ${list} = [${checks.join(', ')}];`,
    `    ${sets.join(' ')}`,
    `    if (${list}.some((mensaje) => mensaje !== '')) return;`,
    ...(stmts.length > 0 ? [`    ${stmts.join(' ')}`] : []),
    '  }',
  ].join('\n');

  return on(code, (rt) => {
    const mensajes = fields.map((f) => runValidation(f.rules, rt.get(f.v.name)));
    fields.forEach((f, i) => rt.set(f.err!.name, mensajes[i]));
    if (mensajes.some((m) => m !== '')) return;
    runActions(actions, ctx.vars, rt);
  });
}

function buildBase(block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const p = block.props;
  const cls = p.className || '';
  const t = block.type;

  if (isContainer(t)) return buildContainer(block, ctx);

  switch (t) {
    // ── Texto ──
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return el(t, cls, [txt(p.text || '')]);
    case 'p': return el('p', cls, [txt(p.text || '')]);
    case 'span': return el('span', cls, [txt(p.text || '')]);
    case 'strong': return el('strong', cls || 'font-bold', [txt(p.text || '')]);
    case 'em': return el('em', cls || 'italic', [txt(p.text || '')]);
    case 'code': return el('code', cls, [txt(p.text || '')]);
    case 'pre': return el('pre', cls, [txt(p.text || '')]);
    case 'blockquote': return el('blockquote', cls, [txt(p.text || '')]);
    case 'a': return el('a', cls, [txt(p.text || 'Enlace')], { href: p.href || '#' });
    case 'hr': return el('hr', cls || 'border-t border-[color:var(--vz-borde)] my-4');
    case 'label': return el('label', cls, [txt(p.text || '')]);

    // ── Formulario ──
    case 'button':
      // `submit` solo si se pide: un botón que envía sin que nadie lo haya
      // decidido dispararía el formulario entero al pulsarlo.
      return el('button', cls, [txt(p.text || 'Botón')], {
        type: p.buttonType === 'submit' ? 'submit' : 'button',
      });
    case 'input': {
      const fb = fieldBinding(block, ctx);
      const base = cls || FIELD_CLS;
      if (!fb) {
        return labelled(p.label, el('input', base, [], {
          type: p.inputType || 'text',
          placeholder: p.placeholder,
        }));
      }
      return labelled(p.label, withFieldError(fb, el('input', null, [], {
        type: p.inputType || 'text',
        placeholder: p.placeholder,
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })));
    }
    case 'textarea': {
      const fb = fieldBinding(block, ctx);
      const base = cls || FIELD_CLS;
      const rows = bind(String(int(p.rows, 3)), String(int(p.rows, 3)));
      if (!fb) {
        return labelled(p.label, el('textarea', base, [], {
          placeholder: p.placeholder,
          rows,
        }));
      }
      return labelled(p.label, withFieldError(fb, el('textarea', null, [], {
        placeholder: p.placeholder,
        rows,
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })));
    }
    case 'select': {
      const fb = fieldBinding(block, ctx);
      const base = cls || FIELD_CLS;
      const options = csv(p.options).map((o) => el('option', null, [txt(o)]));
      if (!fb) return labelled(p.label, el('select', base, options));
      // Controlado con valor inicial vacío: hace falta una opción que lo
      // represente, o el desplegable mostraría en blanco sin explicación.
      const placeholder = el('option', null, [txt(p.placeholder || 'Selecciona una opción')], {
        value: { kind: 'static', value: '' } as Attr,
        disabled: bind('true', 'true'),
      });
      return labelled(p.label, withFieldError(fb, el('select', null, [placeholder, ...options], {
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })));
    }
    case 'checkbox': {
      const fb = fieldBinding(block, ctx);
      const boxCls = 'rounded border-[color:var(--vz-borde)] w-4 h-4 text-[color:var(--vz-primario)] focus:ring-[color:var(--vz-primario)]/20';
      const wrap = cx('flex items-center gap-2.5 text-sm cursor-pointer', cls);
      if (!fb) {
        return el('label', wrap, [
          el('input', boxCls, [], { type: 'checkbox' }),
          txt(p.label || ''),
        ]);
      }
      return withFieldError(fb, el('label', wrap, [
        el('input', boxCls, [], {
          type: 'checkbox',
          checked: bind(fb.v.name, fb.v.initial === 'true' ? 'true' : 'false',
            (rt) => (rt.get(fb.v.name) ? 'true' : 'false')),
          onChange: fieldChangeHandler(fb),
          'aria-invalid': fieldAriaInvalid(fb),
        }),
        txt(p.label || ''),
      ]));
    }
    case 'radio': {
      const options = csv(p.options).length > 0 ? csv(p.options) : ['Opción A', 'Opción B'];
      return el('div', cx('space-y-2.5', cls), [
        ...(p.label ? [el('span', 'block text-sm font-medium text-[color:var(--vz-texto)]', [txt(p.label)])] : []),
        ...options.map((o) => el('label', 'flex items-center gap-2.5 text-sm cursor-pointer', [
          el('input', 'w-4 h-4 text-[color:var(--vz-primario)] border-[color:var(--vz-borde)] focus:ring-[color:var(--vz-primario)]/20', [], {
            type: 'radio', name: p.name || 'grupo',
          }),
          txt(o),
        ])),
      ]);
    }
    case 'switch': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'activo', 'boolean', p.checked !== 'false' ? 'true' : 'false');
      const onCls = 'w-11 h-6 rounded-full relative shadow-inner transition-colors';
      const knob = 'absolute top-0.5 w-5 h-5 bg-[var(--vz-superficie)] rounded-full shadow-md transition-transform';
      const set = setterName(v.name);
      const track = (state: boolean) => cx(onCls, state ? 'bg-[var(--vz-primario)]' : 'bg-slate-300');
      return el('button', cx('flex items-center gap-3 text-sm cursor-pointer', cls), [
        el('span', null, [
          el('span', null, [], {
            className: bind(
              `\`${knob} \${${v.name} ? 'right-0.5' : 'left-0.5'}\``,
              cx(knob, v.initial === 'true' ? 'right-0.5' : 'left-0.5'),
              (rt) => cx(knob, rt.get(v.name) ? 'right-0.5' : 'left-0.5'),
            ),
          }),
        ], {
          className: bind(`\`${onCls} \${${v.name} ? 'bg-[var(--vz-primario)]' : 'bg-slate-300'}\``,
            track(v.initial === 'true'),
            (rt) => track(Boolean(rt.get(v.name)))),
        }),
        txt(p.label || ''),
      ], {
        type: 'button', role: 'switch',
        'aria-checked': bind(String(v.name), v.initial === 'true' ? 'true' : 'false',
          (rt) => String(Boolean(rt.get(v.name)))),
        onClick: on(`() => ${set}((c) => !c)`, (rt) => rt.set(v.name, !rt.get(v.name))),
      });
    }
    case 'slider': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'valor', 'number', p.value || '50');
      const value = expr(v.name, v.initial || '50', (rt) => String(num(rt, v.name, 50)));
      return el('div', cls, [
        ...(p.label ? [el('label', 'block text-sm font-medium text-[color:var(--vz-texto)] mb-1.5', [
          txt(`${p.label}: `), el('span', 'text-[color:var(--vz-primario)] font-semibold', [value]),
        ])] : []),
        el('input', 'w-full accent-blue-600', [], {
          type: 'range', min: p.min || '0', max: p.max || '100',
          value: bind(v.name, v.initial || '50', (rt) => String(num(rt, v.name, 50))),
          // Tipado estructural por el mismo motivo que en `eventHandler`.
          onChange: on(
            `(e: { target: { value: string } }) => ${setterName(v.name)}(Number(e.target.value))`,
            (rt, payload) => rt.set(v.name, Number(payload) || 0),
          ),
        }),
      ]);
    }
    case 'search':
      return el('div', cx('relative', cls), [
        el('svg', 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--vz-texto-suave)]', [
          el('circle', null, [], { cx: '11', cy: '11', r: '8' }),
          el('path', null, [], { d: 'm21 21-4.35-4.35' }),
        ], { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: '2' }),
        el('input', `${FIELD_CLS} pl-10`, [], { type: 'search', placeholder: p.placeholder || 'Buscar...' }),
      ]);
    case 'date-picker': {
      const fb = fieldBinding(block, ctx);
      const base = cls || FIELD_CLS;
      if (!fb) return labelled(p.label, el('input', base, [], { type: 'date' }));
      return labelled(p.label, withFieldError(fb, el('input', null, [], {
        type: 'date',
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })));
    }
    case 'file-upload':
      return el('label', cx('block border-2 border-dashed border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] p-8 text-center hover:border-[color:var(--vz-primario)] hover:bg-blue-50/30 transition-colors cursor-pointer', cls), [
        el('span', 'block text-3xl text-slate-300 mb-2', [txt('⇪')]),
        el('span', 'block text-sm font-medium text-[color:var(--vz-texto-suave)]', [txt(p.text || 'Arrastra archivos aquí')]),
        el('span', 'block text-xs text-[color:var(--vz-texto-suave)] mt-1', [txt(p.accept || 'o haz clic para seleccionar')]),
        el('input', 'sr-only', [], { type: 'file', accept: p.accept }),
      ]);
    case 'rating': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'valoracion', 'number', p.value || '4');
      const max = int(p.max, 5);
      const value = int(v.initial, 4);
      const filled = 'text-amber-400 drop-shadow-sm';
      const emptyCls = 'text-slate-200 hover:text-amber-300';
      return el('div', cx('flex gap-0.5', cls), Array.from({ length: max }, (_, i) => {
        const base = 'text-xl cursor-pointer transition-colors';
        return el('button', null, [txt('★')], {
          type: 'button',
          'aria-label': `${i + 1}`,
          className: bind(`\`${base} \${${v.name} > ${i} ? '${filled}' : '${emptyCls}'}\``,
            cx(base, value > i ? filled : emptyCls),
            (rt) => cx(base, num(rt, v.name, value) > i ? filled : emptyCls)),
          onClick: on(`() => ${setterName(v.name)}(${i + 1})`, (rt) => rt.set(v.name, i + 1)),
        });
      }));
    }
    case 'fieldset': // contenedor, tratado arriba; aquí por exhaustividad del switch
      return buildContainer(block, ctx);

    // ── Media ──
    case 'img':
      return el('img', cls || 'rounded-[var(--vz-radio)] max-w-full', [], { src: p.src, alt: p.alt || '' });
    case 'avatar': {
      const sizes: Record<string, string> = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14' };
      return el('img', cx(sizes[p.size || 'md'], 'rounded-full object-cover', cls), [], {
        src: p.src, alt: p.alt || '',
      });
    }
    case 'video':
      return el('video', cls || 'rounded-[var(--vz-radio)] w-full', [el('source', null, [], { src: p.src })], { controls: bind('true', 'true') });
    case 'audio':
      return el('audio', cls || 'w-full', [el('source', null, [], { src: p.src })], { controls: bind('true', 'true') });
    case 'iframe':
      return el('iframe', cls || 'w-full h-48 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)]', [], { src: p.src || 'about:blank', title: p.alt || 'Contenido embebido' });

    // ── Tablas y listas ──
    case 'table': {
      const rows = int(p.rows, 3), cols = int(p.cols, 3);
      return el('table', cls || 'w-full border-collapse', [
        el('thead', null, [el('tr', null, Array.from({ length: cols }, (_, c) =>
          el('th', 'border border-[color:var(--vz-borde)] px-3 py-2 bg-[var(--vz-superficie-alt)] text-left text-xs font-semibold uppercase text-[color:var(--vz-texto-suave)]', [txt(`Col ${c + 1}`)])))]),
        el('tbody', null, Array.from({ length: rows }, (_, r) =>
          el('tr', r % 2 ? 'bg-[var(--vz-superficie-alt)]/50' : null, Array.from({ length: cols }, (_, c) =>
            el('td', 'border border-[color:var(--vz-borde)] px-3 py-2 text-sm', [txt(`R${r + 1}C${c + 1}`)]))))),
      ]);
    }
    case 'table-ui': {
      const headers = csv(p.headers);
      const rows = csv(p.rows).map((r) => r.split(':').map((c) => c.trim()));
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] overflow-hidden', cls), [
        el('table', 'w-full', [
          el('thead', null, [el('tr', 'bg-[var(--vz-superficie-alt)]', headers.map((h) =>
            el('th', 'px-4 py-3 text-left text-xs font-semibold uppercase text-[color:var(--vz-texto-suave)] border-b', [txt(h)])))]),
          el('tbody', null, rows.map((r) =>
            el('tr', 'border-b last:border-0 hover:bg-[var(--vz-superficie-alt)]', r.map((c) =>
              el('td', 'px-4 py-3 text-sm', [txt(c)]))))),
        ]),
      ]);
    }
    case 'ul':
      return el('ul', cls || 'list-disc list-inside space-y-1', csv(p.items).map((x) => el('li', null, [txt(x)])));
    case 'ol':
      return el('ol', cls || 'list-decimal list-inside space-y-1', csv(p.items).map((x) => el('li', null, [txt(x)])));
    case 'dl':
      return el('dl', cx('space-y-2', cls), pairs(p.items).map(([dt, dd]) =>
        el('div', 'flex gap-2', [
          el('dt', 'font-medium text-sm', [txt(dt)]),
          el('dd', 'text-sm text-[color:var(--vz-texto-suave)]', [txt(dd)]),
        ])));
    case 'list-ui':
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] divide-y', cls), pairs(p.items).map(([name, sub]) =>
        el('div', 'px-4 py-3 flex items-center justify-between hover:bg-[var(--vz-superficie-alt)]', [
          el('div', null, [
            el('p', 'text-sm font-medium', [txt(name)]),
            ...(sub ? [el('p', 'text-xs text-[color:var(--vz-texto-suave)]', [txt(sub)])] : []),
          ]),
          el('span', 'text-[color:var(--vz-texto-suave)] text-xs', [txt('›')]),
        ])));

    // ── Navegación ──
    case 'breadcrumb': {
      const items = csv(p.items);
      return el('nav', cls || 'flex items-center gap-2 text-sm', items.map((x, i) =>
        el('span', i === items.length - 1 ? 'font-medium text-[color:var(--vz-texto)]' : 'text-[color:var(--vz-texto-suave)]', [
          txt(x),
          ...(i < items.length - 1 ? [el('span', 'ml-2 text-slate-300', [txt('/')])] : []),
        ])), { 'aria-label': 'Migas de pan' });
    }
    case 'tabs': {
      const v = boundVar(block, ctx) ?? implicitVar(block, ctx, 'tab', 'number', '0');
      const items = csv(p.items);
      const active = 'text-[color:var(--vz-primario)] border-[color:var(--vz-primario)]';
      const idle = 'text-[color:var(--vz-texto-suave)] border-transparent hover:text-[color:var(--vz-texto)]';
      const base = 'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px';
      const current = int(v.initial, 0);
      return el('div', cls || 'flex border-b', items.map((x, i) =>
        el('button', null, [txt(x)], {
          type: 'button',
          role: 'tab',
          'aria-selected': bind(`${v.name} === ${i}`, current === i ? 'true' : 'false',
            (rt) => String(num(rt, v.name, current) === i)),
          className: bind(`\`${base} \${${v.name} === ${i} ? '${active}' : '${idle}'}\``,
            cx(base, current === i ? active : idle),
            (rt) => cx(base, num(rt, v.name, current) === i ? active : idle)),
          onClick: on(`() => ${setterName(v.name)}(${i})`, (rt) => rt.set(v.name, i)),
        })), { role: 'tablist' });
    }
    case 'pagination': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'pagina', 'number', p.current || '1');
      const pages = int(p.pages, 5);
      const current = int(v.initial, 1);
      const act = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)]';
      const idle = 'text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)]';
      const base = 'px-3 py-1 text-sm rounded';
      const arrow = 'px-2 py-1 text-sm text-[color:var(--vz-texto-suave)] rounded hover:bg-[var(--vz-superficie-alt)]';
      const set = setterName(v.name);
      return el('nav', cls || 'flex items-center gap-1', [
        el('button', arrow, [txt('‹')], {
          type: 'button', 'aria-label': 'Anterior',
          onClick: on(`() => ${set}((n) => Math.max(1, n - 1))`,
            (rt) => rt.set(v.name, Math.max(1, num(rt, v.name, current) - 1))),
        }),
        ...Array.from({ length: pages }, (_, i) => {
          const n = i + 1;
          return el('button', null, [txt(String(n))], {
            type: 'button',
            'aria-current': bind(`${v.name} === ${n} ? 'page' : undefined`, n === current ? 'page' : '',
              (rt) => (num(rt, v.name, current) === n ? 'page' : '')),
            className: bind(`\`${base} \${${v.name} === ${n} ? '${act}' : '${idle}'}\``,
              cx(base, n === current ? act : idle),
              (rt) => cx(base, num(rt, v.name, current) === n ? act : idle)),
            onClick: on(`() => ${set}(${n})`, (rt) => rt.set(v.name, n)),
          });
        }),
        el('button', arrow, [txt('›')], {
          type: 'button', 'aria-label': 'Siguiente',
          onClick: on(`() => ${set}((n) => Math.min(${pages}, n + 1))`,
            (rt) => rt.set(v.name, Math.min(pages, num(rt, v.name, current) + 1))),
        }),
      ], { 'aria-label': 'Paginación' });
    }
    case 'stepper': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'paso', 'number', p.current || '1');
      const items = csv(p.items);
      const current = int(v.initial, 1);
      const done = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)]';
      const pending = 'bg-slate-200 text-[color:var(--vz-texto-suave)] hover:bg-slate-300';
      const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors';
      return el('div', cx('flex items-center gap-2', cls), items.map((x, i) => {
        const circle = el('button', null, [txt(String(i + 1))], {
          type: 'button',
          'aria-label': `Ir al paso ${i + 1}`,
          className: bind(`\`${base} \${${v.name} >= ${i + 1} ? '${done}' : '${pending}'}\``,
            cx(base, current >= i + 1 ? done : pending),
            (rt) => cx(base, num(rt, v.name, current) >= i + 1 ? done : pending)),
          onClick: on(`() => ${setterName(v.name)}(${i + 1})`, (rt) => rt.set(v.name, i + 1)),
        });
        return el('div', 'flex items-center gap-2', [
          circle,
          el('span', 'text-sm', [txt(x)]),
          ...(i < items.length - 1
            ? [el('span', null, [], {
                className: bind(`\`w-8 h-0.5 \${${v.name} > ${i + 1} ? 'bg-[var(--vz-primario)]' : 'bg-slate-200'}\``,
                  cx('w-8 h-0.5', current > i + 1 ? 'bg-[var(--vz-primario)]' : 'bg-slate-200'),
                  (rt) => cx('w-8 h-0.5', num(rt, v.name, current) > i + 1 ? 'bg-[var(--vz-primario)]' : 'bg-slate-200')),
              })]
            : []),
        ]);
      }));
    }
    case 'menu':
      return el('div', cls || 'bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg py-1 w-48', csv(p.items).map((x) =>
        x === '—'
          ? el('hr', 'my-1 border-slate-100')
          : el('div', 'px-3 py-2 text-sm text-[color:var(--vz-texto)] hover:bg-[var(--vz-superficie-alt)] cursor-pointer', [txt(x)])));

    // ── Datos ──
    case 'stat':
      return el('div', cx('bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] p-5 shadow-sm', cls), [
        el('p', 'text-xs font-medium text-[color:var(--vz-texto-suave)] uppercase tracking-wide', [txt(p.label || '')]),
        el('p', 'text-2xl font-bold text-[color:var(--vz-texto)] mt-1.5', [txt(p.value || '0')]),
        ...(p.change ? [el('div', 'flex items-center gap-1.5 mt-2', [
          el('span', cx('inline-block w-2 h-2 rounded-full', p.change.startsWith('+') ? 'bg-[var(--vz-exito)]' : 'bg-[var(--vz-error)]')),
          el('span', cx('text-xs font-medium', p.change.startsWith('+') ? 'text-[color:var(--vz-exito)]' : 'text-[color:var(--vz-error)]'), [txt(p.change)]),
        ])] : []),
      ]);
    case 'badge': {
      const colors: Record<string, string> = {
        blue: 'bg-blue-100 text-[color:var(--vz-primario)]', green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800',
        slate: 'bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)]',
      };
      return el('span', cx('inline-block text-xs font-medium px-2.5 py-0.5 rounded-full',
        colors[p.variant || 'blue'] || colors.blue, cls), [txt(p.text || 'Badge')]);
    }
    case 'tag':
      return el('span', cls || 'inline-flex items-center gap-1 bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)] text-xs font-medium px-2.5 py-1 rounded-[var(--vz-radio)]', [txt(p.text || 'Tag')]);
    case 'tooltip':
      return el('span', cx('underline decoration-dashed decoration-slate-400 cursor-help text-sm', cls),
        [txt(p.text || 'Hover')], { title: p.tooltip });
    case 'timeline': {
      const items = pairs(p.items);
      return el('div', cls, items.map(([title, desc], i) =>
        el('div', 'flex gap-4 relative', [
          el('div', 'flex flex-col items-center', [
            el('div', 'w-3 h-3 rounded-full bg-[var(--vz-primario)] ring-4 ring-blue-100 mt-1 z-10'),
            ...(i < items.length - 1 ? [el('div', 'w-0.5 flex-1 bg-gradient-to-b from-blue-300 to-slate-200')] : []),
          ]),
          el('div', i === items.length - 1 ? '' : 'pb-6', [
            el('p', 'text-sm font-semibold text-[color:var(--vz-texto)]', [txt(title)]),
            el('p', 'text-xs text-[color:var(--vz-texto-suave)] mt-0.5', [txt(desc)]),
          ]),
        ])));
    }
    case 'empty':
      return el('div', cx('text-center py-8', cls), [
        el('div', 'text-4xl mb-3 text-slate-300', [txt('∅')]),
        el('h3', 'text-sm font-medium text-[color:var(--vz-texto-suave)]', [txt(p.title || 'Sin datos')]),
        el('p', 'text-xs text-[color:var(--vz-texto-suave)] mt-1', [txt(p.text || '')]),
      ]);
    case 'calendar': {
      const v = implicitVar(block, ctx, 'dia', 'number', '23');
      const selectedDay = int(v.initial, 23);
      const dayBase = 'py-1.5 rounded-[var(--vz-radio)] text-xs font-medium transition-colors';
      const daySel = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] shadow-sm';
      const dayIdle = 'hover:bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)]';
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] p-4 w-64 shadow-sm bg-[var(--vz-superficie)]', cls), [
        el('div', 'flex justify-between items-center mb-3', [
          el('button', 'w-7 h-7 rounded-[var(--vz-radio)] text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)] flex items-center justify-center text-sm', [txt('‹')], { type: 'button', 'aria-label': 'Mes anterior' }),
          el('span', 'font-semibold text-sm text-[color:var(--vz-texto)]', [txt(p.month || 'Junio 2026')]),
          el('button', 'w-7 h-7 rounded-[var(--vz-radio)] text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)] flex items-center justify-center text-sm', [txt('›')], { type: 'button', 'aria-label': 'Mes siguiente' }),
        ]),
        el('div', 'grid grid-cols-7 gap-0.5 text-center text-xs', [
          ...['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) =>
            el('span', 'font-semibold text-[color:var(--vz-texto-suave)] py-1.5 text-[10px] uppercase', [txt(d)])),
          ...Array.from({ length: 30 }, (_, i) =>
            el('button', null, [txt(String(i + 1))], {
              type: 'button',
              className: bind(`\`${dayBase} \${${v.name} === ${i + 1} ? '${daySel}' : '${dayIdle}'}\``,
                cx(dayBase, selectedDay === i + 1 ? daySel : dayIdle),
                (rt) => cx(dayBase, num(rt, v.name, selectedDay) === i + 1 ? daySel : dayIdle)),
              onClick: on(`() => ${setterName(v.name)}(${i + 1})`, (rt) => rt.set(v.name, i + 1)),
            })),
        ]),
      ]);
    }

    // ── Feedback ──
    case 'alert': {
      const box: Record<string, string> = {
        info: 'bg-blue-50 text-[color:var(--vz-primario)] border-blue-200', success: 'bg-green-50 text-green-800 border-green-200',
        warning: 'bg-amber-50 text-amber-800 border-amber-200', error: 'bg-red-50 text-red-800 border-red-200',
      };
      const icon: Record<string, string> = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };
      const iconBg: Record<string, string> = {
        info: 'bg-blue-200/60 text-[color:var(--vz-primario)]', success: 'bg-green-200/60 text-[color:var(--vz-exito)]',
        warning: 'bg-amber-200/60 text-[color:var(--vz-aviso)]', error: 'bg-red-200/60 text-[color:var(--vz-error)]',
      };
      const v = box[p.variant] ? p.variant : 'info';
      return el('div', cx('flex items-start gap-3 px-4 py-3 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] text-sm', box[v], cls), [
        el('span', cx('flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold', iconBg[v]), [txt(icon[v])]),
        el('span', 'pt-px', [txt(p.text || '')]),
      ], { role: v === 'error' ? 'alert' : 'status' });
    }
    case 'toast': {
      const border: Record<string, string> = {
        success: 'border-green-400', error: 'border-red-400', info: 'border-[color:var(--vz-primario)]',
      };
      const icon: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' };
      const color: Record<string, string> = { success: 'text-green-500', error: 'text-[color:var(--vz-error)]', info: 'text-[color:var(--vz-primario)]' };
      const v = border[p.variant] ? p.variant : 'success';
      return el('div', cx('flex items-center gap-3 border-l-4 bg-[var(--vz-superficie)] px-4 py-3 rounded-r-lg shadow-lg text-sm', border[v], cls), [
        el('span', cx('font-bold', color[v]), [txt(icon[v])]),
        el('span', null, [txt(p.text || '')]),
      ], { role: 'status' });
    }
    case 'progress': {
      const v = boundVar(block, ctx);
      const value = v ? int(v.initial, 0) : int(p.value, 0);
      // El preview de `style` va como texto CSS: el lienzo lo parsea y el
      // emisor usa `code`, que sí es un objeto de estilo de JSX.
      const width = v
        ? bind(`{ width: \`\${${v.name}}%\` }`, `width: ${value}%`,
            (rt) => `width: ${num(rt, v.name, value)}%`)
        : bind(`{ width: '${value}%' }`, `width: ${value}%`);
      return el('div', cls, [
        ...(p.label ? [el('div', 'flex justify-between text-xs text-[color:var(--vz-texto-suave)] mb-1', [
          el('span', null, [txt(p.label)]),
          el('span', null, [
            v
              ? expr(`\`\${${v.name}}%\``, `${value}%`, (rt) => `${num(rt, v.name, value)}%`)
              : txt(`${value}%`),
          ]),
        ])] : []),
        el('div', 'w-full h-2 bg-slate-200 rounded-full overflow-hidden', [
          el('div', 'h-full bg-[var(--vz-primario)] rounded-full transition-all', [], { style: width }),
        ], {
          role: 'progressbar',
          'aria-valuenow': v
            ? bind(v.name, String(value), (rt) => String(num(rt, v.name, value)))
            : bind(String(value), String(value)),
          // React tipa los aria-value* como números, así que van como expresión
          // y no como cadena.
          'aria-valuemin': bind('0', '0'),
          'aria-valuemax': bind('100', '100'),
        }),
      ]);
    }
    case 'spinner': {
      const sizes: Record<string, string> = { sm: 'w-5 h-5 border-2', md: 'w-8 h-8 border-[3px]', lg: 'w-12 h-12 border-4' };
      return el('div', cx(sizes[p.size || 'md'] || sizes.md, 'border-[color:var(--vz-borde)] border-t-blue-600 rounded-full animate-spin', cls),
        [], { role: 'status', 'aria-label': 'Cargando' });
    }
    case 'skeleton':
      return el('div', cx('space-y-3 animate-pulse', cls), Array.from({ length: int(p.lines, 3) }, (_, i) =>
        el('div', cx('h-3 bg-slate-200 rounded', i === 0 ? 'w-3/4' : 'w-full'))), { 'aria-hidden': 'true' });
    case 'result': {
      const variants: Record<string, { color: string; icon: string }> = {
        success: { color: 'text-green-500', icon: '✓' },
        error: { color: 'text-[color:var(--vz-error)]', icon: '✕' },
        info: { color: 'text-[color:var(--vz-primario)]', icon: 'ℹ' },
      };
      const v = variants[p.variant] || variants.success;
      return el('div', cx('text-center py-6', cls), [
        el('div', cx('text-4xl mb-3', v.color), [txt(v.icon)]),
        el('h3', 'text-lg font-semibold', [txt(p.title || '')]),
        el('p', 'text-sm text-[color:var(--vz-texto-suave)] mt-1', [txt(p.text || '')]),
      ]);
    }

    // ── Overlay ──
    case 'popover': {
      const v = implicitVar(block, ctx, 'abierto', 'boolean', 'false');
      const set = setterName(v.name);
      return el('div', cx('relative inline-block', cls), [
        el('button', 'text-sm text-[color:var(--vz-primario)] underline decoration-dashed', [txt(p.text || 'Clic')], {
          type: 'button',
          'aria-expanded': bind(String(v.name), 'false', (rt) => String(Boolean(rt.get(v.name)))),
          onClick: on(`() => ${set}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
        }),
        // Visible en diseño para poder editarlo; en ejecución empieza cerrado.
        when(String(v.name), true, [
          el('div', 'absolute z-10 mt-2 w-56 bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg p-3 text-sm text-[color:var(--vz-texto-suave)]', [txt(p.content || '')]),
        ], (rt) => Boolean(rt.get(v.name))),
      ]);
    }
    case 'dialog':
      return el('div', cx('bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-xl p-6 max-w-sm', cls), [
        el('h3', 'font-semibold', [txt(p.title || '')]),
        el('p', 'text-sm text-[color:var(--vz-texto-suave)] mt-2', [txt(p.text || '')]),
        el('div', 'flex gap-2 mt-4 justify-end', [
          el('button', 'px-3 py-1.5 text-sm border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] hover:bg-[var(--vz-superficie-alt)]', [txt('Cancelar')], { type: 'button' }),
          el('button', 'px-3 py-1.5 text-sm bg-[var(--vz-error)] text-[color:var(--vz-primario-contraste)] rounded-[var(--vz-radio)]', [txt('Confirmar')], { type: 'button' }),
        ]),
      ], { role: 'dialog', 'aria-modal': 'true' });

    // ── Layout ──
    case 'divider':
      return p.text
        ? el('div', cx('flex items-center gap-3', cls), [
            el('hr', 'flex-1 border-[color:var(--vz-borde)]'),
            el('span', 'text-xs text-[color:var(--vz-texto-suave)]', [txt(p.text)]),
            el('hr', 'flex-1 border-[color:var(--vz-borde)]'),
          ])
        : el('hr', cx('border-[color:var(--vz-borde)] my-2', cls));
    case 'spacer':
      return el('div', cls, [], {
        style: bind(`{ height: '${int(p.size, 32)}px' }`, `height: ${int(p.size, 32)}px`),
      });
    case 'accordion': {
      const v = boundVar(block, ctx) ?? implicitVar(block, ctx, 'panel', 'number', '0');
      const items = pairs(p.items);
      const open = int(v.initial, 0);
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] divide-y', cls), items.map(([title, content], i) => {
        const header = el('button', 'w-full flex justify-between items-center px-4 py-3 text-left hover:bg-[var(--vz-superficie-alt)]', [
          el('span', 'text-sm font-medium', [txt(title)]),
          el('span', 'text-[color:var(--vz-texto-suave)] text-xs', [
            expr(`${v.name} === ${i} ? '▾' : '▸'`, open === i ? '▾' : '▸',
              (rt) => (num(rt, v.name, open) === i ? '▾' : '▸')),
          ]),
        ], {
          type: 'button',
          'aria-expanded': bind(`${v.name} === ${i}`, open === i ? 'true' : 'false',
            (rt) => String(num(rt, v.name, open) === i)),
          onClick: on(`() => ${setterName(v.name)}((c) => (c === ${i} ? -1 : ${i}))`,
            (rt) => rt.set(v.name, num(rt, v.name, open) === i ? -1 : i)),
        });
        const body = el('div', 'px-4 pb-3 text-sm text-[color:var(--vz-texto-suave)]', [txt(content)]);
        return el('div', null, [
          header,
          when(`${v.name} === ${i}`, open === i, [body], (rt) => num(rt, v.name, open) === i),
        ]);
      }));
    }

    // ── Acciones ──
    case 'button-group':
      return el('div', cx('inline-flex rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] divide-x', cls), csv(p.items).map((x) =>
        el('button', 'px-4 py-2 text-sm hover:bg-[var(--vz-superficie-alt)] first:rounded-l-lg last:rounded-r-lg', [txt(x)], { type: 'button' })));
    case 'dropdown': {
      const v = implicitVar(block, ctx, 'abierto', 'boolean', 'false');
      const set = setterName(v.name);
      const items = csv(p.items);
      return el('div', 'relative inline-block', [
        el('button', cls || 'flex items-center gap-1 bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm hover:bg-[var(--vz-superficie-alt)]', [
          txt(p.text || 'Opciones'),
          el('span', 'text-[color:var(--vz-texto-suave)] text-xs', [
            expr(`${v.name} ? '▴' : '▾'`, '▾', (rt) => (rt.get(v.name) ? '▴' : '▾')),
          ]),
        ], {
          type: 'button', 'aria-haspopup': 'menu',
          'aria-expanded': bind(String(v.name), 'false', (rt) => String(Boolean(rt.get(v.name)))),
          onClick: on(`() => ${set}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
        }),
        // Cerrado en diseño: el menú desplegado taparía los bloques de debajo.
        when(String(v.name), false, [
          el('div', 'absolute left-0 top-full mt-1 w-44 bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg py-1 z-10', items.map((x) =>
            el('button', 'block w-full text-left px-3 py-2 text-sm text-[color:var(--vz-texto)] hover:bg-[var(--vz-superficie-alt)]', [txt(x)], {
              type: 'button',
              onClick: on(`() => ${set}(false)`, (rt) => rt.set(v.name, false)),
            })), { role: 'menu' }),
        ], (rt) => Boolean(rt.get(v.name))),
      ]);
    }
    case 'fab':
      return el('button', cx('w-12 h-12 bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] rounded-full shadow-lg flex items-center justify-center text-xl hover:opacity-90', cls),
        [txt(p.icon || '+')], { type: 'button' });
    case 'icon-button':
      return el('button', cx('w-9 h-9 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] flex items-center justify-center text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)]', cls),
        [txt(p.icon || '✕')], { type: 'button', 'aria-label': p.label || 'Acción' });
    case 'cta':
      return el('div', cx('bg-gradient-to-r from-blue-600 to-blue-700 rounded-[var(--vz-radio)] p-6 text-[color:var(--vz-primario-contraste)]', cls), [
        el('h3', 'text-lg font-bold', [txt(p.title || '')]),
        el('p', 'text-sm text-blue-100 mt-1', [txt(p.text || '')]),
        el('button', 'mt-4 bg-[var(--vz-superficie)] text-[color:var(--vz-primario)] font-medium px-4 py-2 rounded-[var(--vz-radio)] text-sm', [txt(p.buttonText || 'Acción')], { type: 'button' }),
      ]);

    default:
      // Sin esquema: se marca explícitamente en vez de fingir que exporta bien.
      return el('div', cx('p-2 bg-[var(--vz-superficie-alt)] rounded text-sm text-[color:var(--vz-texto-suave)]', cls), [txt(`Bloque sin esquema: ${t}`)]);
  }
}

/** Contenedores: markup limpio con un `slot` donde van los hijos. */
function buildContainer(block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const p = block.props;
  const t = block.type;
  const tag = CONTAINER_TAGS[t] || 'div';
  let cls = p.className || '';

  if (t === 'grid') cls = cx(`grid grid-cols-${p.cols || 3} gap-${p.gap || 4}`, cls);
  if (t === 'flex') cls = cx(`flex ${p.direction === 'col' ? 'flex-col' : 'flex-row'} gap-${p.gap || 4}`, cls);
  if (t === 'navbar') cls = cx('flex items-center justify-between', cls);
  if (t === 'sidebar') cls = cx('flex flex-col', cls);

  // Collapse con cabecera: la cabecera pliega y despliega el contenido. Sin
  // título no hay dónde pulsar, así que se queda estático como antes.
  if (t === 'collapse' && p.title) {
    const v = implicitVar(block, ctx, 'abierto', 'boolean', 'true');
    const set = setterName(v.name);
    return el('div', cls, [
      el('button', 'w-full px-4 py-3 font-medium text-sm border-b cursor-pointer flex justify-between text-left', [
        el('span', null, [txt(p.title)]),
        el('span', 'text-[color:var(--vz-texto-suave)]', [
          expr(`${v.name} ? '▾' : '▸'`, '▾', (rt) => (rt.get(v.name) ? '▾' : '▸')),
        ]),
      ], {
        type: 'button',
        'aria-expanded': bind(String(v.name), 'true', (rt) => String(Boolean(rt.get(v.name)))),
        onClick: on(`() => ${set}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
      }),
      // El envoltorio evita JSX adyacente inválido cuando hay varios hijos.
      when(String(v.name), true, [el('div', null, [slot()])], (rt) => Boolean(rt.get(v.name))),
    ]);
  }

  const before: UiNode[] = [];
  if (t === 'fieldset' && p.legend) before.push(el('legend', 'text-sm font-medium px-2', [txt(p.legend)]));
  if (t === 'modal' && p.title) before.push(el('h3', 'text-lg font-semibold mb-4', [txt(p.title)]));
  if (t === 'drawer' && p.title) before.push(el('h3', 'text-lg font-semibold mb-4', [txt(p.title)]));
  if (t === 'navbar') {
    if (p.brand) before.push(el('span', 'font-bold text-sm', [txt(p.brand)]));
    if (p.items && block.children.length === 0) {
      before.push(el('div', 'flex gap-4', csv(p.items).map((x) =>
        el('a', 'text-sm text-[color:var(--vz-texto-suave)] hover:text-[color:var(--vz-texto)]', [txt(x)], { href: '#' }))));
    }
  }
  if (t === 'sidebar' && p.items && block.children.length === 0) {
    before.push(el('div', 'space-y-0.5', csv(p.items).map((x, i) =>
      el('div', cx('px-3 py-2 rounded-[var(--vz-radio)] text-sm', i === 0 ? 'bg-slate-800 text-[color:var(--vz-primario-contraste)]' : 'text-[color:var(--vz-texto-suave)] hover:text-[color:var(--vz-primario-contraste)] hover:bg-slate-800'), [txt(x)]))));
  }

  const attrs: Record<string, string> = {};
  if (t === 'modal') { attrs.role = 'dialog'; attrs['aria-modal'] = 'true'; }
  if (t === 'navbar' || t === 'nav-html') attrs['aria-label'] = p.ariaLabel || 'Navegación';

  return el(tag, cls, [...before, slot()], attrs);
}
