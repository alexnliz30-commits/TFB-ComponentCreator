/**
 * Catálogo de la paleta que se envía a la IA como contexto.
 *
 * La IA necesita conocer los tipos de bloque reales y, sobre todo, qué
 * propiedades entiende cada uno y en qué formato, para que lo que genere se
 * renderice correctamente en el lienzo. Codificar eso en el prompt del backend
 * lo dejaría desincronizado de la paleta a la primera que se añadiera o
 * renombrara un bloque; por eso se deriva aquí, en tiempo de ejecución, de la
 * misma `BLOCK_DEFINITIONS` que alimenta la paleta visual, y se manda con cada
 * petición del asistente.
 */

import { BLOCK_DEFINITIONS } from './defaults';
import { VOCABULARY_FOR_AI } from './style-vocabulary.js';

export interface PaletteEntry {
  type: string;
  label: string;
  isContainer: boolean;
  /** Propiedades que el tipo entiende, con un valor de ejemplo (formato incluido). */
  defaultProps: Record<string, string>;
}

/** Se calcula una sola vez: las definiciones no cambian en tiempo de ejecución. */
export const PALETTE_CONTEXT: PaletteEntry[] = BLOCK_DEFINITIONS.map((d) => ({
  type: d.type,
  label: d.label,
  isContainer: d.isContainer,
  defaultProps: d.defaultProps,
}));

export const PALETTE_CONTEXT_JSON = JSON.stringify(PALETTE_CONTEXT);

/**
 * Gramática de utilidades que el lienzo sabe pintar, para el mismo contexto.
 *
 * Viaja junto a la paleta y por el mismo motivo: la paleta dice QUÉ bloques hay,
 * el vocabulario dice CON QUÉ se pueden estilar. Sin él la IA escribía Tailwind
 * correcto pero fuera del CSS compilado del editor, y el bloque se renderizaba
 * sin espaciado ni rejilla aunque el código exportado fuera bueno.
 */
export const STYLE_VOCABULARY_JSON = JSON.stringify(VOCABULARY_FOR_AI);
