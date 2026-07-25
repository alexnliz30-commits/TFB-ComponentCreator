/**
 * Dónde va a caer lo que se está arrastrando.
 *
 * Sin esta pista el lienzo no dice nada: se soltaba a ciegas y el bloque
 * aparecía en un sitio que no siempre era el esperado (soltar sobre un bloque
 * insertaba *siempre* antes de él, aunque el cursor estuviera en su mitad
 * inferior). El destino se calcula una sola vez, en el contenedor del arrastre,
 * y de ahí lo leen tanto el indicador visual como la acción que se despacha al
 * soltar, de modo que lo que se ve y lo que ocurre no pueden discrepar.
 */

import { createContext, useContext } from 'react';

export interface DropHint {
  /** Bloque sobre el que está el cursor. */
  overId: string;
  /** `true` si se insertará detrás de él; `false`, delante. */
  after: boolean;
}

const DropHintCtx = createContext<DropHint | null>(null);

export const DropHintProvider = DropHintCtx.Provider;

/** Posición de la línea de inserción para este bloque, o `null` si no le toca. */
export function useDropHint(blockId: string): 'before' | 'after' | null {
  const hint = useContext(DropHintCtx);
  if (!hint || hint.overId !== blockId) return null;
  return hint.after ? 'after' : 'before';
}
