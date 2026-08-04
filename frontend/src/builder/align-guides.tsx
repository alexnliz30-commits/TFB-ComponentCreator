/**
 * Imantado y guías al colocar un bloque a mano.
 *
 * Mover un bloque libre escribía el píxel exacto donde se soltó el ratón, así
 * que dos bloques que *parecían* alineados casi nunca lo estaban: el código
 * exportado acababa con un `left-[137px]` y un `left-[139px]`. Aquí el gesto se
 * imanta a los bordes y centros del contenedor y de los hermanos, y se dibuja la
 * línea que explica por qué el bloque ha saltado a ese punto.
 *
 * El imantado corrige la POSICIÓN QUE SE ESCRIBE, no solo lo que se pinta: si
 * solo alineara el dibujo, el lienzo volvería a mentir sobre el código.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Distancia a la que un borde se considera «alineado» y salta. */
const THRESHOLD = 6;

export interface Guide {
  /** `x`: línea vertical (alinea horizontalmente). `y`: línea horizontal. */
  axis: 'x' | 'y';
  /** Posición dentro del contenedor, en píxeles. */
  offset: number;
  /** Contenedor en cuyas coordenadas vive la línea. */
  parentId: string;
}

/** Caja de un candidato, en coordenadas del contenedor. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GuideState {
  guides: Guide[];
  setGuides: (guides: Guide[]) => void;
}

const GuideCtx = createContext<GuideState>({ guides: [], setGuides: () => {} });

export function AlignGuideProvider({ children }: { children: ReactNode }) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const value = useMemo(() => ({ guides, setGuides }), [guides]);
  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

export const useGuideSink = () => useContext(GuideCtx).setGuides;

/**
 * Líneas activas de un contenedor.
 *
 * Se dibujan DENTRO del contenedor —que es marco de referencia siempre que
 * aloja un bloque libre— para que la línea y el bloque se midan contra lo mismo.
 */
export function AlignGuides({ parentId }: { parentId: string }) {
  const { guides } = useContext(GuideCtx);
  const mine = guides.filter((g) => g.parentId === parentId);
  if (mine.length === 0) return null;

  return (
    <>
      {mine.map((g, i) => (
        <div
          key={`${g.axis}-${g.offset}-${i}`}
          style={g.axis === 'x' ? { left: g.offset } : { top: g.offset }}
          className={`absolute z-40 pointer-events-none bg-fuchsia-500 ${
            g.axis === 'x' ? 'top-0 bottom-0 w-px' : 'left-0 right-0 h-px'
          }`}
        />
      ))}
    </>
  );
}

/**
 * Puntos a los que merece la pena alinearse en un eje.
 *
 * Bordes y centro: son los que el ojo reconoce como «alineado». El centro del
 * contenedor va aparte porque centrar es la petición más frecuente y su punto no
 * coincide con ningún borde de ningún hermano.
 */
function targetsOf(container: Box, siblings: Box[], axis: 'x' | 'y'): number[] {
  const start = (b: Box) => (axis === 'x' ? b.left : b.top);
  const size = (b: Box) => (axis === 'x' ? b.width : b.height);

  const out = [0, size(container) / 2, size(container)];
  for (const s of siblings) {
    out.push(start(s), start(s) + size(s) / 2, start(s) + size(s));
  }
  return out;
}

export interface SnapResult {
  left: number;
  top: number;
  guides: Guide[];
}

/**
 * Ajusta la posición propuesta al punto de alineación más cercano.
 *
 * Se prueban los TRES bordes del bloque que se mueve (inicio, centro, fin)
 * contra cada punto candidato: alinear por el centro o por el borde derecho es
 * tan legítimo como por el izquierdo, y quien arrastra espera que salte por el
 * borde que ha acercado.
 */
export function snapPosition(
  proposed: { left: number; top: number },
  moving: { width: number; height: number },
  container: Box,
  siblings: Box[],
  parentId: string,
): SnapResult {
  const guides: Guide[] = [];
  const result = { left: proposed.left, top: proposed.top };

  for (const axis of ['x', 'y'] as const) {
    const pos = axis === 'x' ? proposed.left : proposed.top;
    const extent = axis === 'x' ? moving.width : moving.height;
    const targets = targetsOf(container, siblings, axis);

    let best: { delta: number; offset: number } | null = null;
    // Los bordes del bloque, como desplazamiento desde su esquina.
    for (const edge of [0, extent / 2, extent]) {
      for (const target of targets) {
        const delta = target - (pos + edge);
        if (Math.abs(delta) > THRESHOLD) continue;
        if (!best || Math.abs(delta) < Math.abs(best.delta)) {
          best = { delta, offset: target };
        }
      }
    }

    if (!best) continue;
    if (axis === 'x') result.left = Math.round(pos + best.delta);
    else result.top = Math.round(pos + best.delta);
    guides.push({ axis, offset: Math.round(best.offset), parentId });
  }

  return { ...result, guides };
}
