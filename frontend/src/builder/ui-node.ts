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
  /**
   * Elemento actual dentro de un repetidor; ausente fuera de uno.
   *
   * Es el único estado con ámbito del lienzo. Va aquí y no como parámetro de
   * `Live` para no reescribir los cientos de cierres que ya existen: quien no
   * está dentro de un repetidor sencillamente no lo mira.
   */
  item?: Record<string, unknown>;
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
  | { kind: 'when'; test: string; previewVisible: boolean; children: UiNode[]; live?: Live<boolean> }
  /**
   * Repetición sobre una colección **calculada en tiempo de ejecución**.
   *
   * Es el nodo que faltaba. Las listas que ya existían —`ul`, `select`, las
   * filas de una tabla— se pliegan a `.map()` sobre datos CONSTANTES conocidos
   * al emitir, y por eso una tabla podía paginar con un condicional por fila
   * pero no ordenar, ni recibir sus filas por props.
   *
   * `code` es la expresión que produce la colección en el código emitido
   * (`items`, `items.slice(0, 10)`); `sample` es la que dibuja el lienzo
   * mientras se diseña. Cada elemento renderiza `item` con el elemento actual
   * accesible en `Runtime.item`, de modo que los descendientes enlazados a un
   * campo resuelven igual en el lienzo y en el componente exportado.
   */
  | {
      kind: 'list';
      /** Expresión de la colección en el código emitido. */
      code: string;
      /** Nombre de la variable de elemento (`item`). */
      param: string;
      /** Plantilla que se repite. */
      item: UiNode;
      /** Colección con la que el lienzo dibuja mientras se diseña. */
      sample: Record<string, unknown>[];
      /** Colección viva; sin ella el lienzo usa `sample`. */
      live?: Live<Record<string, unknown>[]>;
    };

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

/** Repetición sobre una colección calculada en ejecución. */
export function list(
  code: string,
  param: string,
  item: UiNode,
  sample: Record<string, unknown>[],
  live?: Live<Record<string, unknown>[]>,
): UiNode {
  return { kind: 'list', code, param, item, sample, live };
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

/**
 * Grupos de utilidades que no pueden convivir en el mismo elemento.
 *
 * Se declaran aquí, y no reutilizando `STYLE_SECTIONS`, porque aquel vocabulario
 * describe lo que el PANEL sabe editar —con sus opciones, etiquetas y valores
 * cerrados— mientras que esto necesita reconocer también lo que escriben la IA y
 * el usuario a mano: valores arbitrarios (`p-[3px]`), fracciones (`w-1/2`) y
 * escalas que el panel no ofrece. Importar el otro dejaría fuera justo los casos
 * que provocan el conflicto.
 *
 * Solo van grupos donde dos valores son EXCLUYENTES. `border` o `ring` admiten
 * varias utilidades a la vez (ancho, color, lado) y quedan fuera a propósito.
 */
const GRUPOS_EXCLUYENTES: RegExp[] = [
  /^text-(xs|sm|base|lg|xl|[2-9]xl)$/,                       // tamaño de texto
  /^text-(left|center|right|justify)$/,                       // alineación
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
  /^leading-[\w.[\]/-]+$/,
  /^tracking-[\w.[\]/-]+$/,
  /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden)$/,
  /^flex-(row|col|row-reverse|col-reverse)$/,
  /^justify-[\w-]+$/,
  /^items-[\w-]+$/,
  /^(static|relative|absolute|fixed|sticky)$/,
  /^rounded(-(none|sm|md|lg|xl|[2-9]xl|full|\[[^\]]+\]))?$/,
  /^shadow(-(sm|md|lg|xl|[2-9]xl|none|inner|\[[^\]]+\]))?$/,
  /^opacity-[\w.[\]/-]+$/,
  ...['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
    'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
    'gap', 'gap-x', 'gap-y', 'space-y', 'space-x',
    'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h',
    'grid-cols', 'col-span', 'row-span',
  ].map((p) => new RegExp(`^-?${p.replace('-', '\\-')}-(\\[[^\\]]+\\]|[\\w.]+(/\\d+)?)$`)),
];

/** Prefijo de variante (`md:`, `hover:`, `dark:md:`) de una utilidad. */
function variante(cls: string): string {
  const corchete = cls.indexOf('[');
  const cabeza = corchete === -1 ? cls : cls.slice(0, corchete);
  const corte = cabeza.lastIndexOf(':');
  return corte === -1 ? '' : cls.slice(0, corte + 1);
}

/** Clave del grupo excluyente de una clase, o `null` si no pertenece a ninguno. */
function grupoDe(cls: string): string | null {
  const pfx = variante(cls);
  const base = cls.slice(pfx.length);
  const i = GRUPOS_EXCLUYENTES.findIndex((re) => re.test(base));
  return i === -1 ? null : `${pfx}#${i}`;
}

/**
 * Une clases descartando vacíos, y **resuelve los conflictos quedándose con la
 * última** dentro de cada grupo excluyente.
 *
 * Las clases base del bloque van primero y las del usuario después, así que la
 * última es la que se ha pedido explícitamente. Sin esta resolución el atributo
 * salía con las dos —`text-sm text-xs` en el `alert` del kit de ejemplo— y quién
 * ganaba no lo decidía el atributo sino el ORDEN DE LA HOJA de Tailwind, que a
 * igual especificidad aplica la última regla emitida.
 *
 * Medido en esta compilación, `text-xs` ya ganaba: el resultado visual era el
 * correcto **por casualidad**, no por diseño. Esa es justamente la razón de
 * resolverlo aquí: un cambio de versión de Tailwind, un `@layer` distinto o un
 * safelist reordenado invertirían el resultado sin tocar una línea del proyecto,
 * y el fallo aparecería en el componente exportado sin nada que lo explique.
 * Con una sola clase por grupo, lo que se ve es lo que se pidió.
 *
 * El orden de los supervivientes es el de su ÚLTIMA aparición: mantiene juntas
 * las clases que el usuario acaba de escribir en vez de devolverlas al hueco que
 * ocupaba la clase base que sustituyen.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  const clases = parts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean);

  const ultimoDe = new Map<string, number>();
  clases.forEach((c, i) => ultimoDe.set(grupoDe(c) ?? `=${c}`, i));

  return clases.filter((c, i) => ultimoDe.get(grupoDe(c) ?? `=${c}`) === i).join(' ');
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
  if (node.kind === 'list') walk(node.item, visit);
}
