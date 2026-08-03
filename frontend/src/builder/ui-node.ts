/**
 * Representación intermedia (IR) de la interfaz, independiente de framework.
 *
 * Es la fuente única de verdad del builder: cada bloque de la paleta se traduce
 * a un árbol de `UiNode` (ver `schema.ts`), y de ese árbol se derivan tanto el
 * render del lienzo (`render-node.tsx`) como el código exportado
 * (`emit-react.ts`, y los emisores de otros frameworks que se añadan).
 *
 * Antes existían dos implementaciones paralelas de cada bloque —una para pintar
 * y otra para exportar— que se desincronizaron: 41 de los 85 tipos se exportaban
 * como `<div>tipo</div>`. Con la IR eso deja de ser posible por construcción.
 *
 * Los nodos dinámicos (`expr`, `when`) llevan además un valor de *preview*: lo
 * que el lienzo debe mostrar sin evaluar expresiones. Así el renderizador no
 * necesita un intérprete y el estado inicial se ve tal cual quedará en runtime.
 */

/**
 * Estado vivo del lienzo en modo interactivo.
 *
 * Existe para que el lienzo pueda ejecutar el comportamiento sin evaluar las
 * cadenas de código destinadas al emisor: el esquema, que es quien conoce la
 * semántica, adjunta además un cierre que opera sobre este runtime. Así no hay
 * `eval` ni `new Function` en ninguna parte.
 */
export interface Runtime {
  get(name: string): unknown;
  set(name: string, value: unknown): void;
}

/** Cierre que calcula un valor en vivo a partir del estado del lienzo. */
export type Live<T> = (rt: Runtime) => T;

/** Valor de un atributo. */
export type Attr =
  /** Literal: `attr="valor"`. */
  | { kind: 'static'; value: string }
  /** Expresión del framework: `attr={code}`. `preview` es el valor inicial. */
  | { kind: 'expr'; code: string; preview: string; live?: Live<string> }
  /**
   * Manejador de evento: `onClick={code}`. `run` es su equivalente ejecutable;
   * `payload` lleva el valor del control cuando el evento lo aporta (un slider,
   * un campo de texto).
   *
   * `param` y `stmts` conservan las piezas con las que se montó `code` cuando el
   * manejador se construyó por sentencias: permiten componer dos manejadores del
   * mismo evento (el enlace de un campo y las acciones del usuario) regenerando
   * un único arrow, en lugar de intentar encadenar dos expresiones opacas.
   */
  | {
      kind: 'event';
      code: string;
      run?: (rt: Runtime, payload?: unknown) => void;
      param?: string;
      stmts?: string[];
    };

export type UiNode =
  | { kind: 'el'; tag: string; attrs: Record<string, Attr>; children: UiNode[] }
  | { kind: 'text'; value: string }
  | { kind: 'expr'; code: string; preview: string; live?: Live<string> }
  /** Punto de inserción de los bloques hijos del builder (contenedores). */
  | { kind: 'slot' }
  /** Render condicional. `previewVisible` decide qué ve el lienzo en diseño. */
  | { kind: 'when'; test: string; previewVisible: boolean; children: UiNode[]; live?: Live<boolean> };

/** Etiquetas sin cierre; se emiten como `<tag />`. */
export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

type AttrInput = string | number | Attr;

function toAttr(value: AttrInput): Attr {
  if (typeof value === 'object' && value !== null && 'kind' in value) return value;
  return { kind: 'static', value: String(value) };
}

/**
 * Construye un elemento.
 *
 * `className` va aparte por comodidad: es el atributo que toca prácticamente
 * cada bloque. Se omite si queda vacío para no ensuciar el código emitido.
 */
export function el(
  tag: string,
  className?: string | null,
  children: UiNode[] = [],
  attrs: Record<string, AttrInput | undefined | null> = {},
): UiNode {
  const resolved: Record<string, Attr> = {};
  if (className) resolved.className = { kind: 'static', value: className };
  for (const [key, value] of Object.entries(attrs)) {
    // Descartamos vacíos para no emitir `placeholder=""` y similares.
    if (value === undefined || value === null || value === '') continue;
    resolved[key] = toAttr(value);
  }
  return { kind: 'el', tag, attrs: resolved, children };
}

export function txt(value: string): UiNode {
  return { kind: 'text', value };
}

export function expr(code: string, preview: string, live?: Live<string>): UiNode {
  return { kind: 'expr', code, preview, live };
}

export function slot(): UiNode {
  return { kind: 'slot' };
}

export function when(
  test: string,
  previewVisible: boolean,
  children: UiNode[],
  live?: Live<boolean>,
): UiNode {
  return { kind: 'when', test, previewVisible, children, live };
}

/** Atributo de evento, para que los bloques no construyan objetos a mano. */
export function on(code: string, run?: (rt: Runtime, payload?: unknown) => void): Attr {
  return { kind: 'event', code, run };
}

/**
 * Atributo de evento construido por sentencias, componible con otro del mismo
 * evento. `param` es la firma del parámetro (`e: { ... }`) o `''` si no lo usa.
 */
export function onStmts(
  param: string,
  stmts: string[],
  run?: (rt: Runtime, payload?: unknown) => void,
): Attr {
  const code = `(${param}) => { ${stmts.join(' ')} }`;
  return { kind: 'event', code, run, param, stmts };
}

/** Atributo de expresión con su valor de preview. */
export function bind(code: string, preview: string, live?: Live<string>): Attr {
  return { kind: 'expr', code, preview, live };
}

/** Une clases descartando vacíos. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Divide una prop separada por comas, descartando entradas vacías. */
export function csv(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Divide `"a:b"` en pares, para props del tipo `Nombre:email`. */
export function pairs(value: string | undefined): [string, string][] {
  return csv(value).map((entry) => {
    const idx = entry.indexOf(':');
    return idx === -1
      ? [entry, '']
      : [entry.slice(0, idx).trim(), entry.slice(idx + 1).trim()];
  });
}

/** Entero con valor por defecto, tolerante a props mal escritas. */
export function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Recorre el árbol en profundidad. */
export function walk(node: UiNode, visit: (n: UiNode) => void): void {
  visit(node);
  if (node.kind === 'el' || node.kind === 'when') {
    for (const child of node.children) walk(child, visit);
  }
}
