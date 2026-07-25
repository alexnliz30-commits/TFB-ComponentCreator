/**
 * Tipos de `style-vocabulary.js`.
 *
 * El módulo es JavaScript porque `tailwind.config.js` lo importa en tiempo de
 * build de Node, donde no hay transpilación de TypeScript; estas firmas son lo
 * que ve el resto de la aplicación.
 */

export interface VocabularyGroup {
  key: string;
  label: string;
  /** Variantes que el safelist expande para este grupo. */
  variants: ('responsive' | 'state')[];
  /** Acota los estados a expandir; por defecto, todos los de `STATE_VARIANTS`. */
  states?: string[];
  classes: string[];
  /** Descripción compacta de la gramática, para el prompt del asistente. */
  ai: string;
}

export interface VocabularyForAi {
  nota: string;
  escalaEspaciado: string;
  familiasColor: string;
  tonosColor: string;
  variantesPantalla: string;
  variantesEstado: string;
  grupos: { grupo: string; utilidades: string }[];
}

export declare const SPACING: string[];
export declare const SIZE_SCALE: string[];
export declare const COLOR_FAMILIES: string[];
export declare const COLOR_SHADES: string[];
export declare const COLOR_KEYWORDS: string[];
export declare const TEXT_SIZES: string[];
export declare const FONT_WEIGHTS: string[];
export declare const RADII: string[];
export declare const SHADOWS: string[];
export declare const FRACTIONS: string[];
export declare const MAX_WIDTHS: string[];
export declare const GRID_COUNTS: string[];
export declare const RESPONSIVE_VARIANTS: string[];
export declare const STATE_VARIANTS: string[];
export declare const THEME_ROLES: string[];

export declare const VOCABULARY_GROUPS: VocabularyGroup[];
export declare const VOCABULARY_CLASSES: string[];
export declare const SAFELIST: string[];
export declare const VOCABULARY_FOR_AI: VocabularyForAi;

export declare function isKnownUtility(cls: string): boolean;
export declare function unknownUtilities(className: string | undefined): string[];
