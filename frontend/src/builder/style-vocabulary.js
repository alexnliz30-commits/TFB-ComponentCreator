/**
 * Vocabulario de estilo: la lista cerrada de utilidades Tailwind que el lienzo
 * es capaz de pintar.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * El CSS del editor se compila en build-time con `content: ./src/**` , así que
 * solo contiene las clases que aparecen LITERALMENTE escritas en las fuentes.
 * Todo lo demás —lo que escribe la IA en `className`, lo que elige el usuario en
 * el panel de propiedades, lo que teclea en el escape hatch— no tiene regla y el
 * navegador lo ignora en silencio. El componente se renderizaba sin espaciado ni
 * rejilla en el lienzo mientras que en Preview (Tailwind en runtime) y en el
 * paquete exportado (CLI de Tailwind) se veía bien: el lienzo mentía sobre lo
 * que exportaba, que es justo lo que el refactor a IR única vino a erradicar.
 *
 * ── Cómo lo resuelve ─────────────────────────────────────────────────────────
 * Este módulo enumera el vocabulario UNA vez y de él salen tres proyecciones que
 * antes habrían divergido:
 *   1. `SAFELIST`   → `tailwind.config.js`, para que esas reglas existan siempre.
 *   2. `VOCABULARY_FOR_AI` → contexto del asistente, para que la IA se limite a
 *      lo que el lienzo sabe pintar (gramática compacta, no la lista expandida).
 *   3. `isKnownUtility` → validación, para poder avisar de una clase muerta.
 *
 * Es JavaScript y no TypeScript a propósito: `tailwind.config.js` lo importa en
 * tiempo de build de Node, donde no hay transpilación. Los tipos viven en el
 * `.d.ts` hermano.
 *
 * ── Al ampliarlo ─────────────────────────────────────────────────────────────
 * Añadir aquí el grupo y ejecutar `npm run verify:styles`, que comprueba que
 * todo lo que el panel ofrece y todo lo que el prompt promete tiene regla real.
 */

// ── Escalas ──────────────────────────────────────────────────────────────────

/** Escala de espaciado. Superconjunto de la que ofrece el panel de propiedades. */
export const SPACING = [
  '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8',
  '10', '12', '14', '16', '20', '24', '32', 'px',
];

/**
 * Escala de anchura/altura: la de espaciado más los pasos grandes.
 * Va aparte porque `w-64` es corriente y `p-64` no, y multiplicar la escala
 * larga por los siete prefijos de padding y margin engordaría el CSS sin uso.
 */
export const SIZE_SCALE = [
  ...SPACING, '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96',
];

/**
 * Familias de color. Las mismas 17 que ofrece el panel (`style-utils.ts`).
 *
 * Se dejan fuera `zinc`, `lime`, `fuchsia` y `stone`: son casi indistinguibles
 * de vecinas que sí están y cada familia cuesta 11 tonos × 5 prefijos × sus
 * variantes en el CSS del editor.
 */
export const COLOR_FAMILIES = [
  'slate', 'gray', 'red', 'orange', 'amber', 'yellow', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'pink', 'rose',
];

export const COLOR_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

/** Colores sin escala de tono. */
export const COLOR_KEYWORDS = ['white', 'black', 'transparent', 'current', 'inherit'];

export const TEXT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];
export const FONT_WEIGHTS = ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'];
export const RADII = ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'];
export const SHADOWS = ['sm', 'md', 'lg', 'xl', '2xl', 'inner', 'none'];
export const FRACTIONS = ['1/2', '1/3', '2/3', '1/4', '3/4', '1/5', '2/5', '3/5', '4/5'];
export const MAX_WIDTHS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', 'full', 'min', 'max', 'fit', 'prose', 'none'];
export const GRID_COUNTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/** Variantes de tamaño de pantalla (mobile-first, las de `style-utils.ts`). */
export const RESPONSIVE_VARIANTS = ['sm', 'md', 'lg', 'xl'];

/** Variantes de estado. `group-hover` queda fuera: el emisor no genera `group`. */
export const STATE_VARIANTS = ['hover', 'focus', 'focus-visible', 'active', 'disabled'];

// ── Ayudas de construcción ───────────────────────────────────────────────────

const cross = (prefixes, values) =>
  prefixes.flatMap((p) => values.map((v) => (v === '' ? p : `${p}-${v}`)));

/** Todas las combinaciones de color para un conjunto de prefijos. */
const colors = (prefixes) =>
  cross(prefixes, [
    ...COLOR_KEYWORDS,
    ...COLOR_FAMILIES.flatMap((f) => COLOR_SHADES.map((s) => `${f}-${s}`)),
  ]);

// ── Roles del tema ───────────────────────────────────────────────────────────

/**
 * Los 10 roles semánticos de `theme.ts`, materializados como valor arbitrario.
 *
 * Van explícitos y no como patrón porque el safelist de Tailwind solo casa
 * patrones contra las utilidades que su tema puede generar, y un valor
 * arbitrario (`bg-[var(--x)]`) no es una de ellas.
 *
 * El hint `color:` es obligatorio en `text-`/`border-`/`ring-`/`divide-`: sin él
 * Tailwind no puede saber si el valor arbitrario es un color o un tamaño.
 */
export const THEME_ROLES = [
  'primario', 'primario-contraste', 'superficie', 'superficie-alt',
  'texto', 'texto-suave', 'borde', 'exito', 'aviso', 'error',
];

const themeRoleClasses = [
  ...THEME_ROLES.map((r) => `bg-[var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `text-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `border-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `ring-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `divide-[color:var(--vz-${r})]`),
  'rounded-[var(--vz-radio)]',
  'border-[length:var(--vz-grosor-borde)]',
  'shadow-[var(--vz-sombra)]',
  'font-[family-name:var(--vz-fuente)]',
  'text-[length:var(--vz-tamano-base)]',
];

// ── Grupos del vocabulario ───────────────────────────────────────────────────

/**
 * Cada grupo declara sus clases y qué variantes admite. `ai` es la descripción
 * compacta que viaja al prompt: la lista expandida (miles de clases) no cabe, y
 * una gramática se sigue mejor que un listado.
 */
export const VOCABULARY_GROUPS = [
  {
    key: 'display',
    label: 'Display y flujo',
    variants: ['responsive'],
    classes: [
      'block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid',
      'hidden', 'flow-root', 'contents',
    ],
    ai: 'block inline-block inline flex inline-flex grid hidden',
  },
  {
    key: 'flex',
    label: 'Flexbox',
    variants: ['responsive'],
    classes: [
      'flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse',
      'flex-wrap', 'flex-nowrap', 'flex-wrap-reverse',
      'flex-1', 'flex-auto', 'flex-initial', 'flex-none',
      'grow', 'grow-0', 'shrink', 'shrink-0',
      ...cross(['order'], ['first', 'last', 'none', '1', '2', '3', '4', '5']),
    ],
    ai: 'flex-row|flex-col (+ -reverse), flex-wrap, flex-1, grow, shrink-0, order-{1..5|first|last}',
  },
  {
    key: 'align',
    label: 'Alineación',
    variants: ['responsive'],
    classes: [
      ...cross(['justify'], ['start', 'center', 'end', 'between', 'around', 'evenly']),
      ...cross(['items'], ['start', 'center', 'end', 'stretch', 'baseline']),
      ...cross(['self'], ['auto', 'start', 'center', 'end', 'stretch']),
      ...cross(['content'], ['start', 'center', 'end', 'between', 'around', 'evenly']),
      ...cross(['place-items', 'place-content'], ['start', 'center', 'end', 'stretch']),
    ],
    ai: 'justify-{start|center|end|between|around|evenly}, items-{start|center|end|stretch|baseline}, self-*, content-*',
  },
  {
    key: 'gap',
    label: 'Separación',
    variants: ['responsive'],
    classes: cross(['gap', 'gap-x', 'gap-y'], SPACING),
    ai: 'gap-N, gap-x-N, gap-y-N con N en la escala de espaciado',
  },
  {
    key: 'grid',
    label: 'Rejilla',
    variants: ['responsive'],
    classes: [
      ...cross(['grid-cols'], [...GRID_COUNTS, 'none']),
      ...cross(['grid-rows'], ['1', '2', '3', '4', '5', '6', 'none']),
      ...cross(['col-span'], [...GRID_COUNTS, 'full']),
      ...cross(['row-span'], ['1', '2', '3', '4', '5', '6', 'full']),
      ...cross(['col-start', 'col-end'], [...GRID_COUNTS, 'auto']),
      'grid-flow-row', 'grid-flow-col', 'grid-flow-dense',
    ],
    ai: 'grid-cols-{1..12}, col-span-{1..12|full}, grid-rows-{1..6}, row-span-*, col-start-*',
  },
  {
    key: 'padding',
    label: 'Padding',
    variants: ['responsive'],
    classes: cross(['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl'], SPACING),
    ai: 'p-N px-N py-N pt-N pr-N pb-N pl-N',
  },
  {
    key: 'margin',
    label: 'Margin',
    variants: ['responsive'],
    classes: cross(['m', 'mx', 'my', 'mt', 'mr', 'mb', 'ml'], [...SPACING, 'auto']),
    ai: 'm-N mx-N my-N mt-N mr-N mb-N ml-N (+ mx-auto para centrar)',
  },
  {
    key: 'space',
    label: 'Espacio entre hijos',
    variants: ['responsive'],
    classes: [
      ...cross(['space-y', 'space-x'], SPACING),
      'space-y-reverse', 'space-x-reverse',
    ],
    ai: 'space-y-N, space-x-N (separan los hijos directos; la forma idiomática de espaciar una pila vertical)',
  },
  {
    key: 'size',
    label: 'Tamaño',
    variants: ['responsive'],
    classes: [
      ...cross(['w'], [...SIZE_SCALE, ...FRACTIONS, 'auto', 'full', 'screen', 'min', 'max', 'fit']),
      ...cross(['h'], [...SIZE_SCALE, ...FRACTIONS, 'auto', 'full', 'screen', 'min', 'max', 'fit']),
      ...cross(['min-w'], ['0', 'full', 'min', 'max', 'fit']),
      ...cross(['min-h'], ['0', 'full', 'screen', 'min', 'max', 'fit', ...SIZE_SCALE]),
      ...cross(['max-w'], MAX_WIDTHS),
      ...cross(['max-h'], ['full', 'screen', 'min', 'max', 'fit', ...SIZE_SCALE]),
      ...cross(['size'], SIZE_SCALE),
      ...cross(['aspect'], ['auto', 'square', 'video']),
    ],
    ai: 'w-N h-N (escala, fracciones 1/2 1/3…, full auto screen fit), max-w-{xs..7xl|full|prose}, min-h-N, aspect-square',
  },
  {
    key: 'typography',
    label: 'Tipografía',
    variants: ['responsive'],
    classes: [
      ...cross(['text'], TEXT_SIZES),
      ...cross(['font'], FONT_WEIGHTS),
      ...cross(['text'], ['left', 'center', 'right', 'justify']),
      ...cross(['leading'], ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose', '3', '4', '5', '6', '7', '8']),
      ...cross(['tracking'], ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']),
      'font-sans', 'font-serif', 'font-mono',
      'italic', 'not-italic', 'underline', 'line-through', 'no-underline', 'overline',
      'uppercase', 'lowercase', 'capitalize', 'normal-case',
      'truncate', 'text-ellipsis', 'text-clip', 'break-words', 'break-all',
      'whitespace-normal', 'whitespace-nowrap', 'whitespace-pre-wrap',
      'align-middle', 'align-top', 'align-bottom', 'align-baseline',
      ...cross(['line-clamp'], ['1', '2', '3', '4', '5', 'none']),
      ...cross(['indent'], ['0', '4', '8']),
    ],
    ai: 'text-{xs..7xl}, font-{light..extrabold}, text-{left|center|right}, leading-*, tracking-*, italic, underline, uppercase, truncate, whitespace-nowrap, line-clamp-N',
  },
  {
    key: 'list',
    label: 'Listas',
    variants: [],
    classes: ['list-disc', 'list-decimal', 'list-none', 'list-inside', 'list-outside'],
    ai: 'list-disc list-decimal list-none list-inside',
  },
  // Los grupos de color son, con diferencia, los que más pesan en el CSS
  // resultante (20 familias × 11 tonos por prefijo), así que cada uno declara
  // solo los estados que de verdad se usan en vez de los cinco.
  {
    key: 'color-text',
    label: 'Color de texto',
    variants: ['state'],
    states: ['hover', 'focus', 'disabled'],
    classes: colors(['text']),
    ai: 'text-{familia}-{tono} — solo si el usuario pide ese color concreto; por defecto usa los roles del tema',
  },
  {
    key: 'color-bg',
    label: 'Color de fondo',
    variants: ['state'],
    states: ['hover', 'focus', 'disabled'],
    classes: colors(['bg']),
    ai: 'bg-{familia}-{tono} — misma advertencia que el color de texto',
  },
  {
    key: 'color-border',
    label: 'Color de borde y anillo',
    variants: ['state'],
    states: ['hover', 'focus'],
    classes: colors(['border', 'ring']),
    ai: 'border-{familia}-{tono}, ring-{familia}-{tono}',
  },
  {
    key: 'color-misc',
    label: 'Color de apoyo',
    variants: [],
    // `outline-`, `decoration-`, `caret-` y `accent-` se quedan fuera de la
    // escala completa: casi nunca se usan y cada prefijo son 190 clases.
    classes: colors(['divide', 'placeholder']),
    ai: 'divide-{familia}-{tono}, placeholder-{familia}-{tono} (sin variantes de estado)',
  },
  {
    key: 'opacity',
    label: 'Opacidad',
    variants: ['state'],
    states: ['hover', 'disabled'],
    classes: cross(['opacity'], ['0', '5', '10', '20', '25', '30', '40', '50', '60', '70', '75', '80', '90', '95', '100']),
    ai: 'opacity-{0..100} (hover:opacity-90 es la forma de dar respuesta al pasar el ratón sin fijar un color)',
  },
  {
    key: 'border',
    label: 'Bordes',
    variants: ['state'],
    classes: [
      'border', 'border-0', 'border-2', 'border-4', 'border-8',
      ...cross(['border-t', 'border-r', 'border-b', 'border-l', 'border-x', 'border-y'], ['', '0', '2', '4', '8']),
      'border-solid', 'border-dashed', 'border-dotted', 'border-none',
      'divide-y', 'divide-x', 'divide-y-2', 'divide-x-2',
      'rounded', ...cross(['rounded'], RADII),
      ...cross(['rounded-t', 'rounded-r', 'rounded-b', 'rounded-l', 'rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl'], RADII),
      'ring', 'ring-0', 'ring-1', 'ring-2', 'ring-4', 'ring-inset',
      ...cross(['ring-offset'], ['0', '1', '2', '4']),
      'outline', 'outline-none', 'outline-1', 'outline-2', 'outline-offset-2',
    ],
    ai: 'border, border-{0|2|4|8}, border-{t|r|b|l}, border-dashed, rounded-{none..3xl|full}, ring-{0|1|2|4}, ring-inset, outline-none',
  },
  {
    key: 'effects',
    label: 'Sombra y efectos',
    variants: ['state'],
    classes: [
      'shadow', ...cross(['shadow'], SHADOWS),
      ...cross(['blur'], ['none', 'sm', 'md', 'lg']),
      ...cross(['backdrop-blur'], ['none', 'sm', 'md', 'lg']),
      ...cross(['scale'], ['95', '100', '105', '110']),
      ...cross(['rotate'], ['0', '45', '90', '180']),
      ...cross(['translate-x', 'translate-y'], ['0', '1', '2', '4', 'full']),
      // Centrar algo colocado a mano es `left-1/2` + `-translate-x-1/2`: la
      // mitad de su propio ancho hacia atrás. Se añade al vocabulario para que
      // la IA pueda usarlo —el vocabulario es lo que se le ofrece en el prompt—,
      // no porque al lienzo le falte la regla: el botón de alinear escribe esas
      // clases como literales y el JIT las compila al verlas en el fuente.
      ...cross(['translate-x', 'translate-y', '-translate-x', '-translate-y'], ['1/2']),
      'transform', 'transform-none',
    ],
    ai: 'shadow-{sm|md|lg|xl|2xl|inner|none}, blur-*, scale-{95|105|110}, rotate-*, translate-*',
  },
  {
    key: 'transition',
    label: 'Transición',
    variants: [],
    classes: [
      'transition', 'transition-none', 'transition-all', 'transition-colors',
      'transition-opacity', 'transition-shadow', 'transition-transform',
      ...cross(['duration'], ['75', '100', '150', '200', '300', '500', '700', '1000']),
      ...cross(['delay'], ['75', '100', '150', '200', '300', '500']),
      'ease-linear', 'ease-in', 'ease-out', 'ease-in-out',
      'animate-none', 'animate-spin', 'animate-ping', 'animate-pulse', 'animate-bounce',
    ],
    ai: 'transition, transition-colors, duration-N, ease-in-out, animate-spin, animate-pulse',
  },
  {
    key: 'position',
    label: 'Posición',
    variants: ['responsive'],
    classes: [
      'static', 'relative', 'absolute', 'fixed', 'sticky',
      ...cross(['top', 'right', 'bottom', 'left', 'inset', 'inset-x', 'inset-y'], ['0', '1', '2', '4', '6', '8', 'auto', 'full', '1/2']),
      ...cross(['z'], ['0', '10', '20', '30', '40', '50', 'auto']),
      'float-left', 'float-right', 'float-none', 'clear-both',
    ],
    ai: 'relative absolute fixed sticky, top/right/bottom/left/inset-N, z-{0..50}',
  },
  {
    key: 'overflow',
    label: 'Desbordamiento y objeto',
    variants: [],
    classes: [
      ...cross(['overflow', 'overflow-x', 'overflow-y'], ['auto', 'hidden', 'visible', 'scroll', 'clip']),
      ...cross(['object'], ['contain', 'cover', 'fill', 'none', 'scale-down', 'center', 'top', 'bottom']),
      'resize', 'resize-none', 'resize-y',
    ],
    ai: 'overflow-{auto|hidden|x-auto|y-auto}, object-{cover|contain}, resize-none',
  },
  {
    key: 'interactivity',
    label: 'Interacción',
    variants: ['state'],
    classes: [
      'cursor-pointer', 'cursor-default', 'cursor-not-allowed', 'cursor-text', 'cursor-move', 'cursor-wait',
      'select-none', 'select-text', 'select-all',
      'pointer-events-none', 'pointer-events-auto',
      'appearance-none', 'sr-only', 'not-sr-only',
      'opacity-50', 'opacity-100',
    ],
    ai: 'cursor-pointer, cursor-not-allowed, select-none, pointer-events-none, appearance-none, sr-only',
  },
  {
    key: 'table',
    label: 'Tabla',
    variants: [],
    classes: [
      'table', 'table-auto', 'table-fixed', 'border-collapse', 'border-separate',
      'caption-top', 'caption-bottom',
    ],
    ai: 'table-auto, table-fixed, border-collapse',
  },
  {
    key: 'theme',
    label: 'Roles del tema',
    variants: ['state'],
    classes: themeRoleClasses,
    ai:
      'bg-[var(--vz-ROL)] · text-[color:var(--vz-ROL)] · border-[color:var(--vz-ROL)] · ' +
      'ring-[color:var(--vz-ROL)] · divide-[color:var(--vz-ROL)], con ROL en ' +
      `[${THEME_ROLES.join(', ')}]. Además rounded-[var(--vz-radio)]. ` +
      'ESTA es la forma por defecto de dar color: sigue el tema de la librería.',
  },
];

// ── Proyección 1: safelist de Tailwind ───────────────────────────────────────

/** Clases base, sin variantes. */
export const VOCABULARY_CLASSES = [
  ...new Set(VOCABULARY_GROUPS.flatMap((g) => g.classes)),
];

const VOCABULARY_SET = new Set(VOCABULARY_CLASSES);

/**
 * Lista final que consume `tailwind.config.js`.
 *
 * Se expande a mano en vez de usar `variants:` del safelist porque los roles del
 * tema son valores arbitrarios y Tailwind no les aplica variantes por patrón.
 */
export const SAFELIST = (() => {
  const out = new Set();
  for (const group of VOCABULARY_GROUPS) {
    // Un grupo puede acotar sus estados (`states`) para no multiplicar por cinco
    // familias enteras de color que nadie usa en `active:` ni `focus-visible:`.
    const states = group.states ?? STATE_VARIANTS;
    for (const cls of group.classes) {
      out.add(cls);
      if (group.variants.includes('responsive')) {
        for (const v of RESPONSIVE_VARIANTS) out.add(`${v}:${cls}`);
      }
      if (group.variants.includes('state')) {
        for (const v of states) out.add(`${v}:${cls}`);
      }
    }
  }
  return [...out];
})();

// ── Proyección 2: gramática para el asistente ────────────────────────────────

/** Descripción compacta del vocabulario, para el contexto de la IA. */
export const VOCABULARY_FOR_AI = {
  nota:
    'Vocabulario CERRADO. El lienzo solo sabe pintar estas utilidades: una clase ' +
    'fuera de esta lista no tiene regla CSS y no se verá. Escribe siempre la clase ' +
    'completa y literal (nunca la construyas concatenando).',
  escalaEspaciado: SPACING.join(' '),
  familiasColor: COLOR_FAMILIES.join(' '),
  tonosColor: COLOR_SHADES.join(' '),
  variantesPantalla: RESPONSIVE_VARIANTS.map((v) => `${v}:`).join(' '),
  variantesEstado: STATE_VARIANTS.map((v) => `${v}:`).join(' '),
  grupos: VOCABULARY_GROUPS.map((g) => ({ grupo: g.label, utilidades: g.ai })),
};

// ── Proyección 3: validación ─────────────────────────────────────────────────

const VARIANT_SET = new Set([...RESPONSIVE_VARIANTS, ...STATE_VARIANTS]);

/**
 * ¿Tiene esta clase una regla CSS garantizada en el lienzo?
 *
 * Falso negativo posible y aceptado: las clases literales de `defaults.ts` y
 * `schema.ts` que no estén en el vocabulario también funcionan, porque el
 * escaneo de `content` las recoge. `verify:styles` comprueba precisamente que no
 * queden fuera de los dos caminos.
 */
export function isKnownUtility(cls) {
  if (!cls) return false;
  // Un valor arbitrario puede llevar `:` dentro de los corchetes
  // (`text-[color:var(--x)]`) y ese no separa variante, así que solo cuentan
  // los dos puntos anteriores al primer corchete.
  const bracket = cls.indexOf('[');
  const head = bracket === -1 ? cls : cls.slice(0, bracket);
  const idx = head.lastIndexOf(':');
  if (idx === -1) return VOCABULARY_SET.has(cls);
  const variants = cls.slice(0, idx).split(':');
  const base = cls.slice(idx + 1);
  return variants.every((v) => VARIANT_SET.has(v)) && VOCABULARY_SET.has(base);
}

/** Clases de un `className` que no se verán en el lienzo. */
export function unknownUtilities(className) {
  return (className || '').split(/\s+/).filter(Boolean).filter((c) => !isKnownUtility(c));
}
