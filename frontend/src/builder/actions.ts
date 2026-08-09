/**
 * Modelo declarativo de estado y acciones del builder.
 *
 * El lienzo permitía componer forma pero no comportamiento: todo lo exportado
 * era inerte (botones sin handler, tabs que no cambian, modales que no cierran).
 * Aquí se define un modelo mínimo pero portable:
 *
 *   - `StateVar`: variables de estado local del componente, con tipo y valor
 *     inicial. Viven a nivel de lienzo, no de bloque.
 *   - `BlockAction`: qué le pasa a una variable cuando ocurre un evento.
 *   - `VisibilityRule`: qué condición debe cumplirse para que un bloque exista.
 *
 * Es deliberadamente cerrado —no admite código arbitrario— para que cualquier
 * emisor (React hoy; Vue/Angular después) pueda traducirlo con garantías y para
 * que el sandbox no pueda romperse con expresiones inválidas del usuario.
 */

import type { Runtime } from './ui-node';
import type { DataModel, ModelField } from './data-model';
import { ITEM_PARAM, effectiveFields, hasModel, sampleValue } from './data-model';
import { anot, paramEnvio, type Lang } from './lang';

export type StateVarType = 'boolean' | 'string' | 'number';

export interface StateVar {
  name: string;
  type: StateVarType;
  initial: string;
}

export type BlockAction =
  /** Invierte una variable booleana. */
  | { kind: 'toggle'; target: string }
  /** Asigna un valor literal. */
  | { kind: 'set'; target: string; value: string }
  /** Suma una cantidad (puede ser negativa) a una variable numérica. */
  | { kind: 'increment'; target: string; by: string }
  /** Devuelve todas las variables a su valor inicial. */
  | { kind: 'reset' }
  /**
   * Avisa a la aplicación anfitriona llamando a una de sus props de función.
   *
   * Es la mitad de las reglas de negocio que **no** se puede resolver dentro del
   * componente: «al pulsar Borrar, borra el pedido» depende de una API, de unos
   * permisos y de una confirmación que el componente no conoce ni debe conocer.
   * Lo único que le toca es decir *qué ha pasado*; quién lo recibe decide qué
   * hacer. Por eso `target` nombra un `CallbackProp` y no una variable.
   */
  | { kind: 'call'; target: string };

/**
 * Prop de función que el componente recibe de la aplicación anfitriona.
 *
 * Se declara igual que el estado y el modelo —lista con nombre y forma— para
 * que el contrato del componente esté escrito en un solo sitio y el emisor no
 * tenga que deducirlo del uso.
 */
export interface CallbackProp {
  /** Nombre de la prop (`onSelect`). Es también el identificador emitido. */
  name: string;
  /**
   * Si recibe el elemento actual del repetidor.
   *
   * Sin él, «al pulsar el botón de la fila, avisa» no serviría de nada: quien
   * escucha necesita saber de *qué* fila. Solo tiene sentido dentro de un
   * repetidor, y el esquema degrada a una llamada sin argumentos fuera de uno
   * antes que emitir un `item` que allí no existe.
   */
  passesItem: boolean;
}

/** `onSelect` es válido; `borrar` no. La convención hace legible el contrato. */
export function isValidCallbackName(name: string): boolean {
  return /^on[A-Z][A-Za-z0-9]*$/.test(name);
}

export type EventName =
  | 'click' | 'change' | 'submit'
  | 'blur' | 'focus' | 'mouseenter' | 'mouseleave' | 'dblclick';

export interface BlockEvent {
  event: EventName;
  actions: BlockAction[];
}

/**
 * Operadores de una condición.
 *
 * `is`/`not` bastaban mientras la condición solo miraba una variable de estado
 * —un interruptor, una pestaña activa— porque ahí todo es igualdad. Una regla de
 * negocio no: «si quedan menos de 5 unidades», «si el nombre contiene el filtro»
 * o «si no hay dirección» no se pueden escribir con igualdades sin inventarse
 * variables intermedias que el usuario tendría que mantener a mano.
 *
 * `empty`/`filled` no llevan valor de comparación; el panel oculta el campo y
 * los emisores no lo leen.
 */
export type ConditionOp = 'is' | 'not' | 'gt' | 'lt' | 'contains' | 'empty' | 'filled';

/** Operadores que no comparan contra nada, y por tanto ignoran `value`. */
export const OPS_SIN_VALOR: ReadonlySet<ConditionOp> = new Set<ConditionOp>(['empty', 'filled']);

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  is: 'es igual a',
  not: 'es distinto de',
  gt: 'es mayor que',
  lt: 'es menor que',
  contains: 'contiene',
  empty: 'está vacío',
  filled: 'tiene valor',
};

/**
 * Condición evaluable, sobre el estado del componente o sobre el dato actual.
 *
 * Sigue llamándose `VisibilityRule` porque es el nombre con el que se guardó en
 * los componentes que ya están en la base de datos, y renombrarla obligaría a
 * migrarlos; pero ya no describe solo visibilidad: la misma condición decide
 * también qué clases se aplican (ver `StyleRule`).
 *
 * `field` es opcional y manda sobre `var` cuando está presente. Esa asimetría es
 * deliberada: un componente guardado antes de las reglas de negocio no tiene el
 * campo, y al leerlo debe seguir significando exactamente lo que significaba.
 */
export interface VisibilityRule {
  /** Variable de estado a evaluar. Se ignora si la regla mira un campo. */
  var: string;
  /**
   * Campo del elemento actual, dentro de un repetidor.
   *
   * Es lo que convierte la condición en una regla de negocio: deja de hablar del
   * estado de la interfaz para hablar del dato que se está pintando.
   */
  field?: string;
  op: ConditionOp;
  value: string;
}

/**
 * Clases que se aplican solo cuando se cumple una condición.
 *
 * Es la otra mitad de las reglas de negocio, la que sí vive dentro del
 * componente: «el stock a cero se pinta en rojo» es una decisión de
 * presentación y no tiene por qué salir a preguntar a nadie. Hasta ahora la
 * única respuesta a una condición era existir o no existir, y eso obligaba a
 * duplicar el bloque entero —una copia roja y otra normal, con condiciones
 * opuestas— para cambiarle el color.
 */
export interface StyleRule {
  when: VisibilityRule;
  /** Utilidades que se añaden si la condición se cumple. */
  className: string;
}

export const EVENT_LABELS: Record<EventName, string> = {
  click: 'Al hacer clic',
  change: 'Al cambiar',
  submit: 'Al enviar',
  blur: 'Al salir del campo',
  focus: 'Al entrar al campo',
  mouseenter: 'Al pasar el ratón',
  mouseleave: 'Al retirar el ratón',
  dblclick: 'Al hacer doble clic',
};

/** Atributo JSX/DOM correspondiente a cada evento. */
export const EVENT_ATTR: Record<EventName, string> = {
  click: 'onClick',
  change: 'onChange',
  submit: 'onSubmit',
  blur: 'onBlur',
  focus: 'onFocus',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  dblclick: 'onDoubleClick',
};

/**
 * Eventos que describen al bloque entero y no a su control interior.
 *
 * Un `change` o un `blur` pertenecen al `input` de dentro, pero «al pasar el
 * ratón» sobre una tarjeta se refiere a la tarjeta: si se colgara del primer
 * elemento interactivo (un botón dentro de la tarjeta), el área sensible sería
 * la equivocada.
 */
export const WHOLE_BLOCK_EVENTS: ReadonlySet<EventName> = new Set([
  'mouseenter', 'mouseleave', 'dblclick',
]);

/** Identificador JS válido, para no generar código roto desde el panel. */
export function isValidVarName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/** `abierto` -> `setAbierto`. */
export function setterName(varName: string): string {
  return `set${varName.charAt(0).toUpperCase()}${varName.slice(1)}`;
}

/** Literal del valor inicial tal y como debe aparecer en el código emitido. */
export function initialLiteral(v: StateVar): string {
  switch (v.type) {
    case 'boolean':
      return v.initial === 'true' ? 'true' : 'false';
    case 'number': {
      const n = Number(v.initial);
      return Number.isFinite(n) ? String(n) : '0';
    }
    default:
      return JSON.stringify(v.initial ?? '');
  }
}

/** Valor inicial como dato, para que el lienzo previsualice sin evaluar código. */
export function initialValue(v: StateVar): boolean | number | string {
  switch (v.type) {
    case 'boolean':
      return v.initial === 'true';
    case 'number': {
      const n = Number(v.initial);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return v.initial ?? '';
  }
}

/** Mapa nombre -> valor inicial. Es el "estado" que ve el lienzo. */
export function initialStateMap(vars: StateVar[]): Record<string, boolean | number | string> {
  const map: Record<string, boolean | number | string> = {};
  for (const v of vars) map[v.name] = initialValue(v);
  return map;
}

/** Literal de un valor destinado a una variable de un tipo dado. */
function valueLiteral(raw: string, type: StateVarType): string {
  switch (type) {
    case 'boolean':
      return raw === 'true' ? 'true' : 'false';
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : '0';
    }
    default:
      return JSON.stringify(raw ?? '');
  }
}

/**
 * Lo que una acción necesita saber de su entorno además de las variables.
 *
 * Va en un objeto y no en dos parámetros sueltos porque son datos del *sitio*
 * donde se emite la acción, no de la acción: quien la construye ya los tiene, y
 * los emisores que no usan callbacks pueden seguir sin pasar nada.
 */
export interface ActionScope {
  /** Props de función declaradas en el componente. */
  callbacks?: CallbackProp[];
  /** `true` si el bloque está dentro de un repetidor y `item` existe ahí. */
  insideRepeater?: boolean;
  /**
   * Lenguaje del código que se está emitiendo. Por defecto TypeScript.
   *
   * Solo cambia las anotaciones de los parámetros; las sentencias son las
   * mismas, porque son JavaScript en los dos casos.
   */
  lang?: Lang;
}

/** Sentencia JS de una acción. Devuelve `null` si apunta a algo inexistente. */
export function actionStatement(
  action: BlockAction,
  vars: StateVar[],
  scope: ActionScope = {},
): string | null {
  if (action.kind === 'reset') {
    if (vars.length === 0) return null;
    return vars.map((v) => `${setterName(v.name)}(${initialLiteral(v)});`).join(' ');
  }

  if (action.kind === 'call') {
    const cb = (scope.callbacks ?? []).find((c) => c.name === action.target);
    if (!cb) return null;
    /*
      La llamada va SIEMPRE encadenada con `?.`: la prop es opcional por
      contrato, así que quien integre el componente puede no pasarla y el
      botón debe seguir siendo un botón, no una excepción en consola.

      El elemento solo se pasa si de verdad hay uno en ese punto del árbol.
      Fuera de un repetidor `item` no existe, y emitirlo produciría un
      componente que no compila por un nombre suelto — el fallo más caro de
      todos, porque aparece en el proyecto de destino y no aquí.
    */
    return cb.passesItem && scope.insideRepeater
      ? `${cb.name}?.(${ITEM_PARAM});`
      : `${cb.name}?.();`;
  }

  const target = vars.find((v) => v.name === action.target);
  if (!target) return null;
  const set = setterName(target.name);

  switch (action.kind) {
    case 'toggle':
      return `${set}((v) => !v);`;
    case 'set':
      return `${set}(${valueLiteral(action.value, target.type)});`;
    case 'increment': {
      const by = Number.isFinite(Number(action.by)) ? Number(action.by) : 1;
      // Un paso negativo se emite restando: `v + -1` es correcto y compila, pero
      // nadie escribe eso a mano y en el código exportado canta.
      return by < 0 ? `${set}((v) => v - ${Math.abs(by)});` : `${set}((v) => v + ${by});`;
    }
  }
}

/** Sentencias efectivas de una lista de acciones, descartando las rotas. */
export function actionStatements(
  actions: BlockAction[],
  vars: StateVar[],
  scope: ActionScope = {},
): string[] {
  return actions
    .map((a) => actionStatement(a, vars, scope))
    .filter((s): s is string => s !== null);
}

/** Nombres de las props de función que un árbol de acciones llega a llamar. */
export function calledCallbacks(actions: BlockAction[]): string[] {
  return actions.filter((a) => a.kind === 'call').map((a) => a.target);
}

/**
 * Manejador completo de un evento, listo para incrustar como valor de atributo.
 * Devuelve `null` si el evento no produce ninguna sentencia efectiva.
 */
export function eventHandler(
  event: BlockEvent,
  vars: StateVar[],
  scope: ActionScope = {},
): string | null {
  const stmts = actionStatements(event.actions, vars, scope);

  if (stmts.length === 0) return null;

  // `submit` necesita cortar la navegación por defecto del formulario.
  if (event.event === 'submit') {
    return `(${paramEnvio(scope.lang ?? 'ts')}) => { e.preventDefault(); ${stmts.join(' ')} }`;
  }
  return stmts.length === 1 ? `() => ${stmts[0].replace(/;$/, '')}` : `() => { ${stmts.join(' ')} }`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Condiciones
//
// Una condición se resuelve en dos pasos: primero se localiza **de dónde sale el
// dato** (una variable de estado o un campo del elemento actual) y después se
// aplica el operador. Separarlo así es lo que permite que los siete operadores
// funcionen igual sobre las dos fuentes sin escribir la tabla dos veces.
// ─────────────────────────────────────────────────────────────────────────────

/** El dato que evalúa una condición, resuelto a sus tres formas. */
interface Operand {
  /** Expresión que lo nombra en el código emitido (`abierto`, `item.stock`). */
  code: string;
  /** Tipo con el que interpretar el valor de comparación. */
  type: StateVarType;
  /** Su valor en el lienzo, leído del runtime. */
  read: (rt: Runtime) => unknown;
  /** Su valor en diseño, cuando no hay runtime que consultar. */
  design: (model: DataModel | undefined) => unknown;
}

/** Tipo de comparación de un campo del modelo. */
function fieldCompareType(field: ModelField): StateVarType {
  switch (field.type) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    // Las fechas viajan como ISO, y en ISO el orden alfabético ES el cronológico:
    // comparar cadenas da el resultado correcto sin convertir nada.
    default: return 'string';
  }
}

/**
 * Localiza el dato de una condición, o `null` si no existe.
 *
 * Devolver `null` en vez de improvisar es lo que hace que borrar una variable o
 * un campo degrade a «esta regla no se aplica» en lugar de emitir código que
 * nombra algo inexistente y no compila en el proyecto de destino.
 */
function operandOf(
  rule: VisibilityRule,
  vars: StateVar[],
  model: DataModel | undefined,
): Operand | null {
  if (rule.field) {
    const field = model && hasModel(model)
      ? effectiveFields(model.fields).find((f) => f.name === rule.field)
      : undefined;
    if (!field) return null;
    return {
      code: `${ITEM_PARAM}.${field.name}`,
      type: fieldCompareType(field),
      read: (rt) => rt.item?.[field.name],
      // Sin elemento actual se juzga por el primero de los datos de ejemplo: es
      // el mismo que el lienzo pinta cuando aún no hay repetidor que lo aporte.
      design: () => sampleValue(field, 0),
    };
  }

  const target = vars.find((v) => v.name === rule.var);
  if (!target) return null;
  return {
    code: target.name,
    type: target.type,
    read: (rt) => rt.get(target.name),
    design: () => initialValue(target),
  };
}

/** Texto de una condición en castellano, para las etiquetas del panel. */
export function conditionSummary(rule: VisibilityRule): string {
  const sujeto = rule.field ? `${rule.field} (dato)` : rule.var;
  const op = CONDITION_OP_LABELS[rule.op] ?? rule.op;
  return OPS_SIN_VALOR.has(rule.op) ? `${sujeto} ${op}` : `${sujeto} ${op} ${rule.value}`;
}

/**
 * Expresión booleana de una condición, para el código emitido.
 *
 * `empty`/`filled` y `contains` normalizan a texto con `String(x ?? '')` en vez
 * de apoyarse en que el valor sea veraz o falso: `0` y `''` son cosas distintas
 * —un stock a cero tiene valor, una dirección en blanco no— y `!x` las confunde.
 */
export function conditionTest(
  rule: VisibilityRule,
  vars: StateVar[],
  model?: DataModel,
): string | null {
  const operand = operandOf(rule, vars, model);
  if (!operand) return null;
  const { code, type } = operand;

  switch (rule.op) {
    case 'empty':
      return `!String(${code} ?? '').trim()`;
    case 'filled':
      return `!!String(${code} ?? '').trim()`;
    case 'contains':
      return `String(${code} ?? '').toLowerCase().includes(${JSON.stringify(rule.value.toLowerCase())})`;
    case 'gt':
    case 'lt': {
      const literal = type === 'number' ? valueLiteral(rule.value, 'number') : JSON.stringify(rule.value);
      return `${code} ${rule.op === 'gt' ? '>' : '<'} ${literal}`;
    }
    default: {
      if (type === 'boolean') {
        const positive = rule.value === 'true';
        // `is true` y `not false` son la misma condición.
        const truthy = rule.op === 'is' ? positive : !positive;
        return truthy ? code : `!${code}`;
      }
      const literal = valueLiteral(rule.value, type);
      return `${code} ${rule.op === 'is' ? '===' : '!=='} ${literal}`;
    }
  }
}

/** Aplica el operador a un valor ya leído. Gemelo exacto de `conditionTest`. */
function applyOp(rule: VisibilityRule, current: unknown, type: StateVarType): boolean {
  switch (rule.op) {
    case 'empty':
      return !String(current ?? '').trim();
    case 'filled':
      return !!String(current ?? '').trim();
    case 'contains':
      return String(current ?? '').toLowerCase().includes(rule.value.toLowerCase());
    case 'gt':
    case 'lt': {
      const expected = type === 'number' ? Number(rule.value) : rule.value;
      const menor = (current as number | string) < (expected as number | string);
      return rule.op === 'lt' ? menor : (current as number | string) > (expected as number | string);
    }
    default: {
      const equal = current === coerce(rule.value, type);
      return rule.op === 'is' ? equal : !equal;
    }
  }
}

/**
 * Evalúa la condición sin runtime, para el lienzo en modo diseño.
 *
 * Una condición que no se puede resolver se da por cumplida: en diseño es
 * preferible ver el bloque —y poder seleccionarlo para arreglar la regla— que
 * perderlo del lienzo sin explicación.
 */
export function conditionPreview(
  rule: VisibilityRule,
  vars: StateVar[],
  model?: DataModel,
): boolean {
  const operand = operandOf(rule, vars, model);
  if (!operand) return true;
  return applyOp(rule, operand.design(model), operand.type);
}

/** Evalúa la condición contra el estado vivo del lienzo. */
export function evalCondition(
  rule: VisibilityRule,
  vars: StateVar[],
  rt: Runtime,
  model?: DataModel,
): boolean {
  const operand = operandOf(rule, vars, model);
  if (!operand) return true;
  return applyOp(rule, operand.read(rt), operand.type);
}

/** Reglas de estilo que producen algo: con condición resoluble y clases. */
export function effectiveStyleRules(
  rules: StyleRule[] | undefined,
  vars: StateVar[],
  model?: DataModel,
): StyleRule[] {
  return (rules ?? []).filter(
    (r) => r.className.trim() && conditionTest(r.when, vars, model) !== null,
  );
}

/**
 * Declaraciones `useState` del componente emitido.
 *
 * `readNames` son las variables cuyo *valor* se lee en algún sitio. Las que solo
 * se escriben (un botón que fija `enviado` a true sin que nadie lo muestre)
 * omiten el primer elemento de la desestructuración: declararlo dispararía
 * `noUnusedLocals` y el componente no compilaría. `const [, setEnviado]` es
 * además la forma idiomática de decir «aquí solo me interesa el setter».
 */
export function stateDeclarations(vars: StateVar[], readNames?: ReadonlySet<string>): string[] {
  return vars.map((v) => {
    const binding = !readNames || readNames.has(v.name) ? v.name : '';
    return `const [${binding}, ${setterName(v.name)}] = useState(${initialLiteral(v)});`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Intérprete
//
// Gemelo ejecutable del generador de código de arriba: las mismas acciones, pero
// aplicadas al estado vivo del lienzo en vez de traducidas a texto. Mantener los
// dos en el mismo fichero es deliberado —si se añade una acción, salta a la
// vista que hay que cubrir ambos caminos.
// ─────────────────────────────────────────────────────────────────────────────

/** Convierte un valor crudo al tipo de la variable destino. */
function coerce(raw: string, type: StateVarType): boolean | number | string {
  switch (type) {
    case 'boolean':
      return raw === 'true';
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return raw ?? '';
  }
}

export function runAction(action: BlockAction, vars: StateVar[], rt: Runtime): void {
  if (action.kind === 'reset') {
    for (const v of vars) rt.set(v.name, initialValue(v));
    return;
  }

  /*
    Avisar a la app anfitriona no hace nada en el lienzo, y es lo correcto.

    Aquí no hay app anfitriona: simular un borrado sobre los datos de ejemplo
    enseñaría un comportamiento que el componente exportado no tiene: quien lo
    integre decidirá si borra, si pide confirmación o si no hace nada. El panel
    lo dice con todas las letras para que la ausencia de efecto no se lea como
    un fallo.
  */
  if (action.kind === 'call') return;

  const target = vars.find((v) => v.name === action.target);
  if (!target) return;

  switch (action.kind) {
    case 'toggle':
      rt.set(target.name, !rt.get(target.name));
      break;
    case 'set':
      rt.set(target.name, coerce(action.value, target.type));
      break;
    case 'increment': {
      const by = Number(action.by);
      const current = Number(rt.get(target.name)) || 0;
      rt.set(target.name, current + (Number.isFinite(by) ? by : 1));
      break;
    }
  }
}

export function runActions(actions: BlockAction[], vars: StateVar[], rt: Runtime): void {
  for (const action of actions) runAction(action, vars, rt);
}

/** Evalúa una regla de visibilidad contra el estado vivo. */
export function evalVisibility(rule: VisibilityRule, vars: StateVar[], rt: Runtime): boolean {
  const target = vars.find((v) => v.name === rule.var);
  if (!target) return true;

  const current = rt.get(target.name);
  const expected = coerce(rule.value, target.type);
  const equal = current === expected;
  return rule.op === 'is' ? equal : !equal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación de campos
//
// Mismo principio que las acciones: un modelo declarativo y cerrado, con
// generador de código e intérprete gemelos en el mismo fichero. Cada regla se
// traduce a una comprobación en el validador emitido y a la misma comprobación
// ejecutada en vivo por el lienzo.
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationKind =
  | 'required' | 'minLength' | 'maxLength' | 'pattern' | 'email' | 'min' | 'max'
  // Añadidas por ser las que obligaban a bajar a `pattern` con una expresión
  // regular escrita a mano: quien diseña una interfaz sabe «esto es una URL»,
  // no `^https?:\/\/...`. Un `pattern` mal escrito no falla, valida mal.
  | 'url' | 'integer' | 'phone' | 'noSpaces' | 'minWords';

export interface ValidationRule {
  kind: ValidationKind;
  /** Parámetro de la regla (longitud, patrón o límite). Solo algunas lo usan. */
  value?: string;
  /** Mensaje a mostrar. Vacío = mensaje por defecto en español. */
  message?: string;
}

/** Reglas cuyo parámetro `value` es imprescindible. */
export const VALIDATION_KINDS_WITH_VALUE: ReadonlySet<ValidationKind> = new Set([
  'minLength', 'maxLength', 'pattern', 'min', 'max', 'minWords',
]);

export const VALIDATION_LABELS: Record<ValidationKind, string> = {
  required: 'Obligatorio',
  minLength: 'Longitud mínima',
  maxLength: 'Longitud máxima',
  pattern: 'Patrón (expresión regular)',
  email: 'Correo electrónico',
  min: 'Valor mínimo',
  max: 'Valor máximo',
  url: 'Dirección web',
  integer: 'Número entero',
  phone: 'Teléfono',
  noSpaces: 'Sin espacios',
  minWords: 'Mínimo de palabras',
};

function defaultMessage(rule: ValidationRule): string {
  switch (rule.kind) {
    case 'required': return 'Este campo es obligatorio';
    case 'minLength': return `Mínimo ${rule.value} caracteres`;
    case 'maxLength': return `Máximo ${rule.value} caracteres`;
    case 'pattern': return 'El formato no es válido';
    case 'email': return 'Introduce un correo electrónico válido';
    case 'min': return `El valor mínimo es ${rule.value}`;
    case 'max': return `El valor máximo es ${rule.value}`;
    case 'url': return 'Introduce una dirección web válida';
    case 'integer': return 'Introduce un número entero';
    case 'phone': return 'Introduce un teléfono válido';
    case 'noSpaces': return 'No puede contener espacios';
    case 'minWords': return `Escribe al menos ${rule.value} palabras`;
  }
}

export function validationMessage(rule: ValidationRule): string {
  return rule.message?.trim() ? rule.message : defaultMessage(rule);
}

/** `true` si el patrón compila como expresión regular. */
export function isValidPattern(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reglas utilizables: con parámetro válido y sin duplicados de tipo.
 *
 * El filtrado vive aquí —y no en el panel o en el saneador— porque el generador
 * y el intérprete deben partir exactamente de la misma lista: una regla que uno
 * aplicara y el otro no haría que el lienzo mintiera sobre el código exportado.
 */
export function effectiveRules(rules: ValidationRule[]): ValidationRule[] {
  const seen = new Set<ValidationKind>();
  const out: ValidationRule[] = [];
  for (const rule of rules) {
    if (seen.has(rule.kind)) continue;
    if (VALIDATION_KINDS_WITH_VALUE.has(rule.kind)) {
      const value = rule.value?.trim() ?? '';
      if (value === '') continue;
      if (rule.kind === 'pattern' && !isValidPattern(value)) continue;
      if (rule.kind !== 'pattern' && !Number.isFinite(Number(value))) continue;
    }
    seen.add(rule.kind);
    out.push(rule);
  }
  // `required` primero: es el mensaje que debe ganar sobre un campo vacío.
  return out.sort((a, b) => Number(b.kind === 'required') - Number(a.kind === 'required'));
}

/** `email` -> `validateEmail`. */
export function validatorName(varName: string): string {
  return `validate${varName.charAt(0).toUpperCase()}${varName.slice(1)}`;
}

const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
const URL_PATTERN = '^https?://[^\\s.]+\\.[^\\s]{2,}$';
/**
 * Teléfono permisivo a propósito: prefijo internacional, espacios, guiones y
 * paréntesis. Un patrón estricto rechazaría `+34 600 00 00 00`, y un falso
 * error en un formulario es peor que no validar.
 */
const PHONE_PATTERN = '^[+]?[\\d\\s().-]{6,}$';

/**
 * Código del validador de un campo: función pura `(v) => mensaje | ''`.
 *
 * Las reglas distintas de `required` no se aplican sobre el campo vacío: un
 * campo opcional sin rellenar no incumple una longitud mínima ni un patrón.
 */
export function validatorCode(
  name: string,
  rules: ValidationRule[],
  boolValue: boolean,
  lang: Lang = 'ts',
): string {
  const devuelve = anot(lang, 'string');
  if (boolValue) {
    const required = rules.find((r) => r.kind === 'required') ?? { kind: 'required' as const };
    return `const ${name} = (v${anot(lang, 'boolean')})${devuelve} => (v ? '' : ${JSON.stringify(validationMessage(required))});`;
  }

  const checks = rules.map((rule) => {
    const msg = JSON.stringify(validationMessage(rule));
    switch (rule.kind) {
      case 'required': return `if (v.trim() === '') return ${msg};`;
      case 'minLength': return `if (v !== '' && v.length < ${Number(rule.value)}) return ${msg};`;
      case 'maxLength': return `if (v.length > ${Number(rule.value)}) return ${msg};`;
      case 'pattern': return `if (v !== '' && !new RegExp(${JSON.stringify(rule.value)}).test(v)) return ${msg};`;
      case 'email': return `if (v !== '' && !new RegExp(${JSON.stringify(EMAIL_PATTERN)}).test(v)) return ${msg};`;
      case 'min': return `if (v !== '' && Number(v) < ${Number(rule.value)}) return ${msg};`;
      case 'max': return `if (v !== '' && Number(v) > ${Number(rule.value)}) return ${msg};`;
      case 'url': return `if (v !== '' && !new RegExp(${JSON.stringify(URL_PATTERN)}).test(v)) return ${msg};`;
      case 'phone': return `if (v !== '' && !new RegExp(${JSON.stringify(PHONE_PATTERN)}).test(v)) return ${msg};`;
      case 'integer': return `if (v !== '' && !Number.isInteger(Number(v))) return ${msg};`;
      case 'noSpaces': return `if (/\s/.test(v)) return ${msg};`;
      case 'minWords': return `if (v.trim() !== '' && v.trim().split(/\s+/).length < ${Number(rule.value)}) return ${msg};`;
    }
  });

  return `const ${name} = (v${anot(lang, 'string')})${devuelve} => {\n${checks.map((c) => `  ${c}`).join('\n')}\n  return '';\n};`;
}

/**
 * Intérprete gemelo de `validatorCode`: la misma validación, contra un valor
 * vivo del lienzo. Devuelve el mensaje de la primera regla incumplida o `''`.
 */
export function runValidation(rules: ValidationRule[], value: unknown): string {
  if (typeof value === 'boolean') {
    const required = rules.find((r) => r.kind === 'required') ?? { kind: 'required' as const };
    return value ? '' : validationMessage(required);
  }

  const v = value == null ? '' : String(value);
  for (const rule of rules) {
    const msg = validationMessage(rule);
    switch (rule.kind) {
      case 'required': if (v.trim() === '') return msg; break;
      case 'minLength': if (v !== '' && v.length < Number(rule.value)) return msg; break;
      case 'maxLength': if (v.length > Number(rule.value)) return msg; break;
      case 'pattern': if (v !== '' && !new RegExp(rule.value ?? '').test(v)) return msg; break;
      case 'email': if (v !== '' && !new RegExp(EMAIL_PATTERN).test(v)) return msg; break;
      case 'min': if (v !== '' && Number(v) < Number(rule.value)) return msg; break;
      case 'max': if (v !== '' && Number(v) > Number(rule.value)) return msg; break;
      case 'url': if (v !== '' && !new RegExp(URL_PATTERN).test(v)) return msg; break;
      case 'phone': if (v !== '' && !new RegExp(PHONE_PATTERN).test(v)) return msg; break;
      case 'integer': if (v !== '' && !Number.isInteger(Number(v))) return msg; break;
      case 'noSpaces': if (/\s/.test(v)) return msg; break;
      case 'minWords':
        if (v.trim() !== '' && v.trim().split(/\s+/).length < Number(rule.value)) return msg;
        break;
    }
  }
  return '';
}
