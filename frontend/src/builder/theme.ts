/**
 * Tema de la librería: los estilos globales que comparten todos sus componentes.
 *
 * Un kit de interfaz no es una colección de componentes sueltos: comparte color
 * de marca, tipografía, redondeo y grosor de línea. Aquí se modela ese lenguaje
 * común una sola vez, y cada componente lo consume por **rol** (`primario`,
 * `superficie`, `borde`…) en lugar de repetir colores literales. Cambiar el tema
 * repinta la librería entera; personalizar un componente sigue siendo posible
 * porque sus clases propias ganan a las del rol.
 *
 * Se materializa como **variables CSS** y no como configuración de Tailwind a
 * propósito: el paquete exportado ya es autónomo (§CSS autónomo) y debe seguir
 * siéndolo, sin obligar al proyecto anfitrión a tener Tailwind ni a extender su
 * `tailwind.config`. Una hoja con `--vz-*` funciona en cualquier sitio.
 *
 * Los roles se consumen desde `schema.ts`/`defaults.ts` como clases arbitrarias
 * literales (`bg-[var(--vz-primario)]`). Es importante que estén escritas tal
 * cual en el fuente: el JIT de Tailwind escanea los ficheros y solo genera las
 * clases que ve, así que una clase construida en tiempo de ejecución no tendría
 * regla en el lienzo.
 */

import { globalLayer } from './cascade';

/** Prefijo de todas las variables del tema. */
export const THEME_VAR_PREFIX = '--vz';

export interface ThemeColors {
  /** Color de marca: acciones principales, foco, elementos activos. */
  primario: string;
  /** Texto/icono que se dibuja encima del primario. */
  primarioContraste: string;
  /** Fondo de tarjetas, paneles y campos. */
  superficie: string;
  /** Fondo secundario: cabeceras de tabla, zonas destacadas. */
  superficieAlt: string;
  /** Texto principal. */
  texto: string;
  /** Texto secundario, ayudas y etiquetas. */
  textoSuave: string;
  /** Líneas: bordes, separadores, contorno de campos. */
  borde: string;
  exito: string;
  aviso: string;
  error: string;
}

export interface ThemeTypography {
  /** Pila de fuentes del componente. */
  familia: string;
  /** Tamaño base en px, del que cuelga el resto de la escala. */
  tamanoBase: number;
  /** Grosor de los títulos. */
  pesoTitulo: string;
}

export interface ThemeShape {
  /** Redondeo de esquinas (`rounded-[var(--vz-radio)]`). */
  radio: string;
  /** Grosor de las líneas de los componentes. */
  grosorBorde: string;
  /** Sombra de superficies elevadas. */
  sombra: string;
}

export interface Theme {
  colors: ThemeColors;
  typography: ThemeTypography;
  shape: ThemeShape;
}

export const DEFAULT_THEME: Theme = {
  colors: {
    primario: '#4f46e5',
    primarioContraste: '#ffffff',
    superficie: '#ffffff',
    superficieAlt: '#f8fafc',
    texto: '#0f172a',
    textoSuave: '#64748b',
    borde: '#e2e8f0',
    exito: '#16a34a',
    aviso: '#d97706',
    error: '#dc2626',
  },
  typography: {
    familia: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    tamanoBase: 16,
    pesoTitulo: '600',
  },
  shape: {
    radio: '0.5rem',
    grosorBorde: '1px',
    sombra: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  },
};

/**
 * Temas de partida.
 *
 * No son decoración: dan un punto de arranque coherente a quien no quiere
 * elegir diez colores a mano, que es el caso habitual al crear una librería.
 */
export const THEME_PRESETS: { id: string; label: string; theme: Theme }[] = [
  { id: 'indigo', label: 'Índigo (por defecto)', theme: DEFAULT_THEME },
  {
    id: 'esmeralda',
    label: 'Esmeralda',
    theme: {
      ...DEFAULT_THEME,
      colors: { ...DEFAULT_THEME.colors, primario: '#059669', superficieAlt: '#f0fdf4', borde: '#d1fae5' },
      shape: { ...DEFAULT_THEME.shape, radio: '0.75rem' },
    },
  },
  {
    id: 'pizarra',
    label: 'Pizarra sobria',
    theme: {
      ...DEFAULT_THEME,
      colors: { ...DEFAULT_THEME.colors, primario: '#0f172a', superficieAlt: '#f1f5f9', borde: '#cbd5e1' },
      shape: { ...DEFAULT_THEME.shape, radio: '0.25rem', sombra: 'none' },
    },
  },
  {
    id: 'nocturno',
    label: 'Nocturno',
    theme: {
      ...DEFAULT_THEME,
      colors: {
        primario: '#6366f1',
        primarioContraste: '#ffffff',
        superficie: '#1e293b',
        superficieAlt: '#0f172a',
        texto: '#f1f5f9',
        textoSuave: '#94a3b8',
        borde: '#334155',
        exito: '#22c55e',
        aviso: '#f59e0b',
        error: '#f87171',
      },
    },
  },
  {
    id: 'calido',
    label: 'Cálido',
    theme: {
      ...DEFAULT_THEME,
      colors: { ...DEFAULT_THEME.colors, primario: '#ea580c', superficieAlt: '#fff7ed', borde: '#fed7aa' },
      typography: { ...DEFAULT_THEME.typography, familia: 'Georgia, "Times New Roman", serif' },
      shape: { ...DEFAULT_THEME.shape, radio: '1rem' },
    },
  },
];

/** Pares `--vz-*` → valor, en el orden en que se escriben en la hoja. */
export function themeVariables(theme: Theme): [string, string][] {
  const { colors, typography, shape } = theme;
  return [
    [`${THEME_VAR_PREFIX}-primario`, colors.primario],
    [`${THEME_VAR_PREFIX}-primario-contraste`, colors.primarioContraste],
    [`${THEME_VAR_PREFIX}-superficie`, colors.superficie],
    [`${THEME_VAR_PREFIX}-superficie-alt`, colors.superficieAlt],
    [`${THEME_VAR_PREFIX}-texto`, colors.texto],
    [`${THEME_VAR_PREFIX}-texto-suave`, colors.textoSuave],
    [`${THEME_VAR_PREFIX}-borde`, colors.borde],
    [`${THEME_VAR_PREFIX}-exito`, colors.exito],
    [`${THEME_VAR_PREFIX}-aviso`, colors.aviso],
    [`${THEME_VAR_PREFIX}-error`, colors.error],
    [`${THEME_VAR_PREFIX}-fuente`, typography.familia],
    [`${THEME_VAR_PREFIX}-texto-base`, `${typography.tamanoBase}px`],
    [`${THEME_VAR_PREFIX}-peso-titulo`, typography.pesoTitulo],
    [`${THEME_VAR_PREFIX}-radio`, shape.radio],
    [`${THEME_VAR_PREFIX}-grosor-borde`, shape.grosorBorde],
    [`${THEME_VAR_PREFIX}-sombra`, shape.sombra],
  ];
}

/** Las mismas variables como objeto de estilo, para aplicarlas en el lienzo. */
export function themeStyle(theme: Theme): Record<string, string> {
  return Object.fromEntries(themeVariables(theme));
}

/**
 * Hoja de estilos GLOBALES de la librería: el tema y, si lo hay, su CSS libre.
 *
 * Se acota al contenedor del componente y no a `:root` por la misma razón que el
 * reset del CSS autónomo: el paquete se copia dentro de una web ajena y no puede
 * imponerle su tipografía ni sus colores.
 *
 * Va en la capa global (ver `cascade.ts`), que es lo que hace que mande sobre los
 * estilos propios de cada componente. Las reglas de tipografía siguen con
 * `:where()`, especificidad cero, porque su disputa no es con el componente sino
 * con las utilidades de Tailwind del propio bloque, que van sin capa y deben
 * seguir ganando: es en el panel de propiedades donde se elige el aspecto
 * concreto de un elemento.
 *
 * @param globalCss CSS libre de la librería, compartido por todos sus componentes.
 */
export function themeCss(
  theme: Theme,
  selector = '.visualiza-component',
  globalCss = '',
): string {
  const declarations = themeVariables(theme)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  return globalLayer([
    '/* Tema de la librería: estilos globales compartidos por sus componentes. */',
    `${selector} {`,
    declarations,
    '}',
    '',
    `:where(${selector}) {`,
    `  font-family: var(${THEME_VAR_PREFIX}-fuente);`,
    `  font-size: var(${THEME_VAR_PREFIX}-texto-base);`,
    `  color: var(${THEME_VAR_PREFIX}-texto);`,
    '}',
    '',
    `:where(${selector}) h1, :where(${selector}) h2, :where(${selector}) h3,`,
    `:where(${selector}) h4, :where(${selector}) h5, :where(${selector}) h6 {`,
    `  font-weight: var(${THEME_VAR_PREFIX}-peso-titulo);`,
    '}',
    '',
    ...(globalCss.trim()
      ? ['/* Estilos globales propios de la librería. */', globalCss.trim(), '']
      : []),
  ].join('\n'));
}

/** Mezcla un tema parcial (el guardado) sobre los valores por defecto. */
export function normalizeTheme(raw: unknown): Theme {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_THEME;
  const partial = raw as Partial<Theme>;
  return {
    colors: { ...DEFAULT_THEME.colors, ...(partial.colors ?? {}) },
    typography: { ...DEFAULT_THEME.typography, ...(partial.typography ?? {}) },
    shape: { ...DEFAULT_THEME.shape, ...(partial.shape ?? {}) },
  };
}
