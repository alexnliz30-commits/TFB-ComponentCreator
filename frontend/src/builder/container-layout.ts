/**
 * Cómo un contenedor coloca a sus hijos, dicho en términos de lo que se ve.
 *
 * El panel de propiedades ya permitía esto, pero como cuatro desplegables de
 * Tailwind en crudo (`flex-col`, `justify-between`, `items-center`, `gap-4`):
 * había que saber qué eje es el principal y que `justify` cambia de significado
 * al girar la dirección. Aquí se pide «arriba a la derecha» y la traducción
 * ocurre dentro.
 *
 * Las clases resultantes son las mismas de siempre, así que el código exportado
 * no cambia de forma: cambia quién tiene que saber escribirlas.
 */

import { setUtility, getUtility } from './style-utils';

/**
 * `flujo` NO es una dirección: es «este contenedor no coloca a sus hijos».
 *
 * Sin este tercer estado, un contenedor recién creado —sin `flex` ninguno— se
 * leía como `row` y el menú marcaba «Fila» en azul mientras los hijos se
 * apilaban en vertical delante de tus ojos. El control describía un estado que
 * no existía, que es la peor forma de equivocarse en un editor visual: no
 * puedes corregir lo que el editor te dice que ya está bien.
 */
export type Axis = 'row' | 'col' | 'flujo';
/** Posición del bloque de hijos dentro del contenedor, en cada eje. */
export type Placement = 'start' | 'center' | 'end';

const DISPLAY = /^(block|inline-block|inline|flex|inline-flex|grid|hidden)$/;
const DIRECTION = /^flex-(row|col|row-reverse|col-reverse)$/;
const JUSTIFY = /^justify-(start|center|end|between|around|evenly)$/;
const ITEMS = /^items-(start|center|end|stretch|baseline)$/;
const GAP = /^gap-(\d+(\.\d+)?|px)$/;

export const GAP_STEPS = ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6', 'gap-8', 'gap-12'];

export interface LayoutPreset {
  axis: Axis;
  /** Horizontal y vertical tal como los ve el usuario, no como ejes de flexbox. */
  h: Placement;
  v: Placement;
  /** Reparte el sobrante entre los hijos en lugar de agruparlos. */
  spread: boolean;
}

/**
 * Presets que se ofrecen como una rejilla de 3×3 más un botón de repartir.
 *
 * Es la retícula que usan las herramientas de diseño: cada celda es «dónde
 * quiero el grupo de hijos», y eso es lo que se entiende sin explicación.
 */
export const LAYOUT_PRESETS: { h: Placement; v: Placement; label: string }[] = [
  { h: 'start', v: 'start', label: 'Arriba a la izquierda' },
  { h: 'center', v: 'start', label: 'Arriba al centro' },
  { h: 'end', v: 'start', label: 'Arriba a la derecha' },
  { h: 'start', v: 'center', label: 'En medio a la izquierda' },
  { h: 'center', v: 'center', label: 'Centrado' },
  { h: 'end', v: 'center', label: 'En medio a la derecha' },
  { h: 'start', v: 'end', label: 'Abajo a la izquierda' },
  { h: 'center', v: 'end', label: 'Abajo al centro' },
  { h: 'end', v: 'end', label: 'Abajo a la derecha' },
];

/**
 * En una fila, el eje principal es el horizontal; en una columna, el vertical.
 *
 * Esta es exactamente la regla que obliga a entender flexbox, y la única razón
 * de que exista este módulo: se aplica una vez, aquí.
 */
function axesOf(preset: LayoutPreset): { justify: Placement | 'between'; items: Placement } {
  const enFila = preset.axis !== 'col';
  const main = enFila ? preset.h : preset.v;
  const cross = enFila ? preset.v : preset.h;
  return { justify: preset.spread ? 'between' : main, items: cross };
}

/** Escribe el preset en el `className` del contenedor. */
export function applyLayoutPreset(className: string, preset: LayoutPreset): string {
  // Volver al flujo normal quita las cuatro utilidades, no solo el `flex`:
  // dejar `justify-*` e `items-*` colgando ensucia el código exportado con
  // clases que ya no hacen nada y reaparecen al volver a poner `flex`.
  if (preset.axis === 'flujo') {
    let limpio = setUtility(className, '', DISPLAY, '');
    limpio = setUtility(limpio, '', DIRECTION, '');
    limpio = setUtility(limpio, '', JUSTIFY, '');
    return setUtility(limpio, '', ITEMS, '');
  }
  const { justify, items } = axesOf(preset);
  let cls = className;
  // `flex` explícito: sin él, `justify-*` e `items-*` no significan nada y el
  // contenedor se quedaría exactamente como estaba pese a mostrar la celda
  // marcada como activa.
  cls = setUtility(cls, '', DISPLAY, 'flex');
  cls = setUtility(cls, '', DIRECTION, preset.axis === 'row' ? 'flex-row' : 'flex-col');
  cls = setUtility(cls, '', JUSTIFY, `justify-${justify}`);
  cls = setUtility(cls, '', ITEMS, `items-${items}`);
  return cls;
}

/** Lee del `className` el preset que está activo, para poder resaltarlo. */
export function currentLayoutPreset(className: string): LayoutPreset {
  // Solo hay dirección si el contenedor es realmente una caja flexible.
  const display = getUtility(className, '', DISPLAY);
  const colocaHijos = display === 'flex' || display === 'inline-flex';
  const axis: Axis = !colocaHijos
    ? 'flujo'
    : getUtility(className, '', DIRECTION).startsWith('flex-col') ? 'col' : 'row';
  const justify = getUtility(className, '', JUSTIFY).replace('justify-', '') || 'start';
  const items = getUtility(className, '', ITEMS).replace('items-', '') || 'start';

  const spread = justify === 'between' || justify === 'around' || justify === 'evenly';
  const main = (spread ? 'start' : justify) as Placement;
  const cross = (items === 'stretch' || items === 'baseline' ? 'start' : items) as Placement;

  const enFila = axis !== 'col';
  return {
    axis,
    h: enFila ? main : cross,
    v: enFila ? cross : main,
    spread,
  };
}

/** Avanza por la escala de separación entre hijos. */
export function stepGap(className: string, delta: number): string {
  const current = getUtility(className, '', GAP);
  const idx = GAP_STEPS.indexOf(current);
  const next = idx === -1 ? (delta > 0 ? 4 : 0) : Math.min(GAP_STEPS.length - 1, Math.max(0, idx + delta));
  return setUtility(className, '', GAP, GAP_STEPS[next]);
}

export { GAP as GAP_MATCHER };
