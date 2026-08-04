/**
 * Alinear y repartir bloques dentro de su contenedor.
 *
 * Un bloque puede estar en el flujo o fuera de él, y «alinéalo a la derecha»
 * significa cosas distintas en cada caso: fuera del flujo es un anclaje al borde
 * del contenedor; dentro es un margen automático que empuja al bloque. Aquí se
 * decide cuál de las dos, para que el usuario pida el RESULTADO y no la técnica.
 *
 * Todo lo que se escribe sale del vocabulario compilado (`style-vocabulary.js`),
 * así que lo que se ve en el lienzo es exactamente lo que hará el componente
 * exportado; `verify:styles` lo comprueba.
 */

import { setUtility, getUtility, isOutOfFlow, WIDTH_MATCHER } from './style-utils';
import {
  LEFT_MATCHER, TOP_MATCHER, RIGHT_MATCHER, BOTTOM_MATCHER, INSET_MATCHER,
} from './BlockRenderer';

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export const ALIGN_EDGES: { edge: AlignEdge; axis: 'x' | 'y'; label: string; icon: string }[] = [
  { edge: 'left', axis: 'x', label: 'Alinear a la izquierda', icon: '⌊' },
  { edge: 'center', axis: 'x', label: 'Centrar horizontalmente', icon: '⌶' },
  { edge: 'right', axis: 'x', label: 'Alinear a la derecha', icon: '⌋' },
  { edge: 'top', axis: 'y', label: 'Alinear arriba', icon: '⌐' },
  { edge: 'middle', axis: 'y', label: 'Centrar verticalmente', icon: '⊟' },
  { edge: 'bottom', axis: 'y', label: 'Alinear abajo', icon: '⌂' },
];

const TRANSLATE_X = /^-?translate-x-(\[[^\]]+\]|1\/2|\d+|full)$/;
const TRANSLATE_Y = /^-?translate-y-(\[[^\]]+\]|1\/2|\d+|full)$/;
const MX_MATCHER = /^mx-(\d+(\.\d+)?|px|auto)$/;
const ML_MATCHER = /^ml-(\d+(\.\d+)?|px|auto)$/;
const MR_MATCHER = /^mr-(\d+(\.\d+)?|px|auto)$/;
const SELF_MATCHER = /^self-(auto|start|center|end|stretch|baseline)$/;
const DISPLAY_MATCHER = /^(block|inline-block|inline|flex|inline-flex|grid|hidden)$/;

/** Limpia los anclajes de un eje: dos opuestos a la vez estiran en vez de alinear. */
function clearAxis(cls: string, axis: 'x' | 'y'): string {
  const matchers = axis === 'x'
    ? [LEFT_MATCHER, RIGHT_MATCHER, TRANSLATE_X]
    : [TOP_MATCHER, BOTTOM_MATCHER, TRANSLATE_Y];
  return [...matchers, INSET_MATCHER].reduce((acc, m) => setUtility(acc, '', m, ''), cls);
}

/**
 * Alinea un bloque FUERA del flujo anclándolo a su contenedor.
 *
 * El centro se expresa como «al 50 % y medio bloque hacia atrás», no en píxeles:
 * así sigue centrado cuando el contenedor cambia de ancho, que es justo lo que
 * se espera de un componente que debe amoldarse a la sección que lo aloja.
 */
function alignFree(cls: string, edge: AlignEdge): string {
  const axis = edge === 'left' || edge === 'center' || edge === 'right' ? 'x' : 'y';
  const base = clearAxis(cls, axis);

  switch (edge) {
    case 'left': return setUtility(base, '', LEFT_MATCHER, 'left-0');
    case 'right': return setUtility(base, '', RIGHT_MATCHER, 'right-0');
    case 'top': return setUtility(base, '', TOP_MATCHER, 'top-0');
    case 'bottom': return setUtility(base, '', BOTTOM_MATCHER, 'bottom-0');
    case 'center':
      return setUtility(setUtility(base, '', LEFT_MATCHER, 'left-1/2'), '', TRANSLATE_X, '-translate-x-1/2');
    case 'middle':
      return setUtility(setUtility(base, '', TOP_MATCHER, 'top-1/2'), '', TRANSLATE_Y, '-translate-y-1/2');
  }
}

/**
 * Alinea un bloque QUE SIGUE EN EL FLUJO.
 *
 * En horizontal se usan márgenes automáticos: funcionan igual si el contenedor
 * es un bloque normal o una caja flexible, y no obligan a sacar el bloque del
 * flujo —que cambiaría cómo se comportan sus hermanos— solo para moverlo.
 *
 * En vertical se usa `self-*`, que solo significa algo cuando el contenedor
 * reparte a sus hijos en una fila; quien llama decide si ofrecerlo.
 */
function alignInFlow(cls: string, edge: AlignEdge): string {
  const clearH = (c: string) =>
    [MX_MATCHER, ML_MATCHER, MR_MATCHER].reduce((acc, m) => setUtility(acc, '', m, ''), c);

  /**
   * Los márgenes automáticos solo mueven a un elemento DE BLOQUE con un ancho
   * definido. Buena parte de los 85 tipos son de línea —botón, badge, enlace,
   * span—, y sobre ellos `ml-auto` no hacía absolutamente nada: se pulsaba
   * «alinear a la derecha» y el bloque se quedaba quieto.
   *
   * Se les da nivel de bloque, y ancho «el de su contenido» si no tenían uno
   * propio: sin eso pasarían a ocupar todo el ancho y alinearlos dejaría de
   * tener sentido, porque ya no sobraría espacio por ningún lado.
   */
  const blockLevel = (c: string) => {
    const withDisplay = setUtility(c, '', DISPLAY_MATCHER, 'block');
    return WIDTH_MATCHER.test(getUtility(c, '', WIDTH_MATCHER))
      ? withDisplay
      : setUtility(withDisplay, '', WIDTH_MATCHER, 'w-fit');
  };

  switch (edge) {
    // `mr-auto` empuja el margen sobrante a la derecha, dejando el bloque a la
    // izquierda. Es al revés de lo que sugiere el nombre.
    case 'left': return setUtility(blockLevel(clearH(cls)), '', MR_MATCHER, 'mr-auto');
    case 'center': return setUtility(blockLevel(clearH(cls)), '', MX_MATCHER, 'mx-auto');
    case 'right': return setUtility(blockLevel(clearH(cls)), '', ML_MATCHER, 'ml-auto');
    case 'top': return setUtility(cls, '', SELF_MATCHER, 'self-start');
    case 'middle': return setUtility(cls, '', SELF_MATCHER, 'self-center');
    case 'bottom': return setUtility(cls, '', SELF_MATCHER, 'self-end');
  }
}

/** Alineación del bloque respecto a su contenedor, según esté o no en el flujo. */
export function alignBlock(className: string, edge: AlignEdge): string {
  return isOutOfFlow(className)
    ? alignFree(className, edge)
    : alignInFlow(className, edge);
}

export interface DistributeInput {
  id: string;
  className: string;
  /** Caja medida en el lienzo, en coordenadas del contenedor. */
  box: { left: number; top: number; width: number; height: number };
}

/**
 * Reparte huecos iguales entre bloques libres, sin mover los dos extremos.
 *
 * Los extremos se respetan a propósito: quien reparte ya ha decidido dónde
 * empieza y dónde acaba la serie, y moverlos convertiría «reparte» en «recoloca
 * todo», que no es lo que se ha pedido.
 */
export function distributeFree(
  items: DistributeInput[],
  axis: 'x' | 'y',
): Record<string, string> {
  const free = items.filter((i) => isOutOfFlow(i.className));
  if (free.length < 3) return {};

  const start = (i: DistributeInput) => (axis === 'x' ? i.box.left : i.box.top);
  const size = (i: DistributeInput) => (axis === 'x' ? i.box.width : i.box.height);

  const ordered = [...free].sort((a, b) => start(a) - start(b));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  const span = start(last) - (start(first) + size(first));
  const occupied = ordered.slice(1, -1).reduce((sum, i) => sum + size(i), 0);
  const gap = (span - occupied) / (ordered.length - 1);
  // Los bloques ya se solapan: repartir daría huecos negativos y el resultado
  // sería peor que dejarlo como está.
  if (gap < 0) return {};

  const out: Record<string, string> = {};
  let cursor = start(first) + size(first) + gap;
  for (const item of ordered.slice(1, -1)) {
    const value = Math.round(cursor);
    const matcher = axis === 'x' ? LEFT_MATCHER : TOP_MATCHER;
    const name = axis === 'x' ? 'left' : 'top';
    out[item.id] = setUtility(
      clearAxis(item.className, axis),
      '', matcher, `${name}-[${value}px]`,
    );
    cursor += size(item) + gap;
  }
  return out;
}
