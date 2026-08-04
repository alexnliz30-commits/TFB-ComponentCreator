/**
 * Utilidades para editar el `className` de un bloque como propiedades estructuradas,
 * con soporte de breakpoints Tailwind (mobile-first): base = móvil, sm ≥640px,
 * md ≥768px (tablet), lg ≥1024px (escritorio), xl ≥1280px (pantalla grande).
 */

export type Breakpoint = '' | 'sm' | 'md' | 'lg' | 'xl';

export const BREAKPOINTS: { key: Breakpoint; label: string; hint: string }[] = [
  { key: '', label: 'Base', hint: 'Móvil y superior (mobile-first)' },
  { key: 'sm', label: 'sm', hint: '≥ 640 px — móvil grande' },
  { key: 'md', label: 'md', hint: '≥ 768 px — tablet' },
  { key: 'lg', label: 'lg', hint: '≥ 1024 px — escritorio' },
  { key: 'xl', label: 'xl', hint: '≥ 1280 px — pantalla grande' },
];

function split(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

/** Devuelve la clase (sin prefijo) del grupo `matcher` activa en el breakpoint dado. */
export function getUtility(className: string, bp: Breakpoint, matcher: RegExp): string {
  const pfx = bp ? `${bp}:` : '';
  for (const c of split(className)) {
    if (bp) {
      if (c.startsWith(pfx) && matcher.test(c.slice(pfx.length))) return c.slice(pfx.length);
    } else if (!c.includes(':') && matcher.test(c)) {
      return c;
    }
  }
  return '';
}

/** Sustituye (o elimina, con value='') la clase del grupo `matcher` en el breakpoint dado. */
export function setUtility(className: string, bp: Breakpoint, matcher: RegExp, value: string): string {
  const pfx = bp ? `${bp}:` : '';
  const kept = split(className).filter((c) => {
    if (bp) return !(c.startsWith(pfx) && matcher.test(c.slice(pfx.length)));
    return c.includes(':') || !matcher.test(c);
  });
  if (value) kept.push(pfx + value);
  return kept.join(' ');
}

// ── Visibilidad por dispositivo ───────────────────────────────────────────────

export interface DeviceVisibility {
  mobile: boolean;   // base
  tablet: boolean;   // md:
  desktop: boolean;  // lg:
}

const DISPLAY = /^(hidden|block|flex|grid|inline|inline-block|inline-flex)$/;

export function getDeviceVisibility(className: string): DeviceVisibility {
  const cls = split(className);
  const mobile = !cls.includes('hidden');
  let tablet = mobile;
  if (cls.includes('md:hidden')) tablet = false;
  else if (cls.some((c) => c.startsWith('md:') && DISPLAY.test(c.slice(3)))) tablet = true;
  let desktop = tablet;
  if (cls.includes('lg:hidden')) desktop = false;
  else if (cls.some((c) => c.startsWith('lg:') && DISPLAY.test(c.slice(3)))) desktop = true;
  return { mobile, tablet, desktop };
}

export function setDeviceVisibility(className: string, vis: DeviceVisibility): string {
  const cls = split(className);
  const baseDisplay = cls.find((c) => DISPLAY.test(c) && c !== 'hidden') ?? 'block';

  const kept = cls.filter((c) => {
    if (c === 'hidden') return false;
    if ((c.startsWith('md:') || c.startsWith('lg:')) && DISPLAY.test(c.split(':')[1])) return false;
    return true;
  });

  if (!vis.mobile) {
    const idx = kept.indexOf(baseDisplay);
    if (idx >= 0) kept.splice(idx, 1);
    kept.push('hidden');
  }
  if (vis.tablet !== vis.mobile) kept.push(vis.tablet ? `md:${baseDisplay}` : 'md:hidden');
  if (vis.desktop !== vis.tablet) kept.push(vis.desktop ? `lg:${baseDisplay}` : 'lg:hidden');

  return kept.join(' ');
}

// ── Tamaño ───────────────────────────────────────────────────────────────────

/**
 * Anchura/altura, incluyendo valores arbitrarios (`w-[347px]`) que escribe el
 * redimensionado con el ratón. El panel y los manejadores comparten el matcher
 * para que ajustar por un camino sustituya lo puesto por el otro.
 */
export const WIDTH_MATCHER = /^w-(\[[^\]]+\]|full|auto|screen|fit|1\/2|1\/3|2\/3|1\/4|3\/4|\d+)$/;
export const HEIGHT_MATCHER = /^h-(\[[^\]]+\]|full|auto|screen|fit|\d+)$/;

// ── Posición ─────────────────────────────────────────────────────────────────

/**
 * Utilidades que sacan al bloque del flujo y lo colocan en su contenedor.
 *
 * `sticky` y `relative` NO están: ninguna de las dos saca el bloque del flujo, y
 * `relative` además convierte al elemento en marco de referencia de sus hijos,
 * así que tiene que quedarse donde está.
 */
const OUT_OF_FLOW = /^(absolute|fixed)$/;

/** Desplazamientos y apilamiento: acompañan a la posición, no al contenido. */
const OFFSET_UTILITY =
  /^(?:(?:top|right|bottom|left|inset|inset-x|inset-y)-(?:\[[^\]]+\]|-?[\w./]+)|z-(?:\[[^\]]+\]|\d+|auto))$/;

/**
 * Tamaño. Viaja con la posición **solo cuando el bloque está fuera del flujo**.
 *
 * Fuera del flujo, la caja que el contenedor coloca es el envoltorio de edición,
 * y un porcentaje se mide contra la caja que te contiene: dejando el `w-[30%]`
 * en el elemento se medía contra el envoltorio —que se encoge a su contenido— y
 * un botón redimensionado al 30 % del contenedor salía de 3 px en el lienzo y de
 * 176 px al exportar. En el flujo no aplica: allí el envoltorio no se interpone
 * como caja de referencia.
 */
const SIZE_UTILITY = /^(?:(?:min-|max-)?[wh]|size)-(?:\[[^\]]+\]|[\w./]+)$/;

/**
 * Separa la colocación del bloque del resto de su estilo.
 *
 * Existe porque el lienzo dibuja cada bloque dentro de un envoltorio de edición
 * y es el ENVOLTORIO —lo que de verdad ocupa sitio en el contenedor— quien tiene
 * que llevar la posición. Antes esto se hacía a mano reconociendo solo
 * `absolute` y `left-[Npx]`/`top-[Npx]`, que es justo lo que escribe el arrastre;
 * cualquier otro vocabulario (`top-4 right-4` de la IA, `inset-x-0`, un
 * porcentaje) se perdía por el camino y el bloque se pintaba en la esquina
 * superior izquierda mientras el código exportado lo colocaba en otro sitio.
 */
export function splitPositionClasses(className: string): { position: string; rest: string } {
  const classes = split(className);
  const free = classes.some((c) => OUT_OF_FLOW.test(bare(c)));
  if (!free) return { position: '', rest: className };

  const position: string[] = [];
  const rest: string[] = [];
  for (const c of classes) {
    const b = bare(c);
    const vaAlEnvoltorio = OUT_OF_FLOW.test(b) || OFFSET_UTILITY.test(b) || SIZE_UTILITY.test(b);
    (vaAlEnvoltorio ? position : rest).push(c);
  }
  return { position: position.join(' '), rest: rest.join(' ') };
}

/** ¿Está el bloque fuera del flujo? */
export function isOutOfFlow(className: string): boolean {
  return split(className).some((c) => OUT_OF_FLOW.test(bare(c)));
}

/** Utilidad sin su prefijo de variante (`md:`, `hover:`). */
function bare(cls: string): string {
  const bracket = cls.indexOf('[');
  const head = bracket === -1 ? cls : cls.slice(0, bracket);
  const idx = head.lastIndexOf(':');
  return idx === -1 ? cls : cls.slice(idx + 1);
}

// ── Grupos de propiedades de estilo ──────────────────────────────────────────

export interface StyleOption {
  value: string;
  label: string;
}

export interface StyleGroup {
  key: string;
  label: string;
  matcher: RegExp;
  options: StyleOption[];
}

export interface StyleSection {
  key: string;
  label: string;
  groups: StyleGroup[];
}

const COLOR_FAMILIES = ['slate', 'gray', 'red', 'orange', 'amber', 'yellow', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose'];
const COLOR_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const COLOR_PATTERN = `(${COLOR_FAMILIES.join('|')})-(${COLOR_SHADES.join('|')})`;

function colorOptions(prefix: string, extra: StyleOption[] = []): StyleOption[] {
  const opts: StyleOption[] = [...extra];
  for (const fam of COLOR_FAMILIES) {
    for (const shade of ['100', '300', '500', '600', '700', '900']) {
      opts.push({ value: `${prefix}-${fam}-${shade}`, label: `${fam}-${shade}` });
    }
  }
  return opts;
}

const SPACING = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24'];
const spacingOpts = (prefix: string) => SPACING.map((s) => ({ value: `${prefix}-${s}`, label: s }));

export const STYLE_SECTIONS: StyleSection[] = [
  {
    key: 'layout',
    label: 'Diseño (layout)',
    groups: [
      {
        key: 'display', label: 'Display',
        matcher: /^(block|inline-block|inline|flex|inline-flex|grid|hidden)$/,
        options: ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'hidden'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'direction', label: 'Dirección flex',
        matcher: /^flex-(row|col|row-reverse|col-reverse)$/,
        options: [
          { value: 'flex-row', label: 'Horizontal' },
          { value: 'flex-col', label: 'Vertical' },
          { value: 'flex-row-reverse', label: 'Horizontal invertida' },
          { value: 'flex-col-reverse', label: 'Vertical invertida' },
        ],
      },
      {
        key: 'justify', label: 'Justificado',
        matcher: /^justify-(start|center|end|between|around|evenly)$/,
        options: ['start', 'center', 'end', 'between', 'around', 'evenly'].map((v) => ({ value: `justify-${v}`, label: v })),
      },
      {
        key: 'items', label: 'Alineación',
        matcher: /^items-(start|center|end|stretch|baseline)$/,
        options: ['start', 'center', 'end', 'stretch', 'baseline'].map((v) => ({ value: `items-${v}`, label: v })),
      },
      {
        key: 'gap', label: 'Separación (gap)',
        matcher: /^gap-(\d+(\.\d+)?|px)$/,
        options: spacingOpts('gap'),
      },
      {
        key: 'gridCols', label: 'Columnas (grid)',
        matcher: /^grid-cols-(\d+)$/,
        options: ['1', '2', '3', '4', '5', '6', '12'].map((v) => ({ value: `grid-cols-${v}`, label: v })),
      },
    ],
  },
  {
    key: 'spacing',
    label: 'Espaciado',
    groups: [
      { key: 'p', label: 'Padding', matcher: /^p-(\d+(\.\d+)?|px)$/, options: spacingOpts('p') },
      { key: 'px', label: 'Padding horizontal', matcher: /^px-(\d+(\.\d+)?|px)$/, options: spacingOpts('px') },
      { key: 'py', label: 'Padding vertical', matcher: /^py-(\d+(\.\d+)?|px)$/, options: spacingOpts('py') },
      { key: 'm', label: 'Margin', matcher: /^m-(\d+(\.\d+)?|px|auto)$/, options: [...spacingOpts('m'), { value: 'm-auto', label: 'auto' }] },
      { key: 'mx', label: 'Margin horizontal', matcher: /^mx-(\d+(\.\d+)?|px|auto)$/, options: [...spacingOpts('mx'), { value: 'mx-auto', label: 'auto (centrar)' }] },
      { key: 'my', label: 'Margin vertical', matcher: /^my-(\d+(\.\d+)?|px|auto)$/, options: spacingOpts('my') },
      { key: 'space-y', label: 'Espacio entre hijos (vertical)', matcher: /^space-y-(\d+(\.\d+)?)$/, options: spacingOpts('space-y') },
    ],
  },
  {
    key: 'size',
    label: 'Tamaño',
    groups: [
      {
        key: 'w', label: 'Ancho',
        matcher: WIDTH_MATCHER,
        options: ['full', 'auto', 'fit', '1/2', '1/3', '2/3', '1/4', '3/4', '24', '32', '48', '64', '80', '96'].map((v) => ({ value: `w-${v}`, label: v })),
      },
      {
        key: 'h', label: 'Alto',
        matcher: HEIGHT_MATCHER,
        options: ['full', 'auto', 'fit', '8', '10', '12', '16', '24', '32', '48', '64', '96'].map((v) => ({ value: `h-${v}`, label: v })),
      },
      {
        key: 'max-w', label: 'Ancho máximo',
        matcher: /^max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|full|none)$/,
        options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '4xl', 'full', 'none'].map((v) => ({ value: `max-w-${v}`, label: v })),
      },
      {
        key: 'min-h', label: 'Alto mínimo',
        matcher: /^min-h-(full|screen|fit|\d+|\[\d+px\])$/,
        options: ['full', 'screen', 'fit', '16', '24', '32', '48', '64'].map((v) => ({ value: `min-h-${v}`, label: v })),
      },
    ],
  },
  {
    key: 'typography',
    label: 'Tipografía',
    groups: [
      {
        key: 'text-size', label: 'Tamaño de fuente',
        matcher: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$/,
        options: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'].map((v) => ({ value: `text-${v}`, label: v })),
      },
      {
        key: 'font-weight', label: 'Peso',
        matcher: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
        options: ['light', 'normal', 'medium', 'semibold', 'bold', 'extrabold'].map((v) => ({ value: `font-${v}`, label: v })),
      },
      {
        key: 'text-align', label: 'Alineación de texto',
        matcher: /^text-(left|center|right|justify)$/,
        options: ['left', 'center', 'right', 'justify'].map((v) => ({ value: `text-${v}`, label: v })),
      },
      {
        key: 'text-color', label: 'Color de texto',
        matcher: new RegExp(`^text-(white|black|${COLOR_PATTERN})$`),
        options: colorOptions('text', [{ value: 'text-white', label: 'white' }, { value: 'text-black', label: 'black' }]),
      },
      {
        key: 'leading', label: 'Interlineado',
        matcher: /^leading-(none|tight|snug|normal|relaxed|loose)$/,
        options: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'].map((v) => ({ value: `leading-${v}`, label: v })),
      },
      {
        key: 'tracking', label: 'Espaciado de letra',
        matcher: /^tracking-(tighter|tight|normal|wide|wider|widest)$/,
        options: ['tighter', 'tight', 'normal', 'wide', 'wider'].map((v) => ({ value: `tracking-${v}`, label: v })),
      },
      {
        key: 'italic', label: 'Estilo',
        matcher: /^(italic|not-italic|underline|line-through|uppercase|lowercase|capitalize)$/,
        options: ['italic', 'underline', 'line-through', 'uppercase', 'capitalize'].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    key: 'background',
    label: 'Fondo y color',
    groups: [
      {
        key: 'bg', label: 'Color de fondo',
        matcher: new RegExp(`^bg-(white|black|transparent|${COLOR_PATTERN})$`),
        options: colorOptions('bg', [
          { value: 'bg-white', label: 'white' },
          { value: 'bg-black', label: 'black' },
          { value: 'bg-transparent', label: 'transparent' },
        ]),
      },
      {
        key: 'opacity', label: 'Opacidad',
        matcher: /^opacity-(0|10|25|50|75|90|100)$/,
        options: ['100', '90', '75', '50', '25', '10'].map((v) => ({ value: `opacity-${v}`, label: `${v}%` })),
      },
    ],
  },
  {
    key: 'border',
    label: 'Bordes y sombra',
    groups: [
      {
        key: 'border-w', label: 'Grosor de borde',
        matcher: /^border(-(0|2|4|8))?$/,
        options: [
          { value: 'border', label: '1 px' },
          { value: 'border-2', label: '2 px' },
          { value: 'border-4', label: '4 px' },
          { value: 'border-0', label: 'Sin borde' },
        ],
      },
      {
        key: 'border-color', label: 'Color de borde',
        matcher: new RegExp(`^border-(white|black|transparent|${COLOR_PATTERN})$`),
        options: colorOptions('border', [{ value: 'border-white', label: 'white' }, { value: 'border-transparent', label: 'transparent' }]),
      },
      {
        key: 'rounded', label: 'Redondeo',
        matcher: /^rounded(-(none|sm|md|lg|xl|2xl|3xl|full))?$/,
        options: [
          { value: 'rounded-none', label: 'Sin redondeo' },
          { value: 'rounded-sm', label: 'sm' },
          { value: 'rounded', label: 'base' },
          { value: 'rounded-md', label: 'md' },
          { value: 'rounded-lg', label: 'lg' },
          { value: 'rounded-xl', label: 'xl' },
          { value: 'rounded-2xl', label: '2xl' },
          { value: 'rounded-full', label: 'full' },
        ],
      },
      {
        key: 'shadow', label: 'Sombra',
        matcher: /^shadow(-(sm|md|lg|xl|2xl|inner|none))?$/,
        options: [
          { value: 'shadow-none', label: 'Sin sombra' },
          { value: 'shadow-sm', label: 'sm' },
          { value: 'shadow', label: 'base' },
          { value: 'shadow-md', label: 'md' },
          { value: 'shadow-lg', label: 'lg' },
          { value: 'shadow-xl', label: 'xl' },
        ],
      },
    ],
  },
];

// ── Soporte de navegadores (metadato del bloque) ─────────────────────────────

export const BROWSERS = [
  { key: 'chrome', label: 'Chrome' },
  { key: 'firefox', label: 'Firefox' },
  { key: 'safari', label: 'Safari' },
  { key: 'edge', label: 'Edge' },
] as const;

export type BrowserKey = (typeof BROWSERS)[number]['key'];

export function parseBrowsers(value: string | undefined): BrowserKey[] {
  if (!value) return BROWSERS.map((b) => b.key); // sin restricción = todos
  return value.split(',').map((v) => v.trim()).filter(Boolean) as BrowserKey[];
}

export function serializeBrowsers(keys: BrowserKey[]): string {
  // todos marcados = sin restricción (prop vacía, no se emite data-browsers)
  return keys.length === BROWSERS.length ? '' : keys.join(',');
}
