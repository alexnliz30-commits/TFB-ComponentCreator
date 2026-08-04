/**
 * Orden entre los estilos GLOBALES de la librería y los PROPIOS de un componente.
 *
 * La regla del sistema es que el global manda: el tema de la librería —su color
 * de marca, su tipografía, su forma— no puede romperse por accidente desde un
 * componente suelto, porque entonces deja de ser un kit y pasa a ser una bolsa
 * de piezas que casualmente se parecen.
 *
 * Se implementa con **capas de cascada** (`@layer`) y no con `!important`
 * repartido: entre capas decide el ORDEN DE DECLARACIÓN y no la especificidad,
 * así que el global gana sin necesidad de escribir selectores más específicos ni
 * de librar una guerra de `!important` que acabaría ganando quien más gritara.
 *
 * ```
 * @layer vz-componente, vz-global;   ← la última declarada es la que manda
 * ```
 *
 * **La puerta de salida.** Un componente puede desviarse del global a
 * propósito —un botón de peligro en rojo dentro de un kit azul— marcando la
 * declaración con `!propio`. Se traduce a `!important`, y aquí eso no es un
 * parche: para las declaraciones importantes **el orden de las capas se
 * invierte**, de modo que un `!important` en la capa del componente gana
 * limpiamente al global. La marca existe para que el desvío sea una decisión
 * escrita y visible en el fuente, no un accidente.
 *
 * **Lo que NO cubren las capas, verificado en el sandbox real:** una utilidad de
 * Tailwind escrita en el `className` del bloque va SIN capa, y lo que está fuera
 * de toda capa gana a lo que está dentro de cualquiera. Es coherente con el
 * sistema —lo que se elige en el panel de propiedades es la vía principal de
 * estilado, y los roles del tema se consumen precisamente a través de esas
 * utilidades (`bg-[var(--vz-primario)]`), así que ahí no hay disputa: el tema
 * pone la variable y la utilidad la lee—. Para pisar también una utilidad vale
 * la misma marca `!propio`, que es lo que la hace un mecanismo único.
 */

export const LAYER_COMPONENT = 'vz-componente';
export const LAYER_GLOBAL = 'vz-global';

/**
 * Declaración del orden de capas.
 *
 * Va la PRIMERA en cada hoja. Declarar el orden por adelantado es lo que permite
 * que el global mande aunque su hoja se cargue antes que la del componente: sin
 * esta línea el orden lo fijaría la primera aparición de cada capa, que depende
 * de en qué orden se inyecten las hojas y por tanto sería frágil. Repetirla en
 * varias hojas es inofensivo: la segunda vez no cambia nada.
 */
export const LAYER_ORDER = `@layer ${LAYER_COMPONENT}, ${LAYER_GLOBAL};`;

/** Marca con la que un componente declara que se desvía del estilo global. */
export const DEVIATION_MARK = '!propio';

/** Envuelve una hoja en una capa, indentando su contenido. */
export function inLayer(layer: string, css: string): string {
  const body = css
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');
  return `${LAYER_ORDER}\n\n@layer ${layer} {\n${body}\n}\n`;
}

/**
 * Hoja de estilos GLOBAL de la librería (tema y CSS libre compartido).
 */
export function globalLayer(css: string): string {
  return css.trim() ? inLayer(LAYER_GLOBAL, css.trimEnd()) : '';
}

/**
 * Hoja de estilos PROPIA de un componente.
 *
 * Además de envolverla, traduce la marca de desvío. Se acepta con o sin espacio
 * antes (`color: red !propio` y `color: red!propio`) porque las dos formas se
 * escriben, y se ignoran las mayúsculas por lo mismo.
 */
export function componentLayer(css: string): string {
  if (!css.trim()) return '';
  return inLayer(LAYER_COMPONENT, applyDeviations(css.trimEnd()));
}

/** Comentario CSS, para dejarlo intacto. */
const COMENTARIO = /\/\*[\s\S]*?\*\//g;

/**
 * `color: red !propio` → `color: red !important`.
 *
 * Los COMENTARIOS se dejan como están. Un reemplazo a secas también reescribía
 * el texto que explica la marca —«hay que declararlo con `!propio`» acababa
 * diciendo «con `!important`»— así que la hoja exportada documentaba una marca
 * que no existe, justo en el sitio donde alguien iría a aprenderla.
 */
export function applyDeviations(css: string): string {
  return mapFueraDeComentarios(css, (trozo) => trozo.replace(/!\s*propio\b/gi, '!important'));
}

/** ¿Esta hoja declara algún desvío? Sirve para avisar en la interfaz. */
export function countDeviations(css: string): number {
  let total = 0;
  mapFueraDeComentarios(css, (trozo) => {
    total += (trozo.match(/!\s*propio\b/gi) ?? []).length;
    return trozo;
  });
  return total;
}

/** Aplica `fn` solo a lo que NO es comentario, y recompone la hoja. */
function mapFueraDeComentarios(css: string, fn: (trozo: string) => string): string {
  let salida = '';
  let ultimo = 0;
  for (const m of css.matchAll(COMENTARIO)) {
    salida += fn(css.slice(ultimo, m.index)) + m[0];
    ultimo = m.index + m[0].length;
  }
  return salida + fn(css.slice(ultimo));
}
