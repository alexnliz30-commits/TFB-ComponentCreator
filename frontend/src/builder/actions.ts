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
  | { kind: 'reset' };

export type EventName = 'click' | 'change' | 'submit';

export interface BlockEvent {
  event: EventName;
  actions: BlockAction[];
}

export interface VisibilityRule {
  var: string;
  op: 'is' | 'not';
  value: string;
}

export const EVENT_LABELS: Record<EventName, string> = {
  click: 'Al hacer clic',
  change: 'Al cambiar',
  submit: 'Al enviar',
};

/** Atributo JSX/DOM correspondiente a cada evento. */
export const EVENT_ATTR: Record<EventName, string> = {
  click: 'onClick',
  change: 'onChange',
  submit: 'onSubmit',
};

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

/** Sentencia JS de una acción. Devuelve `null` si apunta a una variable inexistente. */
export function actionStatement(action: BlockAction, vars: StateVar[]): string | null {
  if (action.kind === 'reset') {
    if (vars.length === 0) return null;
    return vars.map((v) => `${setterName(v.name)}(${initialLiteral(v)});`).join(' ');
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
      const by = Number(action.by);
      return `${set}((v) => v + ${Number.isFinite(by) ? by : 1});`;
    }
  }
}

/**
 * Manejador completo de un evento, listo para incrustar como valor de atributo.
 * Devuelve `null` si el evento no produce ninguna sentencia efectiva.
 */
export function eventHandler(event: BlockEvent, vars: StateVar[]): string | null {
  const stmts = event.actions
    .map((a) => actionStatement(a, vars))
    .filter((s): s is string => s !== null);

  if (stmts.length === 0) return null;

  // `submit` necesita cortar la navegación por defecto del formulario.
  //
  // El parámetro se tipa estructuralmente en vez de con `React.FormEvent`: el
  // componente emitido no lleva imports, así que en el entorno de verificación
  // del harness `React` es un valor, no un espacio de nombres de tipos. Un
  // evento sintético de React satisface esta forma, de modo que el código
  // compila igual dentro del harness que en un proyecto React real.
  if (event.event === 'submit') {
    return `(e: { preventDefault: () => void }) => { e.preventDefault(); ${stmts.join(' ')} }`;
  }
  return stmts.length === 1 ? `() => ${stmts[0].replace(/;$/, '')}` : `() => { ${stmts.join(' ')} }`;
}

/** Expresión booleana de una regla de visibilidad. */
export function visibilityTest(rule: VisibilityRule, vars: StateVar[]): string | null {
  const target = vars.find((v) => v.name === rule.var);
  if (!target) return null;

  if (target.type === 'boolean') {
    const positive = rule.value === 'true';
    // `is true` y `not false` son la misma condición.
    const truthy = rule.op === 'is' ? positive : !positive;
    return truthy ? target.name : `!${target.name}`;
  }

  const literal = valueLiteral(rule.value, target.type);
  return `${target.name} ${rule.op === 'is' ? '===' : '!=='} ${literal}`;
}

/** Evalúa la regla contra el estado inicial, para el preview del lienzo. */
export function visibilityPreview(rule: VisibilityRule, vars: StateVar[]): boolean {
  const target = vars.find((v) => v.name === rule.var);
  if (!target) return true;

  const current = initialValue(target);
  const expected =
    target.type === 'boolean' ? rule.value === 'true'
    : target.type === 'number' ? Number(rule.value)
    : rule.value;

  const equal = current === expected;
  return rule.op === 'is' ? equal : !equal;
}

/** Declaraciones `useState` del componente emitido. */
export function stateDeclarations(vars: StateVar[]): string[] {
  return vars.map((v) => `const [${v.name}, ${setterName(v.name)}] = useState(${initialLiteral(v)});`);
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
