/**
 * Esquema de bloques: la única definición de qué markup produce cada tipo.
 *
 * `buildNode()` traduce un `BuilderBlock` al árbol `UiNode` de `ui-node.ts`.
 * De ahí beben tanto el lienzo como los emisores de código, de modo que lo que
 * el usuario ve y lo que exporta no pueden divergir.
 *
 * Los afordances de edición (etiqueta del bloque, borde punteado, zona de
 * soltar, «Arrastra componentes aquí») NO viven aquí: son cosa del lienzo. Este
 * módulo produce markup limpio, listo para exportar.
 *
 * Interactividad: los bloques con estado natural (tabs, accordion, paginación,
 * stepper, switch, rating, slider, dropdown, popover, collapse, calendario)
 * son interactivos por defecto: si no están enlazados a una variable declarada
 * vía `bindTo`, sintetizan una variable *implícita* propia —nombre estable
 * derivado del id del bloque— que los emisores declaran como estado local y el
 * lienzo siembra en su runtime. Un tab que cambia o un dropdown que se abre no
 * es comportamiento oculto: es lo que ese bloque *es*. `bindTo` sigue teniendo
 * prioridad para compartir estado entre bloques.
 */

import {
  ITEM_PARAM, effectiveFields, hasModel, identityField, mockRows, sampleValue, type DataModel,
} from './data-model';
import type { BuilderBlock } from './types';
import type {
  ActionScope, BlockAction, CallbackProp, StateVar, StateVarType, ValidationRule,
} from './actions';
import {
  EVENT_ATTR, WHOLE_BLOCK_EVENTS, actionStatements, conditionPreview, conditionTest,
  effectiveRules, effectiveStyleRules, evalCondition, eventHandler, runActions,
  runValidation, setterName, validatorCode, validatorName,
} from './actions';
import {
  bind, csv, cx, el, expr, int, list, on, onStmts, pairs, slot, txt, when,
  type Attr, type Runtime, type UiNode,
} from './ui-node';
import { paramEnvio, paramMarcado, paramValor, type Lang } from './lang';

/** Lee una variable del runtime con un valor por defecto tipado. */
function num(rt: Runtime, name: string, fallback: number): number {
  const v = rt.get(name);
  return typeof v === 'number' ? v : fallback;
}

export interface SchemaCtx {
  /** Variables de estado declaradas en el lienzo. */
  vars: StateVar[];
  /**
   * Recolector de variables implícitas. El esquema lo invoca al sintetizar el
   * estado propio de un bloque no enlazado; quien construye el árbol completo
   * (emisores, runtime del lienzo) lo usa para saber qué debe declarar/sembrar.
   */
  collect?: (v: StateVar) => void;
  /**
   * Árbol completo de bloques. Lo necesita el envío de un formulario con campos
   * validados: el manejador debe validar a sus descendientes antes de ejecutar
   * las acciones, y para encontrarlos hay que poder recorrer el árbol.
   *
   * Es OBLIGATORIO a propósito. Cuando era opcional, el lienzo dejó de pasarlo
   * y nadie se enteró: compilaba, el emisor seguía validando y el canvas
   * enviaba el formulario sin comprobar nada — justo la divergencia entre
   * generador e intérprete que este esquema único existe para impedir. Que
   * falte tiene que ser un error de tipos, no un fallo silencioso.
   */
  blocks: Record<string, BuilderBlock>;
  /**
   * Recolector de funciones auxiliares (validadores de campo). El emisor las
   * declara una vez como constantes de módulo; el lienzo no lo usa, porque su
   * gemelo es `runValidation` ejecutado en los cierres `live`.
   */
  collectHelper?: (name: string, code: string) => void;
  /**
   * Contrato de datos del componente. Ausente = no recibe ninguno.
   *
   * Es OPCIONAL a diferencia de `blocks`: la inmensa mayoría de los bloques no
   * lo mira, y exigirlo obligaría a inventar un modelo vacío en cada llamada.
   * Quien sí lo mira —el repetidor y los bloques enlazados a un campo— degrada
   * a contenido literal cuando falta, que es el comportamiento de siempre.
   */
  model?: DataModel;
  /**
   * Props de función declaradas. Ausente = ninguna, y las acciones que llamen a
   * una se descartan igual que las que apuntan a una variable borrada.
   */
  callbacks?: CallbackProp[];
  /**
   * Lenguaje del código que transportan los nodos. Por defecto TypeScript.
   *
   * El árbol que se construye es el MISMO en los dos lenguajes —misma forma,
   * mismos atributos, mismos cierres para el lienzo—; lo único que cambia son
   * las anotaciones de los manejadores, que viajan dentro de las cadenas de
   * código destinadas al emisor. El lienzo no las lee nunca, así que puede
   * ignorar este campo por completo.
   */
  lang?: Lang;
}

/**
 * ¿Se pinta este bloque dentro de un repetidor?
 *
 * Determina si el nombre `item` existe en ese punto del código emitido, y con
 * ello si una prop de función puede recibir el elemento actual. Cuenta el propio
 * bloque: el `tr` que se repite es el primero que ve su elemento.
 */
function dentroDeRepetidor(
  block: BuilderBlock,
  blocks: Record<string, BuilderBlock>,
): boolean {
  let actual: BuilderBlock | undefined = block;
  // Mismo tope que el resto de recorridos hacia arriba: un ciclo en el árbol no
  // puede colgar el lienzo entero.
  for (let salto = 0; actual && salto < 100; salto++) {
    if (actual.props.repeatOver === 'true') return true;
    const padre = padreDe(actual.id, blocks);
    actual = padre ? blocks[padre] : undefined;
  }
  return false;
}

/** Lo que las acciones de este bloque necesitan saber de su entorno. */
function actionScope(block: BuilderBlock, ctx: SchemaCtx): ActionScope {
  return {
    callbacks: ctx.callbacks,
    // Sin modelo no hay repetidor, por muy marcada que esté la casilla.
    insideRepeater: hasModel(ctx.model) && dentroDeRepetidor(block, ctx.blocks),
    lang: ctx.lang,
  };
}

/**
 * Variable implícita de un bloque interactivo sin `bindTo`.
 *
 * El nombre sale del id del bloque (`block-12` → `tab12`), así que es estable
 * entre renders y entre los tres consumidores del esquema (lienzo, emisor de
 * verificación y paquete), que es lo que permite que el estado se declare en un
 * sitio y se use en otro sin coordinarse.
 */
function implicitVar(
  block: BuilderBlock,
  ctx: SchemaCtx,
  base: string,
  type: StateVarType,
  initial: string,
): StateVar {
  const suffix = block.id.replace(/\D+/g, '') || block.id.replace(/[^A-Za-z0-9]+/g, '');
  let name = `${base}${suffix}`;
  // Colisión con una variable del usuario: se esquiva de forma determinista.
  while (ctx.vars.some((v) => v.name === name)) name = `${name}x`;
  const v: StateVar = { name, type, initial };
  ctx.collect?.(v);
  return v;
}

/**
 * Variables implícitas de todo el árbol, en orden de recorrido.
 *
 * Los emisores las declaran como `useState` y el lienzo las siembra en su
 * runtime; sin esto, el código emitido referenciaría estado inexistente.
 */
export function collectImplicitVars(
  blocks: Record<string, BuilderBlock>,
  rootIds: string[],
  vars: StateVar[],
): StateVar[] {
  const out: StateVar[] = [];
  const seen = new Set<string>();
  const ctx: SchemaCtx = {
    vars,
    blocks,
    collect: (v) => {
      if (!seen.has(v.name)) {
        seen.add(v.name);
        out.push(v);
      }
    },
  };
  const visit = (id: string) => {
    const block = blocks[id];
    if (!block) return;
    buildNode(block, ctx);
    block.children.forEach(visit);
  };
  rootIds.forEach(visit);
  return out;
}

/** Tipos que aceptan bloques hijos. */
export const CONTAINER_TYPES = new Set([
  'div', 'section', 'header', 'footer', 'main', 'aside', 'article', 'nav-html',
  'form', 'card', 'modal', 'drawer', 'collapse', 'fieldset', 'navbar', 'sidebar',
  'grid', 'flex',
  // Tabla componible: solo un BLOQUE puede llevar eventos del panel, así que
  // meter un botón con comportamiento en una fila exige que la celda sea un
  // bloque y no una cadena de una prop. Ver `tabla-componible` en el README.
  'table-c', 'thead-c', 'tbody-c', 'tr', 'td', 'th',
]);

export function isContainer(type: string): boolean {
  return CONTAINER_TYPES.has(type);
}

/**
 * Tipos que colocan a sus hijos con caja flexible o rejilla POR SER LO QUE SON,
 * sin que nadie lo haya escrito en su `className`.
 *
 * `buildContainer` se lo añade al construir el nodo, así que mirar solo las
 * clases del bloque diría que un `navbar` apila a sus hijos, y no es verdad.
 */
const LAYS_OUT_CHILDREN = new Set(['grid', 'flex', 'navbar', 'sidebar']);

const FLEX_OR_GRID = /^(flex|inline-flex|grid|inline-grid)$/;

/**
 * ¿Este contenedor coloca a sus hijos como ítems de una caja flexible o rejilla?
 *
 * Importa porque en el lienzo el ítem no es el bloque, sino su envoltorio de
 * edición: sin saberlo, el envoltorio se estira —como haría el bloque al
 * exportar— pero el bloque de dentro se queda a su altura de contenido, y dos
 * tarjetas en fila salían desiguales al editar e iguales al usarlas.
 */
export function laysOutChildren(block: BuilderBlock | undefined): boolean {
  if (!block) return false;
  if (LAYS_OUT_CHILDREN.has(block.type)) return true;
  return (block.props.className || '')
    .split(/\s+/)
    .some((c) => FLEX_OR_GRID.test(c.includes(':') ? c.slice(c.lastIndexOf(':') + 1) : c));
}

/**
 * Tipos que admiten enlace a una variable de estado vía la prop `bindTo`.
 *
 * Los bloques de texto entran por lectura, no por edición: enseñan el valor de
 * la variable. Sirve cualquier tipo —se convierte con `String()`—, así que no
 * llevan entrada en `BINDABLE_VAR_TYPE` y el panel ofrece todas las variables.
 */
export const BINDABLE_TYPES = new Set([
  'tabs', 'accordion', 'pagination', 'stepper', 'switch', 'rating',
  'input', 'textarea', 'select', 'checkbox', 'date-picker',
  'time-picker', 'combobox', 'number-input', 'toggle-group', 'color-picker',
  'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/** Tipo de variable que espera cada bloque enlazable. */
export const BINDABLE_VAR_TYPE: Record<string, StateVarType> = {
  tabs: 'number', accordion: 'number', pagination: 'number', stepper: 'number',
  rating: 'number', switch: 'boolean', checkbox: 'boolean',
  input: 'string', textarea: 'string', select: 'string', 'date-picker': 'string',
  'time-picker': 'string', combobox: 'string', 'number-input': 'number',
  'toggle-group': 'number', 'color-picker': 'string',
};

/** Bloques de campo que admiten reglas de validación. */
export const VALIDATABLE_TYPES = new Set([
  'input', 'textarea', 'select', 'checkbox', 'date-picker',
]);

/**
 * Cómo sintetiza cada tipo de campo su variable de valor implícita. La tabla es
 * la misma para el bloque que se construye y para el formulario que lo valida
 * al enviarse, así que ambos derivan nombres idénticos sin coordinarse.
 */
const FIELD_SPECS: Record<string, (p: Record<string, string>) => {
  type: StateVarType; base: string; initial: string;
}> = {
  input: () => ({ type: 'string', base: 'field', initial: '' }),
  textarea: () => ({ type: 'string', base: 'field', initial: '' }),
  select: () => ({ type: 'string', base: 'option', initial: '' }),
  'date-picker': () => ({ type: 'string', base: 'date', initial: '' }),
  checkbox: (p) => ({ type: 'boolean', base: 'checked', initial: p.checked === 'true' ? 'true' : 'false' }),
  // El buscador faltaba, y el panel de propiedades SÍ ofrece enlazarlo: quien lo
  // hacía se quedaba con una variable que nadie escribía nunca —el campo se
  // pintaba, se podía teclear en él y no llegaba a ninguna parte—. En el código
  // emitido eso salía como un setter declarado y sin usar, que además no
  // compila con `noUnusedLocals`.
  search: () => ({ type: 'string', base: 'busqueda', initial: '' }),
};

/** Etiquetas que deben recibir los manejadores de evento del bloque. */
const INTERACTIVE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'form', 'a']);

/** Etiqueta HTML real de cada contenedor. */
const CONTAINER_TAGS: Record<string, string> = {
  'nav-html': 'nav', form: 'form', header: 'header', footer: 'footer',
  main: 'main', aside: 'aside', section: 'section', article: 'article',
  fieldset: 'fieldset', navbar: 'nav', sidebar: 'aside',
  'table-c': 'table', 'thead-c': 'thead', 'tbody-c': 'tbody', tr: 'tr', td: 'td', th: 'th',
};

const LABEL_CLS = 'block text-sm font-medium text-[color:var(--vz-texto)] mb-1';
const FIELD_CLS =
  'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm shadow-sm ' +
  'focus:ring-2 focus:ring-[color:var(--vz-primario)]/20 focus:border-[color:var(--vz-primario)] outline-none transition-colors';

/**
 * Construye el árbol de un bloque, ya con eventos y visibilidad aplicados.
 */
/**
 * Utilidades que describen **al bloque dentro de su hueco**, no a su contenido:
 * tamaño, posición, margen y su comportamiento como hijo de un flex o un grid.
 *
 * Se distinguen porque tienen que acabar en el elemento MÁS EXTERNO del bloque,
 * y no todos los tipos ponen ahí su `className`: un `input` con etiqueta se
 * envuelve en un `div`, así que un `w-full` escrito por el usuario estiraba el
 * campo pero no el bloque, y un `absolute` habría posicionado el control dentro
 * de su propio envoltorio en vez de en el contenedor. Al izarlas en `buildNode`
 * —el único punto de entrada del esquema— el tamaño y la posición se comportan
 * igual en los 85 tipos sin tocar ninguno de ellos.
 */
const LAYOUT_UTILITY = new RegExp(
  '^(?:' +
  // Tamaño
  '(?:min-|max-)?[wh]-|size-|aspect-|' +
  // Posición y apilamiento
  'static$|relative$|absolute$|fixed$|sticky$|' +
  '(?:top|right|bottom|left|inset|inset-x|inset-y)-|z-|' +
  // Margen (espacio exterior del bloque)
  'm[xytrbl]?-|' +
  // Comportamiento como hijo de un flex o un grid
  'flex-(?:1|auto|initial|none)$|grow(?:-0)?$|shrink(?:-0)?$|basis-|' +
  'self-|order-|(?:col|row)-(?:span|start|end)-' +
  ')',
);

/** Separa las utilidades de hueco del resto del `className`. */
export function splitLayoutClasses(className: string): { layout: string; rest: string } {
  const layout: string[] = [];
  const rest: string[] = [];
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    // Las variantes (`md:`, `hover:`) no cambian a qué elemento pertenece la
    // clase: se mira la utilidad que hay detrás del último dos puntos.
    const bracket = cls.indexOf('[');
    const head = bracket === -1 ? cls : cls.slice(0, bracket);
    const idx = head.lastIndexOf(':');
    const bare = idx === -1 ? cls : cls.slice(idx + 1);
    (LAYOUT_UTILITY.test(bare) ? layout : rest).push(cls);
  }
  return { layout: layout.join(' '), rest: rest.join(' ') };
}

/** Añade clases al elemento más externo del nodo. */
function addRootClasses(node: UiNode, extra: string): UiNode {
  if (!extra) return node;

  if (node.kind === 'when') {
    // La condición envuelve al bloque: las clases van dentro, al elemento real.
    return { ...node, children: node.children.map((c) => addRootClasses(c, extra)) };
  }
  // El repetidor también envuelve: sus clases pertenecen a cada elemento.
  if (node.kind === 'list') return { ...node, item: addRootClasses(node.item, extra) };
  if (node.kind !== 'el') return node;

  const current = node.attrs.className;
  if (!current) {
    return { ...node, attrs: { ...node.attrs, className: { kind: 'static', value: extra } } };
  }
  if (current.kind === 'static') {
    return {
      ...node,
      attrs: { ...node.attrs, className: { kind: 'static', value: cx(current.value, extra) } },
    };
  }
  if (current.kind === 'expr') {
    // Raíz con clase calculada: se concatena conservando la expresión.
    const live = current.live;
    return {
      ...node,
      attrs: {
        ...node.attrs,
        className: {
          kind: 'expr',
          code: `${JSON.stringify(extra + ' ')} + (${current.code})`,
          preview: cx(extra, current.preview),
          live: live ? (rt) => cx(extra, live(rt)) : undefined,
        },
      },
    };
  }
  return node;
}

/**
 * Añade al elemento las clases que dependen de una condición.
 *
 * Sale un literal de plantilla —``` `base${c ? ' extra' : ''}` ```— en lugar de
 * un ternario sobre la cadena entera porque así N reglas se acumulan sin
 * multiplicar las ramas: con tres reglas, el ternario completo tendría ocho
 * variantes escritas a mano y ninguna forma de leerlas.
 *
 * Lo que este camino NO puede hacer es resolver conflictos con `cx`: cuál gana
 * entre `bg-white` y `bg-red-50` no se sabe hasta ejecutar, y `cx` decide al
 * emitir. Se deja que decida el orden de la hoja de Tailwind, que es lo que hace
 * cualquier proyecto que escribe clases condicionales a mano; el panel avisa de
 * que la clase condicional debe añadir, no sustituir.
 */
function addConditionalClasses(node: UiNode, block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const rules = effectiveStyleRules(block.styleRules, ctx.vars, ctx.model);
  if (rules.length === 0) return node;

  if (node.kind === 'when') {
    return { ...node, children: node.children.map((c) => addConditionalClasses(c, block, ctx)) };
  }
  if (node.kind === 'list') return { ...node, item: addConditionalClasses(node.item, block, ctx) };
  if (node.kind !== 'el') return node;

  const current = node.attrs.className;
  // Solo se compone sobre una clase literal. Con una ya calculada —un campo con
  // error, un `aria-current`— habría que anidar plantillas dentro de plantillas y
  // el código emitido dejaría de poder leerse; esos bloques ya cambian de aspecto
  // por su cuenta, que es lo que la regla venía a conseguir.
  if (current && current.kind !== 'static') return node;
  const base = current?.value ?? '';

  const partes = rules.map((r) => {
    const test = conditionTest(r.when, ctx.vars, ctx.model)!;
    return { test, clases: r.className.trim() };
  });

  const code = '`' + base
    + partes.map((p) => `\${${p.test} ? ' ${p.clases}' : ''}`).join('')
    + '`';

  const aplicables = (activa: (r: (typeof rules)[number]) => boolean) =>
    cx(base, ...rules.filter(activa).map((r) => r.className.trim()));

  return {
    ...node,
    attrs: {
      ...node.attrs,
      className: {
        kind: 'expr',
        code,
        preview: aplicables((r) => conditionPreview(r.when, ctx.vars, ctx.model)),
        live: (rt) => aplicables((r) => evalCondition(r.when, ctx.vars, rt, ctx.model)),
      },
    },
  };
}

/**
 * Ancho fijo, escrito por el ratón, por el panel o por la IA.
 *
 * Se aceptan todas las unidades absolutas, no solo `px`: `w-[24rem]` mide los
 * mismos 384 px y se sale igual de un móvil. Quedan fuera `%`, `vw` y `vh`, que
 * ya se miden contra algo y por tanto encogen solas. Se incluye la escala de
 * Tailwind (`w-96` = 384 px), que el panel ofrece igual que los corchetes.
 */
const ANCHO_FIJO = /(?:^|\s)w-(?:\[\d+(?:\.\d+)?(?:px|rem|em|ch|pt)\]|\d+)(?:\s|$)/;
const YA_TIENE_TOPE = /(?:^|\s)max-w-/;

/** Ancho MÍNIMO fijo: el que `max-w-full` no puede capar. */
const MINIMO_FIJO = /^min-w-(?:\[\d+(?:\.\d+)?(?:px|rem|em|ch|pt)\]|\d+)$/;

/**
 * Un ancho fijo nunca debe desbordar la pantalla.
 *
 * Redimensionar con Alt, teclear un ancho en el panel o aceptar lo que escriba
 * la IA produce medidas en píxeles, y una tarjeta de 560 px en un móvil de 375
 * se sale por el lado: aparece scroll horizontal y parte del componente queda
 * fuera. Acompañarla de `max-w-full` conserva la medida donde cabe y la encoge
 * donde no, que es lo que se espera de un componente que ha de servir en
 * cualquier pantalla.
 *
 * Se hace aquí, en el único punto de entrada del esquema, para que valga igual
 * venga el ancho de donde venga y para que lienzo y código exportado coincidan.
 */
function capAnchoFijo(layout: string): string {
  if (!layout || !ANCHO_FIJO.test(layout) || YA_TIENE_TOPE.test(layout)) return layout;
  return `${layout} max-w-full`;
}

/** Clase sin sus variantes (`md:`, `hover:`), respetando los corchetes. */
function sinVariantes(cls: string): string {
  const bracket = cls.indexOf('[');
  const head = bracket === -1 ? cls : cls.slice(0, bracket);
  const idx = head.lastIndexOf(':');
  return idx === -1 ? cls : cls.slice(idx + 1);
}

/** Desplazamiento y apilamiento: lo que acompaña a un `absolute`. */
const DESPLAZAMIENTO =
  /^-?(?:(?:top|right|bottom|left|inset|inset-x|inset-y)-(?:\[[^\]]+\]|[\w./]+)|z-(?:\[[^\]]+\]|\d+))$/;

/** Altura FIJA. `h-full`, `h-auto` y `h-screen` ya son relativas y se quedan. */
const ALTURA_FIJA = /^h-(?:\[[^\]]+\]|\d+(?:\.\d+)?)$/;

/** Desplazamiento horizontal FIJO desde el borde izquierdo, en píxeles. */
const IZQUIERDA_FIJA = /^left-(?:\[(\d+(?:\.\d+)?)px\]|(\d+))$/;
/** Ancho fijo en píxeles, para saber por dónde acaba el bloque. */
const ANCHO_EN_PX = /^w-(?:\[(\d+(?:\.\d+)?)px\]|(\d+))$/;
/** Lo mismo para el ancho mínimo, que se pliega con su propio umbral. */
const MINIMO_EN_PX = /^min-w-(?:\[(\d+(?:\.\d+)?)px\]|(\d+))$/;

/**
 * Los breakpoints de Tailwind, que son los umbrales que se pueden expresar.
 */
const UMBRALES: [string, number][] = [['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280]];

/**
 * Ancho por debajo del cual no merece la pena plegar nada: lo que ya cabe en el
 * móvil más estrecho que se contempla no gana nada volviendo al flujo, y
 * plegarlo cambiaría el diseño sin motivo.
 */
const CABE_EN_MOVIL = 375;

/** Margen para el relleno del contenedor y los anidamientos, que no se miden aquí. */
const HOLGURA = 48;

/** Píxeles de una clase con dos formas: entre corchetes o escala de Tailwind (×4 px). */
function pixeles(m: RegExpMatchArray): number {
  return m[1] !== undefined ? parseFloat(m[1]) : parseInt(m[2], 10) * 4;
}

/**
 * A partir de qué ancho de pantalla puede respetarse la colocación del bloque.
 *
 * Devuelve `null` cuando no hay nada que plegar. Dos casos:
 *
 * - **El bloque está anclado de forma relativa** (`right-4`, `inset-x-0`,
 *   `left-1/2`, un porcentaje). Eso ya se adapta solo: se mide contra el
 *   contenedor, no contra un lienzo que ya no existe. Plegarlo sería estropear
 *   un bloque que estaba bien — y es justo la forma en que coloca la IA, así que
 *   el caso frecuente no se toca.
 * - **El bloque cabe en un móvil de todos modos.** Un badge en `left-[137px]`
 *   dentro de una tarjeta no molesta a nadie a 375 px.
 *
 * En el resto se elige el umbral MÁS PEQUEÑO en el que el bloque entero cabe, y
 * no un `md:` fijo para todos: con un umbral fijo, un bloque en `left-[820px]`
 * volvía a salirse justo en el tramo de tablet —medido, se salía 325 px a 768—
 * porque 768 no da para 820. El umbral tiene que salir de dónde acaba el bloque,
 * no de una constante.
 */
function umbralPara(derechaDelBloque: number): string | null {
  const necesita = derechaDelBloque + HOLGURA;
  if (necesita <= CABE_EN_MOVIL) return null;
  // Si ni el umbral mayor da para tanto, se usa ese: el diseño pide de verdad
  // esa anchura, y por encima de él se respeta.
  return (UMBRALES.find(([, px]) => px >= necesita) ?? UMBRALES[UMBRALES.length - 1])[0];
}

function umbralDeColocacion(clases: string[]): string | null {
  if (!clases.includes('absolute')) return null;
  let izquierda: number | null = null;
  let ancho = 0;
  for (const c of clases) {
    const l = c.match(IZQUIERDA_FIJA);
    if (l) izquierda = pixeles(l);
    const w = c.match(ANCHO_EN_PX);
    if (w) ancho = pixeles(w);
  }
  return izquierda === null ? null : umbralPara(izquierda + ancho);
}

/** Clases propias (sin variante) de un bloque, que son las que se pliegan. */
function clasesPropias(block: BuilderBlock): string[] {
  const { layout } = splitLayoutClasses(block.props.className ?? '');
  return layout.split(/\s+/).filter((c) => c && c === sinVariantes(c));
}

/** Padre de cada bloque, calculado una vez por árbol. */
const PADRES = new WeakMap<Record<string, BuilderBlock>, Map<string, string | null>>();

function padreDe(id: string, blocks: Record<string, BuilderBlock>): string | null {
  let mapa = PADRES.get(blocks);
  if (!mapa) {
    mapa = new Map();
    for (const b of Object.values(blocks)) {
      for (const hijo of b.children ?? []) mapa.set(hijo, b.id);
    }
    PADRES.set(blocks, mapa);
  }
  return mapa.get(id) ?? null;
}

/** Contenedor que desplaza a lo ancho en vez de recortar o desbordar. */
const DESPLAZA_A_LO_ANCHO = /(?:^|\s)overflow(?:-x)?-(?:auto|scroll)(?:\s|$)/;

/**
 * ¿Algún ancestro del bloque desplaza horizontalmente?
 *
 * Dentro de una caja con `overflow-x-auto`, una medida mínima fija **no
 * desborda la página**: lo que sobra se desplaza dentro de esa caja. Es el
 * patrón estándar para una tabla ancha —`<div class="overflow-x-auto">
 * <table class="min-w-[720px]">`— y plegarlo sería el error contrario: en móvil
 * la tabla perdería su ancho mínimo y sus columnas se comprimirían hasta ser
 * ilegibles, que es justo lo que el contenedor venía a evitar.
 *
 * Se descubrió probando la generación con IA: escribió exactamente ese patrón,
 * que es correcto, y el plegado se lo deshacía.
 */
function bajoContenedorDesplazable(
  block: BuilderBlock,
  blocks: Record<string, BuilderBlock>,
): boolean {
  let id = padreDe(block.id, blocks);
  // Se limita el recorrido: un árbol con un ciclo colgaría el lienzo entero.
  for (let salto = 0; id && salto < 100; salto++) {
    const padre = blocks[id];
    if (!padre) return false;
    if (DESPLAZA_A_LO_ANCHO.test(padre.props.className ?? '')) return true;
    // Los bloques de tabla emiten su propio contenedor desplazable, así que
    // cuentan aunque no lo diga su `className`.
    if (padre.type === 'table' || padre.type === 'table-ui') return true;
    id = padreDe(id, blocks);
  }
  return false;
}

/**
 * Umbral de plegado del GRUPO de hermanos, no el del bloque suelto.
 *
 * Tiene que ser común porque el plegado cambia de RÉGIMEN, no de posición: el
 * bloque plegado vuelve al flujo y el que no se queda fuera de él. Con un umbral
 * por bloque, dos tarjetas del mismo contenedor —una en `left-[40px]`, que cabe
 * en un móvil, y otra en `left-[700px]`, que no— se plegaban en anchos
 * distintos, y en móvil quedaba una en flujo y la otra encima: **se solapaban**,
 * que es justo lo que el plegado venía a evitar. Se vio en la previsualización a
 * 375 px, no en las medidas.
 *
 * Se toma el umbral MÁS ALTO de los hermanos colocados: en cuanto uno de ellos
 * necesita más ancho, el grupo entero tiene que seguir plegado o se rompe la
 * composición que formaban juntos.
 */
function umbralDelGrupo(block: BuilderBlock, blocks: Record<string, BuilderBlock>): string | null {
  const propias = clasesPropias(block);
  if (!propias.includes('absolute')) return null;

  const padre = padreDe(block.id, blocks);
  const hermanos = padre
    ? (blocks[padre]?.children ?? []).map((id) => blocks[id]).filter(Boolean)
    // Sin padre el bloque es raíz, y sus hermanos son las demás raíces.
    : Object.values(blocks).filter((b) => padreDe(b.id, blocks) === null);

  let mayor = -1;
  for (const h of hermanos) {
    const u = umbralDeColocacion(clasesPropias(h));
    if (u) mayor = Math.max(mayor, UMBRALES.findIndex(([k]) => k === u));
  }
  return mayor < 0 ? null : UMBRALES[mayor][0];
}

/**
 * Un bloque colocado a mano vuelve al flujo en pantallas estrechas.
 *
 * Colocar con el ratón escribe píxeles absolutos contra el lienzo en que se
 * estaba trabajando: `left-[820px]` es una medida tomada en un escritorio. Esa
 * medida no significa nada en un móvil de 375, y como el contenedor recorta, el
 * bloque no «se sale» de forma visible — **desaparece**. Medido antes de esto:
 * un bloque en `left-[820px]` quedaba fuera del contenedor a 375, a 768 y
 * también a 1280 px.
 *
 * Un porcentaje tampoco lo arregla: la posición encogería, pero el ancho del
 * bloque no lo hace al mismo ritmo y los bloques acaban solapados. Lo que hace
 * una web de verdad es plegar, así que la colocación se emite bajo un prefijo de
 * pantalla y por debajo de él los bloques vuelven al flujo y se apilan.
 *
 * El umbral lo decide el GRUPO de hermanos (ver `umbralDelGrupo`), no el bloque
 * suelto, y sale de la medida del que más ancho necesita.
 *
 * Se pliega también la ALTURA fija, por el mismo motivo y en el mismo gesto: se
 * midió sobre un bloque ancho, y al estrecharse el texto necesita más líneas de
 * las que caben — dejarla recortaría el contenido.
 *
 * `fixed` NO se pliega: posiciona contra la ventana, no contra el contenedor, y
 * es lo que sostiene un modal o su fondo. Devolver eso al flujo en móvil sería
 * romper justo el caso en que el overlay más importa.
 *
 * Si el `absolute` ya viene con variante (`md:absolute`, escrito a mano o por la
 * IA), el bloque ya declara su intención por pantalla y no se toca nada.
 */
function plegarEnMovil(layout: string, block: BuilderBlock, ctx: SchemaCtx): string {
  const clases = layout.split(/\s+/).filter(Boolean);
  const propias = clases.filter((c) => c === sinVariantes(c));

  const umbral = umbralDelGrupo(block, ctx.blocks);
  // Bajo un contenedor que desplaza, un mínimo fijo es correcto y no se toca.
  const hayMinimo = propias.some((c) => MINIMO_FIJO.test(c))
    && !bajoContenedorDesplazable(block, ctx.blocks);
  if (!umbral && !hayMinimo) return layout;

  return clases
    .map((c) => {
      if (c !== sinVariantes(c)) return c; // ya tiene variante: es intencional
      /*
        Un ancho MÍNIMO fijo se pliega esté el bloque donde esté, y no solo si
        está colocado a mano: en CSS `min-width` gana a `max-width`, así que un
        `min-w-[600px]` atraviesa el `max-w-full` de aquí al lado y sigue
        midiendo 600 px en un móvil de 375. Es el único ancho que el tope no
        puede contener, de modo que la única salida es no exigirlo en móvil.
        Su umbral sale de su propia medida, igual que el de la colocación.
      */
      if (hayMinimo && MINIMO_FIJO.test(c)) {
        const medida = c.match(MINIMO_EN_PX);
        return `${(medida && umbralPara(pixeles(medida))) ?? 'md'}:${c}`;
      }
      if (!umbral) return c;
      if (c === 'absolute' || DESPLAZAMIENTO.test(c) || ALTURA_FIJA.test(c)) return `${umbral}:${c}`;
      return c;
    })
    .join(' ');
}

export function buildNode(block: BuilderBlock, ctx: SchemaCtx): UiNode {
  // Tamaño, posición y margen se apartan antes de construir y se devuelven a la
  // raíz después: así llegan al elemento correcto sea cual sea el tipo.
  const { layout, rest } = splitLayoutClasses(block.props.className ?? '');
  const inner = layout
    ? { ...block, props: { ...block.props, className: rest } }
    : block;

  let node = buildBase(inner, ctx);
  node = attachEvents(node, inner, ctx);
  node = addRootClasses(node, capAnchoFijo(plegarEnMovil(layout, block, ctx)));
  // El estilo condicional va ANTES que la visibilidad: es una clase del
  // elemento, así que pertenece dentro del condicional y no fuera, donde no
  // habría a qué aplicarla cuando la condición no se cumple.
  node = addConditionalClasses(node, block, ctx);

  if (block.visibleIf) {
    const rule = block.visibleIf;
    const test = conditionTest(rule, ctx.vars, ctx.model);
    // Una regla que apunta a una variable o campo borrados se ignora en vez de romper.
    if (test) {
      node = when(test, conditionPreview(rule, ctx.vars, ctx.model), [node],
        (rt) => evalCondition(rule, ctx.vars, rt, ctx.model));
    }
  }

  /*
    El repetidor se aplica AL FINAL, envolviendo todo lo anterior.

    El orden importa: la visibilidad condicional de un bloque repetido debe
    evaluarse POR ELEMENTO —«oculta la fila si el pedido está anulado»—, así que
    el `when` tiene que quedar dentro del `list` y no al revés. Igual con las
    clases de colocación: describen a cada elemento, no a la colección.
  */
  return wrapRepeater(node, block, ctx);
}

/** `true` si algún bloque del árbol se repite sobre la colección. */
export function usesRepeater(
  blocks: Record<string, BuilderBlock>,
  rootIds: string[],
): boolean {
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const b = blocks[id];
    if (!b) return false;
    return b.props.repeatOver === 'true' || b.children.some(visit);
  };
  return rootIds.some(visit);
}

/** Nombre de la prop por la que llega la colección al componente. */
export const ITEMS_PROP = 'items';

/**
 * Envuelve el bloque en un repetidor si lo pide y hay modelo que repetir.
 *
 * Sin modelo declarado no se repite nada: sería dibujar N copias de un bloque
 * con contenido literal, que es ruido y no un componente de datos. Degradar a
 * «no repetir» es preferible a inventar campos.
 */
function wrapRepeater(node: UiNode, block: BuilderBlock, ctx: SchemaCtx): UiNode {
  if (block.props.repeatOver !== 'true' || !hasModel(ctx.model)) return node;

  const filas = mockRows(ctx.model);
  const clave = identityField(ctx.model) ?? undefined;
  const pag = pagination(block, ctx);
  if (!pag) return list(ITEMS_PROP, ITEM_PARAM, node, filas, undefined, clave);

  /*
    Paginar es recortar la colección, no ocultar filas.

    La `data-grid` lo hacía con un condicional por fila porque la IR no sabía
    expresar una colección calculada; ahora que sí, el `.slice()` es lo correcto:
    el DOM solo contiene la página visible —en una tabla de mil filas eso es la
    diferencia entre mil nodos y diez— y el código emitido dice lo que hace.

    La página vive en una variable DECLARADA por el usuario, no en una implícita:
    así el bloque de Paginación puede enlazarse a la misma con `bindTo` y los dos
    hablan del mismo número. Con una variable oculta habría que adivinar su
    nombre generado.
  */
  const { varName, size } = pag;
  const desde = `${varName} * ${size}`;
  const hasta = `(${varName} + 1) * ${size}`;
  const pagina = int(ctx.vars.find((v) => v.name === varName)?.initial, 0);

  return list(
    `${ITEMS_PROP}.slice(${desde}, ${hasta})`,
    ITEM_PARAM,
    node,
    filas.slice(pagina * size, (pagina + 1) * size),
    (rt) => {
      const actual = num(rt, varName, pagina);
      return filas.slice(actual * size, (actual + 1) * size);
    },
    clave,
  );
}

/**
 * Configuración de paginado del repetidor, si está activa y es utilizable.
 *
 * Exige una variable numérica declarada. Sin ella se devuelve `null` y el
 * repetidor pinta la colección entera: preferible a paginar contra una variable
 * inexistente, que emitiría código roto por una casilla marcada sin terminar de
 * configurar.
 */
function pagination(
  block: BuilderBlock,
  ctx: SchemaCtx,
): { varName: string; size: number } | null {
  if (block.props.paginate !== 'true') return null;
  const varName = block.props.pageVar ?? '';
  const declarada = ctx.vars.find((v) => v.name === varName && v.type === 'number');
  if (!declarada) return null;
  return { varName, size: Math.max(1, int(block.props.pageSize, 10)) };
}

/** Cuelga los manejadores del bloque donde corresponda a cada evento. */
function attachEvents(node: UiNode, block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const events = block.events ?? [];
  const validated = block.type === 'form' ? collectValidatedFields(block, ctx) : [];

  if (events.length === 0 && validated.length === 0) return node;

  const scope = actionScope(block, ctx);
  const primary = findPrimary(node) ?? (node.kind === 'el' ? node : null);
  const root = node.kind === 'el' ? node : primary;

  // Un formulario con campos validados intercepta el envío aunque el usuario no
  // haya declarado acciones: sin manejador, el navegador recargaría la página y
  // los mensajes de error no llegarían a verse.
  if (validated.length > 0 && primary?.kind === 'el') {
    const submitActions = events.find((e) => e.event === 'submit')?.actions ?? [];
    primary.attrs.onSubmit = formSubmitHandler(validated, submitActions, ctx, scope);
  }

  for (const event of block.events ?? []) {
    // Los eventos de ratón describen al bloque entero; el resto, a su control.
    const target = WHOLE_BLOCK_EVENTS.has(event.event) ? root : primary;
    if (!target || target.kind !== 'el') continue;

    const attrName = EVENT_ATTR[event.event];
    const existing = target.attrs[attrName];

    if (existing) {
      // El elemento ya trae un manejador propio (el enlace de un campo, el
      // envío validado). Si se construyó por sentencias, las acciones del
      // usuario se le añaden detrás; si no, las del usuario ceden: pisar el
      // enlace dejaría el control roto, que es peor que ignorar una acción.
      if (existing.kind === 'event' && existing.stmts) {
        const stmts = actionStatements(event.actions, ctx.vars, scope);
        if (stmts.length > 0) {
          const previous = existing.run;
          target.attrs[attrName] = onStmts(
            existing.param ?? '',
            [...existing.stmts, ...stmts],
            (rt, payload) => {
              previous?.(rt, payload);
              runActions(event.actions, ctx.vars, rt);
            },
          );
        }
      }
      continue;
    }

    const handler = eventHandler(event, ctx.vars, scope);
    if (handler) {
      target.attrs[attrName] = on(handler,
        (rt) => runActions(event.actions, ctx.vars, rt));
    }
  }
  return node;
}

/**
 * Primer elemento interactivo del árbol. Importa porque bloques como `input`
 * se envuelven en un `div` con su etiqueta: un `onChange` debe ir al `input`,
 * no al `div` que lo contiene.
 */
function findPrimary(node: UiNode): UiNode | null {
  if (node.kind === 'el') {
    if (INTERACTIVE_TAGS.has(node.tag)) return node;
    for (const child of node.children) {
      const found = findPrimary(child);
      if (found) return found;
    }
  } else if (node.kind === 'when') {
    for (const child of node.children) {
      const found = findPrimary(child);
      if (found) return found;
    }
  } else if (node.kind === 'list') {
    return findPrimary(node.item);
  }
  return null;
}

/**
 * Contenido de un bloque de texto: su variable enlazada o su literal.
 *
 * Un bloque de texto con `bindTo` es como se enseña el valor de una variable —el
 * número del selector de cantidad, el total de un carrito—. Antes `bindTo` se
 * ignoraba en estos tipos y el bloque se emitía con su texto literal, o vacío si
 * no tenía: el `SelectorDeCantidad` del kit de ejemplo salía sin número entre
 * los botones, y el emisor delataba el fallo declarando `const [, setCantidad]`
 * —una variable que se escribe y nunca se lee—. Fallaba en silencio: la
 * propiedad existía en el panel y no hacía nada.
 */
function contenidoTexto(block: BuilderBlock, ctx: SchemaCtx, literal?: string): UiNode {
  /*
    El campo del modelo gana sobre la variable de estado y sobre el literal.

    Es el orden de lo más específico a lo más general, y coincide con lo que uno
    espera: si has enlazado esta celda a `pedido.cliente`, no quieres que siga
    saliendo el texto de ejemplo que tenía antes.
  */
  const campo = fieldBinding2(block, ctx);
  if (campo) {
    return expr(
      `String(item.${campo.name} ?? '')`,
      String(sampleValue(campo, 0)),
      (rt) => String(rt.item?.[campo.name] ?? ''),
    );
  }

  const v = boundVar(block, ctx);
  if (!v) return txt(literal || '');
  return expr(
    `String(${v.name})`,
    String(v.initial ?? ''),
    (rt) => String(rt.get(v.name) ?? ''),
  );
}

/**
 * Origen del `src` de una imagen: el campo del modelo si lo hay, o su URL fija.
 *
 * El modelo declaraba el tipo de campo «Imagen (URL)» y ningún bloque sabía
 * consumirlo: en una tarjeta de producto repetida sobre datos, la foto era lo
 * único que no podía venir del dato: salían N tarjetas con la misma imagen
 * escrita a mano, o sin `src` ninguno. El enlace se resuelve igual que el del
 * texto, contra el elemento del repetidor.
 */
function fuenteImagen(block: BuilderBlock, ctx: SchemaCtx, fija: string | undefined): Attr | string | undefined {
  const campo = fieldBinding2(block, ctx);
  if (!campo) return fija;
  return {
    kind: 'expr',
    code: `String(item.${campo.name} ?? '')`,
    preview: String(sampleValue(campo, 0)),
    live: (rt) => String(rt.item?.[campo.name] ?? ''),
  };
}

/**
 * Campo del modelo al que apunta `bindField`, si existe y es utilizable.
 *
 * Un `bindField` que apunte a un campo borrado se ignora en lugar de emitir
 * `item.loQueSea` contra un tipo que ya no lo declara: el componente no
 * compilaría en el proyecto de destino y el motivo estaría a tres pantallas.
 */
function fieldBinding2(block: BuilderBlock, ctx: SchemaCtx) {
  const name = block.props.bindField;
  if (!name || !hasModel(ctx.model)) return null;
  return effectiveFields(ctx.model.fields).find((f) => f.name === name) ?? null;
}

/** Variable enlazada por `bindTo`, si existe. */
function boundVar(block: BuilderBlock, ctx: SchemaCtx): StateVar | null {
  const name = block.props.bindTo;
  if (!name) return null;
  return ctx.vars.find((v) => v.name === name) ?? null;
}

/**
 * Campo con etiqueta opcional encima, asociada a su control.
 *
 * El `for`/`id` no es cosmético: sin él, pulsar «Correo electrónico» no lleva el
 * foco al campo y un lector de pantalla anuncia un cuadro de texto sin nombre.
 * La etiqueta estaba ahí desde el principio, pero suelta —`<label>` y `<input>`
 * hermanos sin nada que los una—, así que la accesibilidad que aparentaba no la
 * tenía. El identificador sale del id del bloque, que es único y estable entre
 * el lienzo y el código emitido.
 *
 * Se aplica al control REAL, no al `div` que lo envuelve: `findPrimary` es la
 * misma búsqueda que ya usaban los eventos, por el mismo motivo.
 */
function labelled(label: string | undefined, control: UiNode, blockId?: string): UiNode {
  if (!label) return control;

  const primary = blockId ? findPrimary(control) : null;
  const id = blockId ? `vz-${blockId}` : '';
  if (primary && primary.kind === 'el' && !primary.attrs.id) {
    primary.attrs.id = { kind: 'static', value: id };
  }

  const etiqueta = el('label', LABEL_CLS, [txt(label)], id ? { htmlFor: id } : {});
  return el('div', null, [etiqueta, control]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Campos con valor y validación
// ─────────────────────────────────────────────────────────────────────────────

/** Enlace de un campo: su variable de valor y, si tiene reglas, la de error. */
interface FieldBinding {
  v: StateVar;
  err: StateVar | null;
  rules: ValidationRule[];
  /** Nombre del validador emitido; `''` si el campo no tiene reglas. */
  validator: string;
}

/**
 * Resuelve el enlace de un bloque de campo.
 *
 * Un campo se vuelve controlado en dos situaciones: cuando el usuario lo enlaza
 * a una variable (`bindTo` de tipo compatible) o cuando tiene reglas de
 * validación —validar exige conocer el valor—. Sin ninguna de las dos, el campo
 * queda como siempre: markup sin estado.
 */
function fieldBinding(block: BuilderBlock, ctx: SchemaCtx): FieldBinding | null {
  const spec = FIELD_SPECS[block.type];
  if (!spec) return null;

  const opts = spec(block.props);
  const rules = effectiveRules(block.validations ?? []);
  const bound = boundVar(block, ctx);
  const usable = bound && bound.type === opts.type ? bound : null;
  if (!usable && rules.length === 0) return null;

  const v = usable ?? implicitVar(block, ctx, opts.base, opts.type, opts.initial);
  if (rules.length === 0) return { v, err: null, rules, validator: '' };

  const err = implicitVar(block, ctx, 'error', 'string', '');
  const validator = validatorName(v.name);
  ctx.collectHelper?.(validator, validatorCode(validator, rules, opts.type === 'boolean', ctx.lang ?? 'ts'));
  return { v, err, rules, validator };
}

const asStr = (value: unknown) => (value == null ? '' : String(value));

/** `className` del control, con el borde de error cuando hay mensaje. */
function fieldClass(base: string, fb: FieldBinding): Attr | string {
  if (!fb.err) return base;
  const err = fb.err.name;
  return bind(
    `\`${base}\${${err} !== '' ? ' border-red-500' : ''}\``,
    base,
    (rt) => cx(base, rt.get(err) ? 'border-red-500' : false),
  );
}

/**
 * Manejador de cambio del campo: guarda el valor y, si ya se estaba mostrando
 * un error, lo recalcula — así el mensaje desaparece en cuanto el usuario lo
 * corrige, pero no aparece mientras todavía está escribiendo por primera vez.
 */
function fieldChangeHandler(fb: FieldBinding, lang: Lang): Attr {
  const set = setterName(fb.v.name);
  const boolField = fb.v.type === 'boolean';
  const valueExpr = boolField ? 'e.target.checked' : 'e.target.value';
  const param = boolField ? paramMarcado(lang) : paramValor(lang);

  const stmts = [`${set}(${valueExpr});`];
  if (fb.err) {
    stmts.push(
      `${setterName(fb.err.name)}((previo) => (previo ? ${fb.validator}(${valueExpr}) : previo));`,
    );
  }

  const { rules } = fb;
  const varName = fb.v.name;
  const errName = fb.err?.name;
  return onStmts(param, stmts, (rt, payload) => {
    // El lienzo no recibe `checked` en el payload: un checkbox vivo se invierte.
    const value = boolField ? !rt.get(varName) : asStr(payload);
    rt.set(varName, value);
    if (errName && rt.get(errName)) rt.set(errName, runValidation(rules, value));
  });
}

/** Al salir del campo se valida: es el primer momento honesto para avisar. */
function fieldBlurHandler(fb: FieldBinding): Attr | null {
  if (!fb.err) return null;
  const err = fb.err.name;
  const { rules } = fb;
  const varName = fb.v.name;
  return onStmts('', [`${setterName(err)}(${fb.validator}(${varName}));`],
    (rt) => rt.set(err, runValidation(rules, rt.get(varName))));
}

/** `aria-invalid` vivo, para que el estado de error sea perceptible sin ver color. */
function fieldAriaInvalid(fb: FieldBinding): Attr | null {
  if (!fb.err) return null;
  const err = fb.err.name;
  return bind(`${err} !== ''`, 'false', (rt) => (rt.get(err) ? 'true' : 'false'));
}

/** Envuelve el control con su mensaje de error debajo. */
function withFieldError(fb: FieldBinding, control: UiNode): UiNode {
  if (!fb.err) return control;
  const err = fb.err.name;
  return el('div', null, [
    control,
    when(`${err} !== ''`, false, [
      el('p', 'mt-1 text-xs text-red-600', [expr(err, '', (rt) => asStr(rt.get(err)))]),
    ], (rt) => Boolean(rt.get(err))),
  ]);
}

/** Campos validados que descienden de un formulario. */
function collectValidatedFields(block: BuilderBlock, ctx: SchemaCtx): FieldBinding[] {
  const blocks = ctx.blocks;
  const out: FieldBinding[] = [];
  const visit = (id: string) => {
    const child = blocks[id];
    if (!child) return;
    const fb = fieldBinding(child, ctx);
    if (fb?.err) out.push(fb);
    child.children.forEach(visit);
  };
  block.children.forEach(visit);
  return out;
}

/**
 * Manejador de envío de un formulario con campos validados: valida todo, pinta
 * los mensajes y solo si no hay ninguno ejecuta las acciones del usuario.
 *
 * Se construye con `on` (sin sentencias componibles) a propósito: las acciones
 * de `submit` del usuario ya van incluidas aquí, y si el atributo se anunciara
 * componible, `attachEvents` las añadiría por segunda vez.
 */
function formSubmitHandler(
  fields: FieldBinding[],
  actions: BlockAction[],
  ctx: SchemaCtx,
  scope: ActionScope,
): Attr {
  const stmts = actionStatements(actions, ctx.vars, scope);
  const list = ctx.vars.some((v) => v.name === 'mensajes') ? 'mensajesDeValidacion' : 'mensajes';

  const checks = fields.map((f) => `${f.validator}(${f.v.name})`);
  const sets = fields.map((f, i) => `${setterName(f.err!.name)}(${list}[${i}]);`);

  // Indentación pensada para su destino: el emisor extrae los manejadores
  // multilínea como `const` dentro del componente (dos espacios de base).
  const code = [
    `(${paramEnvio(ctx.lang ?? 'ts')}) => {`,
    '    e.preventDefault();',
    `    const ${list} = [${checks.join(', ')}];`,
    `    ${sets.join(' ')}`,
    `    if (${list}.some((mensaje) => mensaje !== '')) return;`,
    ...(stmts.length > 0 ? [`    ${stmts.join(' ')}`] : []),
    '  }',
  ].join('\n');

  return on(code, (rt) => {
    const mensajes = fields.map((f) => runValidation(f.rules, rt.get(f.v.name)));
    fields.forEach((f, i) => rt.set(f.err!.name, mensajes[i]));
    if (mensajes.some((m) => m !== '')) return;
    runActions(actions, ctx.vars, rt);
  });
}

function buildBase(block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const p = block.props;
  const cls = p.className || '';
  const t = block.type;

  if (isContainer(t)) return buildContainer(block, ctx);

  switch (t) {
    // ── Texto ──
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return el(t, cls, [contenidoTexto(block, ctx, p.text)]);
    case 'p': return el('p', cls, [contenidoTexto(block, ctx, p.text)]);
    case 'span': return el('span', cls, [contenidoTexto(block, ctx, p.text)]);
    case 'strong': return el('strong', cx('font-bold', cls), [txt(p.text || '')]);
    case 'em': return el('em', cx('italic', cls), [txt(p.text || '')]);
    case 'code': return el('code', cls, [txt(p.text || '')]);
    case 'pre': return el('pre', cls, [txt(p.text || '')]);
    case 'blockquote': return el('blockquote', cls, [txt(p.text || '')]);
    case 'a': return el('a', cls, [txt(p.text || 'Enlace')], { href: p.href || '#' });
    case 'hr': return el('hr', cx('border-t border-[color:var(--vz-borde)] my-4', cls));
    case 'label': return el('label', cls, [txt(p.text || '')]);

    // ── Formulario ──
    case 'button':
      // `submit` solo si se pide: un botón que envía sin que nadie lo haya
      // decidido dispararía el formulario entero al pulsarlo.
      return el('button', cls, [txt(p.text || 'Botón')], {
        type: p.buttonType === 'submit' ? 'submit' : 'button',
      });
    case 'input': {
      const fb = fieldBinding(block, ctx);
      const base = cx(FIELD_CLS, cls);
      if (!fb) {
        return labelled(p.label, el('input', base, [], {
          type: p.inputType || 'text',
          placeholder: p.placeholder,
        }), block.id);
      }
      return labelled(p.label, withFieldError(fb, el('input', null, [], {
        type: p.inputType || 'text',
        placeholder: p.placeholder,
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })), block.id);
    }
    case 'textarea': {
      const fb = fieldBinding(block, ctx);
      const base = cx(FIELD_CLS, cls);
      const rows = bind(String(int(p.rows, 3)), String(int(p.rows, 3)));
      if (!fb) {
        return labelled(p.label, el('textarea', base, [], {
          placeholder: p.placeholder,
          rows,
        }), block.id);
      }
      return labelled(p.label, withFieldError(fb, el('textarea', null, [], {
        placeholder: p.placeholder,
        rows,
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })), block.id);
    }
    case 'select': {
      const fb = fieldBinding(block, ctx);
      const base = cx(FIELD_CLS, cls);
      const options = csv(p.options).map((o) => el('option', null, [txt(o)]));
      if (!fb) return labelled(p.label, el('select', base, options), block.id);
      // Controlado con valor inicial vacío: hace falta una opción que lo
      // represente, o el desplegable mostraría en blanco sin explicación.
      const placeholder = el('option', null, [txt(p.placeholder || 'Selecciona una opción')], {
        value: { kind: 'static', value: '' } as Attr,
        disabled: bind('true', 'true'),
      });
      return labelled(p.label, withFieldError(fb, el('select', null, [placeholder, ...options], {
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })), block.id);
    }
    case 'checkbox': {
      const fb = fieldBinding(block, ctx);
      const boxCls = 'rounded border-[color:var(--vz-borde)] w-4 h-4 text-[color:var(--vz-primario)] focus:ring-[color:var(--vz-primario)]/20';
      const wrap = cx('flex items-center gap-2.5 text-sm cursor-pointer', cls);
      if (!fb) {
        return el('label', wrap, [
          el('input', boxCls, [], { type: 'checkbox' }),
          txt(p.label || ''),
        ]);
      }
      return withFieldError(fb, el('label', wrap, [
        el('input', boxCls, [], {
          type: 'checkbox',
          checked: bind(fb.v.name, fb.v.initial === 'true' ? 'true' : 'false',
            (rt) => (rt.get(fb.v.name) ? 'true' : 'false')),
          onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
          'aria-invalid': fieldAriaInvalid(fb),
        }),
        txt(p.label || ''),
      ]));
    }
    case 'radio': {
      const options = csv(p.options).length > 0 ? csv(p.options) : ['Opción A', 'Opción B'];
      return el('div', cx('space-y-2.5', cls), [
        ...(p.label ? [el('span', 'block text-sm font-medium text-[color:var(--vz-texto)]', [txt(p.label)])] : []),
        ...options.map((o) => el('label', 'flex items-center gap-2.5 text-sm cursor-pointer', [
          el('input', 'w-4 h-4 text-[color:var(--vz-primario)] border-[color:var(--vz-borde)] focus:ring-[color:var(--vz-primario)]/20', [], {
            type: 'radio', name: p.name || 'grupo',
          }),
          txt(o),
        ])),
      ]);
    }
    case 'switch': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'active', 'boolean', p.checked !== 'false' ? 'true' : 'false');
      const onCls = 'w-11 h-6 rounded-full relative shadow-inner transition-colors';
      const knob = 'absolute top-0.5 w-5 h-5 bg-[var(--vz-superficie)] rounded-full shadow-md transition-transform';
      const set = setterName(v.name);
      const track = (state: boolean) => cx(onCls, state ? 'bg-[var(--vz-primario)]' : 'bg-slate-300');
      return el('button', cx('flex items-center gap-3 text-sm cursor-pointer', cls), [
        el('span', null, [
          el('span', null, [], {
            className: bind(
              `\`${knob} \${${v.name} ? 'right-0.5' : 'left-0.5'}\``,
              cx(knob, v.initial === 'true' ? 'right-0.5' : 'left-0.5'),
              (rt) => cx(knob, rt.get(v.name) ? 'right-0.5' : 'left-0.5'),
            ),
          }),
        ], {
          className: bind(`\`${onCls} \${${v.name} ? 'bg-[var(--vz-primario)]' : 'bg-slate-300'}\``,
            track(v.initial === 'true'),
            (rt) => track(Boolean(rt.get(v.name)))),
        }),
        txt(p.label || ''),
      ], {
        type: 'button', role: 'switch',
        'aria-checked': bind(String(v.name), v.initial === 'true' ? 'true' : 'false',
          (rt) => String(Boolean(rt.get(v.name)))),
        onClick: on(`() => ${set}((c) => !c)`, (rt) => rt.set(v.name, !rt.get(v.name))),
      });
    }
    case 'slider': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'value', 'number', p.value || '50');
      const value = expr(v.name, v.initial || '50', (rt) => String(num(rt, v.name, 50)));
      return el('div', cls, [
        ...(p.label ? [el('label', 'block text-sm font-medium text-[color:var(--vz-texto)] mb-1.5', [
          txt(`${p.label}: `), el('span', 'text-[color:var(--vz-primario)] font-semibold', [value]),
        ])] : []),
        el('input', 'w-full accent-blue-600', [], {
          type: 'range', min: p.min || '0', max: p.max || '100',
          value: bind(v.name, v.initial || '50', (rt) => String(num(rt, v.name, 50))),
          // Tipado estructural por el mismo motivo que en `eventHandler`.
          onChange: on(
            `(${paramValor(ctx.lang ?? 'ts')}) => ${setterName(v.name)}(Number(e.target.value))`,
            (rt, payload) => rt.set(v.name, Number(payload) || 0),
          ),
        }),
      ]);
    }
    case 'search': {
      const fb = fieldBinding(block, ctx);
      const lupa = el('svg', 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--vz-texto-suave)]', [
        el('circle', null, [], { cx: '11', cy: '11', r: '8' }),
        el('path', null, [], { d: 'm21 21-4.35-4.35' }),
      ], { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: '2' });
      const base = `${FIELD_CLS} pl-10`;
      if (!fb) {
        return el('div', cx('relative', cls), [
          lupa,
          el('input', base, [], { type: 'search', placeholder: p.placeholder || 'Buscar...' }),
        ]);
      }
      return el('div', cx('relative', cls), [
        lupa,
        el('input', null, [], {
          type: 'search',
          placeholder: p.placeholder || 'Buscar...',
          className: fieldClass(base, fb),
          value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
          onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
          'aria-invalid': fieldAriaInvalid(fb),
        }),
      ]);
    }
    // El selector de hora comparte todo con el de fecha salvo el `type`: mismo
    // enlace, misma validación y mismo control nativo, que es accesible y sabe
    // de formatos locales mejor que cualquier reimplementación.
    case 'chip': {
      const items = csv(p.items);
      const chipCls = 'inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-sm bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)]';
      const equis = 'w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-borde)] hover:text-[color:var(--vz-texto)]';
      // Una variable por chip, y no una lista de descartados: el modelo de estado
      // solo tiene cadenas, números y booleanos, y codificar un conjunto dentro
      // de una cadena obligaría a inventar un formato que nadie más entiende.
      return el('div', cx('flex flex-wrap gap-2', cls), items.map((texto, i) => {
        const v = implicitVar(block, ctx, `visible${i}`, 'boolean', 'true');
        return when(v.name, true, [
          el('span', chipCls, [
            txt(texto),
            el('button', equis, [txt('✕')], {
              type: 'button',
              'aria-label': `Quitar ${texto}`,
              onClick: on(`() => ${setterName(v.name)}(false)`, (rt) => rt.set(v.name, false)),
            }),
          ]),
        ], (rt) => rt.get(v.name) !== false);
      }));
    }
    case 'carousel': {
      const items = csv(p.items);
      const total = Math.max(items.length, 1);
      const v = implicitVar(block, ctx, 'slide', 'number', '0');
      const set = setterName(v.name);
      const flecha = 'w-8 h-8 rounded-full border border-[color:var(--vz-borde)] bg-[var(--vz-superficie)] flex items-center justify-center text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)]';
      const punto = 'w-2 h-2 rounded-full transition-colors';
      // El módulo mantiene el índice dentro del rango en los dos sentidos: sin él,
      // «anterior» en la primera diapositiva deja un índice negativo y no se ve nada.
      const avanzar = (paso: number) => `() => ${set}((n) => (n + ${paso} + ${total}) % ${total})`;
      const mover = (paso: number) => (rt: Runtime) =>
        rt.set(v.name, (num(rt, v.name, 0) + paso + total) % total);
      return el('div', cx('space-y-3', cls), [
        el('div', 'relative flex items-center gap-3', [
          el('button', flecha, [txt('‹')], {
            type: 'button', 'aria-label': 'Anterior',
            onClick: on(avanzar(-1), mover(-1)),
          }),
          el('div', 'flex-1 min-h-[7rem] rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] bg-[var(--vz-superficie-alt)] flex items-center justify-center p-6 text-center',
            items.map((texto, i) => when(
              `${v.name} === ${i}`, i === 0, [el('span', 'text-sm', [txt(texto)])],
              (rt) => num(rt, v.name, 0) === i,
            ))),
          el('button', flecha, [txt('›')], {
            type: 'button', 'aria-label': 'Siguiente',
            onClick: on(avanzar(1), mover(1)),
          }),
        ]),
        el('div', 'flex justify-center gap-1.5', items.map((_, i) => el('button', null, [], {
          type: 'button',
          'aria-label': `Ir a ${i + 1}`,
          className: bind(
            `\`${punto} \${${v.name} === ${i} ? 'bg-[var(--vz-primario)]' : 'bg-[var(--vz-borde)]'}\``,
            cx(punto, i === 0 ? 'bg-[var(--vz-primario)]' : 'bg-[var(--vz-borde)]'),
            (rt) => cx(punto, num(rt, v.name, 0) === i ? 'bg-[var(--vz-primario)]' : 'bg-[var(--vz-borde)]'),
          ),
          onClick: on(`() => ${set}(${i})`, (rt) => rt.set(v.name, i)),
        }))),
      ]);
    }
    case 'tree': {
      // Formato: «Padre>Hijo,Hijo;Padre sin hijos». Es el mismo criterio que el
      // resto de bloques con datos en props: una cadena legible en el panel.
      const ramas = (p.items || '').split(';').map((r) => r.trim()).filter(Boolean)
        .map((r) => {
          const [padre, hijos] = r.split('>');
          return { padre: (padre || '').trim(), hijos: csv(hijos) };
        });
      const filaCls = 'w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-[var(--vz-radio)] hover:bg-[var(--vz-superficie-alt)] text-left';
      return el('div', cx('space-y-0.5', cls), ramas.flatMap((rama, i) => {
        if (rama.hijos.length === 0) {
          return [el('div', `${filaCls} pl-7 text-[color:var(--vz-texto-suave)]`, [txt(rama.padre)])];
        }
        const v = implicitVar(block, ctx, `branch${i}`, 'boolean', i === 0 ? 'true' : 'false');
        return [
          el('button', filaCls, [
            el('span', 'w-3 text-[10px] text-[color:var(--vz-texto-suave)]', [
              expr(`${v.name} ? '▾' : '▸'`, i === 0 ? '▾' : '▸', (rt) => (rt.get(v.name) ? '▾' : '▸')),
            ]),
            txt(rama.padre),
          ], {
            type: 'button',
            'aria-expanded': bind(String(v.name), i === 0 ? 'true' : 'false',
              (rt) => String(Boolean(rt.get(v.name)))),
            onClick: on(`() => ${setterName(v.name)}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
          }),
          when(v.name, i === 0, [
            el('div', 'pl-7 space-y-0.5', rama.hijos.map((h) =>
              el('div', `${filaCls} text-[color:var(--vz-texto-suave)]`, [txt(h)]))),
          ], (rt) => Boolean(rt.get(v.name))),
        ];
      }));
    }
    case 'command': {
      const items = csv(p.items);
      const consulta = implicitVar(block, ctx, 'command', 'string', '');
      const set = setterName(consulta.name);
      const itemCls = 'w-full text-left px-3 py-2 text-sm rounded-[var(--vz-radio)] hover:bg-[var(--vz-superficie-alt)] flex items-center gap-2';
      return el('div', cx('rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] bg-[var(--vz-superficie)] shadow-lg overflow-hidden max-w-md', cls), [
        el('input', 'w-full px-3 py-2.5 text-sm outline-none border-b border-[color:var(--vz-borde)] bg-transparent', [], {
          type: 'text', placeholder: p.placeholder || 'Escribe un comando…',
          'aria-label': 'Buscar comando',
          value: bind(consulta.name, '', (rt) => asStr(rt.get(consulta.name))),
          onChange: on(
            `(${paramValor(ctx.lang ?? 'ts')}) => ${set}(e.target.value)`,
            (rt, payload) => rt.set(consulta.name, String(payload ?? '')),
          ),
        }),
        el('div', 'p-1 max-h-64 overflow-y-auto', items.map((it) => when(
          `${JSON.stringify(it)}.toLowerCase().includes(${consulta.name}.toLowerCase())`,
          true,
          [el('button', itemCls, [el('span', 'text-[color:var(--vz-texto-suave)]', [txt('▸')]), txt(it)], { type: 'button' })],
          (rt) => it.toLowerCase().includes(asStr(rt.get(consulta.name)).toLowerCase()),
        ))),
      ]);
    }
    case 'chart-bar':
    case 'chart-line': {
      /*
        SVG a mano y sin dependencias.

        Una librería de gráficas está descartada por construcción: el componente
        se emite como `export function App()` SIN imports, y el paquete promete
        ser autocontenido. Dibujarlo con `<svg>` cabe en la IR —son elementos
        como cualquier otro— y viaja a React y a Vue por el mismo camino.
      */
      const etiquetas = csv(p.labels);
      const valores = csv(p.values).map((n) => Number(n) || 0);
      const unidad = p.unit || '';
      const alto = 120;
      const ancho = 260;
      const maximo = Math.max(...valores, 1);
      const paso = valores.length > 1 ? ancho / (valores.length - 1) : ancho;
      const y = (v: number) => alto - (v / maximo) * (alto - 12);

      const cuerpo = t === 'chart-bar'
        ? valores.map((v, i) => {
          const w = (ancho / valores.length) * 0.62;
          const x = (ancho / valores.length) * i + (ancho / valores.length - w) / 2;
          return el('rect', null, [], {
            x: String(Math.round(x)), y: String(Math.round(y(v))),
            width: String(Math.round(w)), height: String(Math.round(alto - y(v))),
            rx: '3', fill: 'var(--vz-primario)',
          });
        })
        : [
          el('polyline', null, [], {
            fill: 'none', stroke: 'var(--vz-primario)', 'stroke-width': '2',
            'stroke-linejoin': 'round', 'stroke-linecap': 'round',
            points: valores.map((v, i) => `${Math.round(paso * i)},${Math.round(y(v))}`).join(' '),
          }),
          ...valores.map((v, i) => el('circle', null, [], {
            cx: String(Math.round(paso * i)), cy: String(Math.round(y(v))),
            r: '3', fill: 'var(--vz-primario)',
          })),
        ];

      return el('figure', cx('space-y-2', cls), [
        el('svg', 'w-full h-32', cuerpo, {
          viewBox: `0 0 ${ancho} ${alto}`,
          preserveAspectRatio: 'none',
          role: 'img',
          'aria-label': etiquetas.map((l, i) => `${l}: ${valores[i] ?? 0}${unidad}`).join(', '),
        }),
        el('figcaption', 'flex justify-between text-[10px] text-[color:var(--vz-texto-suave)]',
          etiquetas.map((l) => el('span', null, [txt(l)]))),
      ]);
    }
    case 'data-grid': {
      const cabeceras = csv(p.headers);
      const filas = (p.rows || '').split(';').map((f) => f.trim()).filter(Boolean)
        .map((f) => f.split('|').map((c) => c.trim()));
      const porPagina = Math.max(int(p.pageSize, 5), 1);
      const paginas = Math.max(Math.ceil(filas.length / porPagina), 1);
      const v = implicitVar(block, ctx, 'tablePage', 'number', '0');
      const set = setterName(v.name);
      const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[color:var(--vz-texto-suave)] border-b border-[color:var(--vz-borde)]';
      const td = 'px-3 py-2 text-sm border-b border-[color:var(--vz-borde)]';
      const nav = 'px-2.5 py-1 text-sm rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--vz-superficie-alt)]';
      return el('div', cx('space-y-2', cls), [
        el('div', 'w-full overflow-x-auto', [
          el('table', 'w-full border-collapse', [
            el('thead', null, [el('tr', null, cabeceras.map((h) => el('th', th, [txt(h)])))]),
            // Paginar ocultando filas y no recortando la lista: la IR pliega sus
            // listas sobre datos CONSTANTES, así que un `.slice()` dependiente del
            // estado no se puede expresar. Con un condicional por fila, el lienzo
            // y el componente exportado pasan de página exactamente igual.
            el('tbody', null, filas.map((fila, i) => when(
              `Math.floor(${i} / ${porPagina}) === ${v.name}`,
              i < porPagina,
              [el('tr', null, fila.map((celda) => el('td', td, [txt(celda)])))],
              (rt) => Math.floor(i / porPagina) === num(rt, v.name, 0),
            ))),
          ]),
        ]),
        el('div', 'flex items-center justify-between gap-3', [
          el('span', 'text-xs text-[color:var(--vz-texto-suave)] tabular-nums', [
            txt('Página '),
            expr(`${v.name} + 1`, '1', (rt) => String(num(rt, v.name, 0) + 1)),
            txt(` de ${paginas}`),
          ]),
          el('div', 'flex gap-1.5', [
            el('button', nav, [txt('Anterior')], {
              type: 'button',
              disabled: bind(`${v.name} === 0`, 'true', (rt) => String(num(rt, v.name, 0) === 0)),
              onClick: on(`() => ${set}((n) => Math.max(0, n - 1))`,
                (rt) => rt.set(v.name, Math.max(0, num(rt, v.name, 0) - 1))),
            }),
            el('button', nav, [txt('Siguiente')], {
              type: 'button',
              disabled: bind(`${v.name} >= ${paginas - 1}`, paginas <= 1 ? 'true' : 'false',
                (rt) => String(num(rt, v.name, 0) >= paginas - 1)),
              onClick: on(`() => ${set}((n) => Math.min(${paginas - 1}, n + 1))`,
                (rt) => rt.set(v.name, Math.min(paginas - 1, num(rt, v.name, 0) + 1))),
            }),
          ]),
        ]),
      ]);
    }
    case 'time-picker': {
      const fb = fieldBinding(block, ctx);
      const base = cx(FIELD_CLS, cls);
      if (!fb) return labelled(p.label, el('input', base, [], { type: 'time', defaultValue: p.value || '' }), block.id);
      return labelled(p.label, withFieldError(fb, el('input', null, [], {
        type: 'time',
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })), block.id);
    }
    case 'color-picker': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'color', 'string', p.value || '#4f46e5');
      const presets = csv(p.presets);
      const muestra = 'w-7 h-7 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] cursor-pointer';
      return el('div', cx('space-y-2', cls), [
        ...(p.label ? [el('label', LABEL_CLS, [txt(p.label)])] : []),
        el('div', 'flex flex-wrap items-center gap-2', [
          el('input', 'w-10 h-9 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] bg-transparent cursor-pointer p-0.5', [], {
            type: 'color',
            value: bind(v.name, v.initial, (rt) => asStr(rt.get(v.name))),
            onChange: on(
              `(${paramValor(ctx.lang ?? 'ts')}) => ${setterName(v.name)}(e.target.value)`,
              (rt, payload) => rt.set(v.name, String(payload ?? '')),
            ),
          }),
          el('code', 'text-xs text-[color:var(--vz-texto-suave)] tabular-nums',
            [expr(v.name, v.initial, (rt) => asStr(rt.get(v.name)))]),
          // Los presets son el atajo real: elegir de una paleta de marca es más
          // frecuente que abrir la rueda de color del sistema.
          ...presets.map((hex) => el('button', null, [], {
            type: 'button',
            'aria-label': `Usar ${hex}`,
            className: `${muestra} bg-[${hex}]`,
            onClick: on(`() => ${setterName(v.name)}(${JSON.stringify(hex)})`, (rt) => rt.set(v.name, hex)),
          })),
        ]),
      ]);
    }
    case 'number-input': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'quantity', 'number', p.value || '0');
      const min = int(p.min, 0);
      const max = int(p.max, 99);
      const step = int(p.step, 1) || 1;
      const set = setterName(v.name);
      const paso = 'w-9 h-9 shrink-0 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] flex items-center justify-center text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)] disabled:opacity-40 disabled:cursor-not-allowed';
      const actual = int(v.initial, 0);
      // El acotado va en el propio setter y no en el manejador: así el límite se
      // respeta venga el cambio del botón, del teclado o de una acción del panel.
      const acotar = (expresion: string) => `Math.min(${max}, Math.max(${min}, ${expresion}))`;
      const clamp = (n: number) => Math.min(max, Math.max(min, n));
      return el('div', cx('space-y-1.5', cls), [
        ...(p.label ? [el('label', LABEL_CLS, [txt(p.label)])] : []),
        el('div', 'flex items-center gap-2', [
          el('button', paso, [txt('−')], {
            type: 'button',
            'aria-label': 'Restar',
            disabled: bind(`${v.name} <= ${min}`, actual <= min ? 'true' : 'false',
              (rt) => String(num(rt, v.name, actual) <= min)),
            onClick: on(`() => ${set}((n) => ${acotar(`n - ${step}`)})`,
              (rt) => rt.set(v.name, clamp(num(rt, v.name, actual) - step))),
          }),
          el('input', 'w-16 text-center tabular-nums border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-2 py-1.5 text-sm outline-none focus:border-[color:var(--vz-primario)]', [], {
            type: 'number', min: String(min), max: String(max), step: String(step),
            value: bind(v.name, String(actual), (rt) => String(num(rt, v.name, actual))),
            onChange: on(
              `(${paramValor(ctx.lang ?? 'ts')}) => ${set}(${acotar('Number(e.target.value) || 0')})`,
              (rt, payload) => rt.set(v.name, clamp(Number(payload) || 0)),
            ),
          }),
          el('button', paso, [txt('+')], {
            type: 'button',
            'aria-label': 'Sumar',
            disabled: bind(`${v.name} >= ${max}`, actual >= max ? 'true' : 'false',
              (rt) => String(num(rt, v.name, actual) >= max)),
            onClick: on(`() => ${set}((n) => ${acotar(`n + ${step}`)})`,
              (rt) => rt.set(v.name, clamp(num(rt, v.name, actual) + step))),
          }),
        ]),
      ]);
    }
    case 'toggle-group': {
      const v = boundVar(block, ctx) ?? implicitVar(block, ctx, 'option', 'number', p.value || '0');
      const items = csv(p.options);
      const activo = 'bg-[var(--vz-superficie)] text-[color:var(--vz-texto)] shadow-sm';
      const inerte = 'text-[color:var(--vz-texto-suave)] hover:text-[color:var(--vz-texto)]';
      const base = 'px-3 py-1.5 text-sm font-medium rounded-[var(--vz-radio)] transition-colors';
      const actual = int(v.initial, 0);
      return el('div', cx('inline-flex gap-1 p-1 rounded-[var(--vz-radio)] bg-[var(--vz-superficie-alt)]', cls),
        items.map((x, i) => el('button', null, [txt(x)], {
          type: 'button',
          role: 'radio',
          'aria-checked': bind(`${v.name} === ${i}`, actual === i ? 'true' : 'false',
            (rt) => String(num(rt, v.name, actual) === i)),
          className: bind(`\`${base} \${${v.name} === ${i} ? '${activo}' : '${inerte}'}\``,
            cx(base, actual === i ? activo : inerte),
            (rt) => cx(base, num(rt, v.name, actual) === i ? activo : inerte)),
          onClick: on(`() => ${setterName(v.name)}(${i})`, (rt) => rt.set(v.name, i)),
        })), { role: 'radiogroup', 'aria-label': p.label || 'Opciones' });
    }
    case 'range': {
      // Dos variables y no una: un rango son dos extremos independientes, y
      // modelarlo con un solo número obligaría a inventar una codificación.
      const desde = implicitVar(block, ctx, 'from', 'number', p.from || '0');
      const hasta = implicitVar(block, ctx, 'to', 'number', p.to || '100');
      const min = int(p.min, 0);
      const max = int(p.max, 100);
      const unidad = p.unit || '';
      const carril = 'w-full accent-[color:var(--vz-primario)]';
      // El extremo inferior nunca pasa al superior: se acota contra el otro
      // valor, que es lo que impide que el rango se dé la vuelta.
      const extremo = (v: typeof desde, tope: string, lado: 'min' | 'max', inicial: number) =>
        el('input', carril, [], {
          type: 'range', min: String(min), max: String(max),
          value: bind(v.name, String(inicial), (rt) => String(num(rt, v.name, inicial))),
          'aria-label': lado === 'min' ? 'Desde' : 'Hasta',
          onChange: on(
            `(${paramValor(ctx.lang ?? 'ts')}) => ${setterName(v.name)}(` +
            `Math.${lado === 'min' ? 'min' : 'max'}(Number(e.target.value), ${tope}))`,
            (rt, payload) => {
              const otro = num(rt, tope, lado === 'min' ? max : min);
              const n = Number(payload) || 0;
              rt.set(v.name, lado === 'min' ? Math.min(n, otro) : Math.max(n, otro));
            },
          ),
        });
      const valor = (v: typeof desde, inicial: number) =>
        expr(`\`\${${v.name}}${unidad}\``, `${inicial}${unidad}`,
          (rt) => `${num(rt, v.name, inicial)}${unidad}`);
      return el('div', cx('space-y-2', cls), [
        el('div', 'flex items-baseline justify-between gap-3', [
          ...(p.label ? [el('span', LABEL_CLS, [txt(p.label)])] : []),
          el('span', 'text-sm font-semibold text-[color:var(--vz-primario)] tabular-nums', [
            valor(desde, int(p.from, 0)), txt(' – '), valor(hasta, int(p.to, 100)),
          ]),
        ]),
        extremo(desde, hasta.name, 'min', int(p.from, 0)),
        extremo(hasta, desde.name, 'max', int(p.to, 100)),
      ]);
    }
    case 'combobox': {
      const consulta = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'query', 'string', '');
      const abierto = implicitVar(block, ctx, 'listOpen', 'boolean', 'false');
      const opciones = csv(p.options);
      const set = setterName(consulta.name);
      const setAbierto = setterName(abierto.name);
      const coincide = (o: string, q: string) => o.toLowerCase().includes(q.toLowerCase());
      const itemCls = 'w-full text-left px-3 py-2 text-sm hover:bg-[var(--vz-superficie-alt)] cursor-pointer';
      return el('div', cx('relative', cls), [
        ...(p.label ? [el('label', LABEL_CLS, [txt(p.label)])] : []),
        el('input', FIELD_CLS, [], {
          type: 'text', placeholder: p.placeholder || '', role: 'combobox',
          'aria-expanded': bind(String(abierto.name), 'false', (rt) => String(Boolean(rt.get(abierto.name)))),
          value: bind(consulta.name, consulta.initial, (rt) => asStr(rt.get(consulta.name))),
          onChange: on(
            `(${paramValor(ctx.lang ?? 'ts')}) => { ${set}(e.target.value); ${setAbierto}(true); }`,
            (rt, payload) => { rt.set(consulta.name, String(payload ?? '')); rt.set(abierto.name, true); },
          ),
          onFocus: on(`() => ${setAbierto}(true)`, (rt) => rt.set(abierto.name, true)),
        }),
        /*
          Una opción por bloque condicional, en vez de un `.map()` con filtro.

          La IR no tiene nodo «lista en tiempo de ejecución»: sus listas se
          pliegan a `.map()` sobre datos CONSTANTES, y aquí el filtro depende de
          lo que se teclea. Con un condicional por opción el desplegable reacciona
          igual en el lienzo y en el componente exportado —misma condición, un
          único `buildNode`— que es la garantía que sostiene todo el constructor.
          El coste es un bloque por opción en el código emitido; el beneficio, que
          lo que se ve editando es lo que se lleva el usuario.
        */
        el('div', 'absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] bg-[var(--vz-superficie)] shadow-lg',
          opciones.map((o) => when(
            `${abierto.name} && ${JSON.stringify(o)}.toLowerCase().includes(${consulta.name}.toLowerCase())`,
            false,
            [el('button', itemCls, [txt(o)], {
              type: 'button',
              onClick: on(
                `() => { ${set}(${JSON.stringify(o)}); ${setAbierto}(false); }`,
                (rt) => { rt.set(consulta.name, o); rt.set(abierto.name, false); },
              ),
            })],
            (rt) => Boolean(rt.get(abierto.name)) && coincide(o, asStr(rt.get(consulta.name))),
          ))),
      ]);
    }
    case 'date-picker': {
      const fb = fieldBinding(block, ctx);
      const base = cx(FIELD_CLS, cls);
      if (!fb) return labelled(p.label, el('input', base, [], { type: 'date' }), block.id);
      return labelled(p.label, withFieldError(fb, el('input', null, [], {
        type: 'date',
        className: fieldClass(base, fb),
        value: bind(fb.v.name, fb.v.initial, (rt) => asStr(rt.get(fb.v.name))),
        onChange: fieldChangeHandler(fb, ctx.lang ?? 'ts'),
        onBlur: fieldBlurHandler(fb),
        'aria-invalid': fieldAriaInvalid(fb),
      })), block.id);
    }
    case 'file-upload':
      // El borde al pasar por encima ya usaba el color de marca; el fondo se
      // había quedado en `bg-blue-50/30` y con otro tema desentonaba con él.
      return el('label', cx('block border-2 border-dashed border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] p-8 text-center hover:border-[color:var(--vz-primario)] hover:bg-[var(--vz-superficie-alt)] transition-colors cursor-pointer', cls), [
        el('span', 'block text-3xl text-slate-300 mb-2', [txt('⇪')]),
        el('span', 'block text-sm font-medium text-[color:var(--vz-texto-suave)]', [txt(p.text || 'Arrastra archivos aquí')]),
        el('span', 'block text-xs text-[color:var(--vz-texto-suave)] mt-1', [txt(p.accept || 'o haz clic para seleccionar')]),
        el('input', 'sr-only', [], { type: 'file', accept: p.accept }),
      ]);
    case 'rating': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'rating', 'number', p.value || '4');
      const max = int(p.max, 5);
      const value = int(v.initial, 4);
      const filled = 'text-amber-400 drop-shadow-sm';
      const emptyCls = 'text-slate-200 hover:text-amber-300';
      return el('div', cx('flex gap-0.5', cls), Array.from({ length: max }, (_, i) => {
        const base = 'text-xl cursor-pointer transition-colors';
        return el('button', null, [txt('★')], {
          type: 'button',
          'aria-label': `${i + 1}`,
          className: bind(`\`${base} \${${v.name} > ${i} ? '${filled}' : '${emptyCls}'}\``,
            cx(base, value > i ? filled : emptyCls),
            (rt) => cx(base, num(rt, v.name, value) > i ? filled : emptyCls)),
          onClick: on(`() => ${setterName(v.name)}(${i + 1})`, (rt) => rt.set(v.name, i + 1)),
        });
      }));
    }
    case 'fieldset': // contenedor, tratado arriba; aquí por exhaustividad del switch
      return buildContainer(block, ctx);

    // ── Media ──
    case 'img':
      return el('img', cx('rounded-[var(--vz-radio)] max-w-full', cls), [], {
        src: fuenteImagen(block, ctx, p.src), alt: p.alt || '',
      });
    case 'avatar': {
      const sizes: Record<string, string> = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14' };
      return el('img', cx(sizes[p.size || 'md'], 'rounded-full object-cover', cls), [], {
        src: fuenteImagen(block, ctx, p.src), alt: p.alt || '',
      });
    }
    case 'video':
      return el('video', cx('rounded-[var(--vz-radio)] w-full', cls), [el('source', null, [], { src: p.src })], { controls: bind('true', 'true') });
    case 'audio':
      return el('audio', cx('w-full', cls), [el('source', null, [], { src: p.src })], { controls: bind('true', 'true') });
    case 'iframe':
      return el('iframe', cx('w-full h-48 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)]', cls), [], { src: p.src || 'about:blank', title: p.alt || 'Contenido embebido' });

    // ── Tablas y listas ──
    case 'table': {
      const rows = int(p.rows, 3), cols = int(p.cols, 3);
      /*
        La tabla va dentro de un contenedor desplazable.

        Una celda no encoge por debajo de su contenido, así que `w-full` no basta:
        una tabla de seis columnas se sale del móvil por mucho que se le pida el
        100 %, y sin contenedor lo que desborda es la PÁGINA. Con él, el ancho
        que sobra se desplaza dentro de la tabla y el resto del componente se
        queda quieto. Es la manera estándar de resolverlo, y por eso se emite en
        el propio bloque en vez de dejarlo en manos de quien lo use.
      */
      return el('div', 'w-full overflow-x-auto', [el('table', cx('w-full border-collapse', cls), [
        el('thead', null, [el('tr', null, Array.from({ length: cols }, (_, c) =>
          el('th', 'border border-[color:var(--vz-borde)] px-3 py-2 bg-[var(--vz-superficie-alt)] text-left text-xs font-semibold uppercase text-[color:var(--vz-texto-suave)]', [txt(`Col ${c + 1}`)])))]),
        el('tbody', null, Array.from({ length: rows }, (_, r) =>
          el('tr', r % 2 ? 'bg-[var(--vz-superficie-alt)]/50' : null, Array.from({ length: cols }, (_, c) =>
            el('td', 'border border-[color:var(--vz-borde)] px-3 py-2 text-sm', [txt(`R${r + 1}C${c + 1}`)]))))),
      ])]);
    }
    case 'table-ui': {
      const headers = csv(p.headers);
      const rows = csv(p.rows).map((r) => r.split(':').map((c) => c.trim()));
      // `overflow-x-auto` en lugar de `overflow-hidden`: sigue recortando las
      // esquinas redondeadas, y además deja desplazar la tabla cuando sus
      // columnas no caben en vez de cortarlas por la mitad.
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] overflow-x-auto', cls), [
        el('table', 'w-full', [
          el('thead', null, [el('tr', 'bg-[var(--vz-superficie-alt)]', headers.map((h) =>
            el('th', 'px-4 py-3 text-left text-xs font-semibold uppercase text-[color:var(--vz-texto-suave)] border-b', [txt(h)])))]),
          el('tbody', null, rows.map((r) =>
            el('tr', 'border-b last:border-0 hover:bg-[var(--vz-superficie-alt)]', r.map((c) =>
              el('td', 'px-4 py-3 text-sm', [txt(c)]))))),
        ]),
      ]);
    }
    case 'ul':
      return el('ul', cx('list-disc list-inside space-y-1', cls), csv(p.items).map((x) => el('li', null, [txt(x)])));
    case 'ol':
      return el('ol', cx('list-decimal list-inside space-y-1', cls), csv(p.items).map((x) => el('li', null, [txt(x)])));
    case 'dl':
      return el('dl', cx('space-y-2', cls), pairs(p.items).map(([dt, dd]) =>
        el('div', 'flex gap-2', [
          el('dt', 'font-medium text-sm', [txt(dt)]),
          el('dd', 'text-sm text-[color:var(--vz-texto-suave)]', [txt(dd)]),
        ])));
    case 'list-ui':
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] divide-y', cls), pairs(p.items).map(([name, sub]) =>
        el('div', 'px-4 py-3 flex items-center justify-between hover:bg-[var(--vz-superficie-alt)]', [
          el('div', null, [
            el('p', 'text-sm font-medium', [txt(name)]),
            ...(sub ? [el('p', 'text-xs text-[color:var(--vz-texto-suave)]', [txt(sub)])] : []),
          ]),
          el('span', 'text-[color:var(--vz-texto-suave)] text-xs', [txt('›')]),
        ])));

    // ── Navegación ──
    case 'breadcrumb': {
      const items = csv(p.items);
      return el('nav', cx('flex items-center gap-2 text-sm', cls), items.map((x, i) =>
        el('span', i === items.length - 1 ? 'font-medium text-[color:var(--vz-texto)]' : 'text-[color:var(--vz-texto-suave)]', [
          txt(x),
          ...(i < items.length - 1 ? [el('span', 'ml-2 text-slate-300', [txt('/')])] : []),
        ])), { 'aria-label': 'Migas de pan' });
    }
    case 'tabs': {
      const v = boundVar(block, ctx) ?? implicitVar(block, ctx, 'tab', 'number', '0');
      const items = csv(p.items);
      const active = 'text-[color:var(--vz-primario)] border-[color:var(--vz-primario)]';
      const idle = 'text-[color:var(--vz-texto-suave)] border-transparent hover:text-[color:var(--vz-texto)]';
      const base = 'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px';
      const current = int(v.initial, 0);
      return el('div', cx('flex border-b', cls), items.map((x, i) =>
        el('button', null, [txt(x)], {
          type: 'button',
          role: 'tab',
          'aria-selected': bind(`${v.name} === ${i}`, current === i ? 'true' : 'false',
            (rt) => String(num(rt, v.name, current) === i)),
          className: bind(`\`${base} \${${v.name} === ${i} ? '${active}' : '${idle}'}\``,
            cx(base, current === i ? active : idle),
            (rt) => cx(base, num(rt, v.name, current) === i ? active : idle)),
          onClick: on(`() => ${setterName(v.name)}(${i})`, (rt) => rt.set(v.name, i)),
        })), { role: 'tablist' });
    }
    case 'pagination': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'page', 'number', p.current || '1');
      const pages = int(p.pages, 5);
      const current = int(v.initial, 1);
      const act = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)]';
      const idle = 'text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)]';
      const base = 'px-3 py-1 text-sm rounded';
      const arrow = 'px-2 py-1 text-sm text-[color:var(--vz-texto-suave)] rounded hover:bg-[var(--vz-superficie-alt)]';
      const set = setterName(v.name);
      return el('nav', cx('flex items-center gap-1', cls), [
        el('button', arrow, [txt('‹')], {
          type: 'button', 'aria-label': 'Anterior',
          onClick: on(`() => ${set}((n) => Math.max(1, n - 1))`,
            (rt) => rt.set(v.name, Math.max(1, num(rt, v.name, current) - 1))),
        }),
        ...Array.from({ length: pages }, (_, i) => {
          const n = i + 1;
          return el('button', null, [txt(String(n))], {
            type: 'button',
            'aria-current': bind(`${v.name} === ${n} ? 'page' : undefined`, n === current ? 'page' : '',
              (rt) => (num(rt, v.name, current) === n ? 'page' : '')),
            className: bind(`\`${base} \${${v.name} === ${n} ? '${act}' : '${idle}'}\``,
              cx(base, n === current ? act : idle),
              (rt) => cx(base, num(rt, v.name, current) === n ? act : idle)),
            onClick: on(`() => ${set}(${n})`, (rt) => rt.set(v.name, n)),
          });
        }),
        el('button', arrow, [txt('›')], {
          type: 'button', 'aria-label': 'Siguiente',
          onClick: on(`() => ${set}((n) => Math.min(${pages}, n + 1))`,
            (rt) => rt.set(v.name, Math.min(pages, num(rt, v.name, current) + 1))),
        }),
      ], { 'aria-label': 'Paginación' });
    }
    case 'stepper': {
      const v = boundVar(block, ctx)
        ?? implicitVar(block, ctx, 'step', 'number', p.current || '1');
      const items = csv(p.items);
      const current = int(v.initial, 1);
      const done = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)]';
      const pending = 'bg-slate-200 text-[color:var(--vz-texto-suave)] hover:bg-slate-300';
      const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors';
      return el('div', cx('flex items-center gap-2', cls), items.map((x, i) => {
        const circle = el('button', null, [txt(String(i + 1))], {
          type: 'button',
          'aria-label': `Ir al paso ${i + 1}`,
          className: bind(`\`${base} \${${v.name} >= ${i + 1} ? '${done}' : '${pending}'}\``,
            cx(base, current >= i + 1 ? done : pending),
            (rt) => cx(base, num(rt, v.name, current) >= i + 1 ? done : pending)),
          onClick: on(`() => ${setterName(v.name)}(${i + 1})`, (rt) => rt.set(v.name, i + 1)),
        });
        return el('div', 'flex items-center gap-2', [
          circle,
          el('span', 'text-sm', [txt(x)]),
          ...(i < items.length - 1
            ? [el('span', null, [], {
                className: bind(`\`w-8 h-0.5 \${${v.name} > ${i + 1} ? 'bg-[var(--vz-primario)]' : 'bg-slate-200'}\``,
                  cx('w-8 h-0.5', current > i + 1 ? 'bg-[var(--vz-primario)]' : 'bg-slate-200'),
                  (rt) => cx('w-8 h-0.5', num(rt, v.name, current) > i + 1 ? 'bg-[var(--vz-primario)]' : 'bg-slate-200')),
              })]
            : []),
        ]);
      }));
    }
    case 'menu':
      return el('div', cx('bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg py-1 w-48', cls), csv(p.items).map((x) =>
        x === '—'
          ? el('hr', 'my-1 border-slate-100')
          : el('div', 'px-3 py-2 text-sm text-[color:var(--vz-texto)] hover:bg-[var(--vz-superficie-alt)] cursor-pointer', [txt(x)])));

    // ── Datos ──
    case 'stat':
      return el('div', cx('bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] p-5 shadow-sm', cls), [
        el('p', 'text-xs font-medium text-[color:var(--vz-texto-suave)] uppercase tracking-wide', [txt(p.label || '')]),
        el('p', 'text-2xl font-bold text-[color:var(--vz-texto)] mt-1.5', [txt(p.value || '0')]),
        ...(p.change ? [el('div', 'flex items-center gap-1.5 mt-2', [
          el('span', cx('inline-block w-2 h-2 rounded-full', p.change.startsWith('+') ? 'bg-[var(--vz-exito)]' : 'bg-[var(--vz-error)]')),
          el('span', cx('text-xs font-medium', p.change.startsWith('+') ? 'text-[color:var(--vz-exito)]' : 'text-[color:var(--vz-error)]'), [txt(p.change)]),
        ])] : []),
      ]);
    case 'badge': {
      /*
        Una variante que se llama «blue» tiene que ser azul.

        Llevaba el fondo azul y el texto en el color de MARCA, así que con un
        tema verde salía un chip azul con letra verde. Las otras cuatro ya eran
        coherentes consigo mismas; esta se había quedado a medias.
      */
      const colors: Record<string, string> = {
        blue: 'bg-blue-100 text-blue-800', green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800',
        slate: 'bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)]',
      };
      return el('span', cx('inline-block text-xs font-medium px-2.5 py-0.5 rounded-full',
        colors[p.variant || 'blue'] || colors.blue, cls), [txt(p.text || 'Badge')]);
    }
    case 'tag':
      return el('span', cx('inline-flex items-center gap-1 bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)] text-xs font-medium px-2.5 py-1 rounded-[var(--vz-radio)]', cls), [txt(p.text || 'Tag')]);
    case 'tooltip':
      return el('span', cx('underline decoration-dashed decoration-slate-400 cursor-help text-sm', cls),
        [txt(p.text || 'Hover')], { title: p.tooltip });
    case 'timeline': {
      const items = pairs(p.items);
      return el('div', cls, items.map(([title, desc], i) =>
        el('div', 'flex gap-4 relative', [
          el('div', 'flex flex-col items-center', [
            // El punto ya seguía al tema; su halo y el hilo que baja se habían
            // quedado en azul, así que con otro color de marca no pegaban.
            el('div', 'w-3 h-3 rounded-full bg-[var(--vz-primario)] ring-4 ring-[color:var(--vz-superficie-alt)] mt-1 z-10'),
            ...(i < items.length - 1 ? [el('div', 'w-0.5 flex-1 bg-[var(--vz-borde)]')] : []),
          ]),
          el('div', i === items.length - 1 ? '' : 'pb-6', [
            el('p', 'text-sm font-semibold text-[color:var(--vz-texto)]', [txt(title)]),
            el('p', 'text-xs text-[color:var(--vz-texto-suave)] mt-0.5', [txt(desc)]),
          ]),
        ])));
    }
    case 'empty':
      return el('div', cx('text-center py-8', cls), [
        el('div', 'text-4xl mb-3 text-slate-300', [txt('∅')]),
        el('h3', 'text-sm font-medium text-[color:var(--vz-texto-suave)]', [txt(p.title || 'Sin datos')]),
        el('p', 'text-xs text-[color:var(--vz-texto-suave)] mt-1', [txt(p.text || '')]),
      ]);
    case 'calendar': {
      const v = implicitVar(block, ctx, 'day', 'number', '23');
      const selectedDay = int(v.initial, 23);
      const dayBase = 'py-1.5 rounded-[var(--vz-radio)] text-xs font-medium transition-colors';
      const daySel = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] shadow-sm';
      const dayIdle = 'hover:bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)]';
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] p-4 w-64 shadow-sm bg-[var(--vz-superficie)]', cls), [
        el('div', 'flex justify-between items-center mb-3', [
          el('button', 'w-7 h-7 rounded-[var(--vz-radio)] text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)] flex items-center justify-center text-sm', [txt('‹')], { type: 'button', 'aria-label': 'Mes anterior' }),
          el('span', 'font-semibold text-sm text-[color:var(--vz-texto)]', [txt(p.month || 'Junio 2026')]),
          el('button', 'w-7 h-7 rounded-[var(--vz-radio)] text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)] flex items-center justify-center text-sm', [txt('›')], { type: 'button', 'aria-label': 'Mes siguiente' }),
        ]),
        el('div', 'grid grid-cols-7 gap-0.5 text-center text-xs', [
          ...['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) =>
            el('span', 'font-semibold text-[color:var(--vz-texto-suave)] py-1.5 text-[10px] uppercase', [txt(d)])),
          ...Array.from({ length: 30 }, (_, i) =>
            el('button', null, [txt(String(i + 1))], {
              type: 'button',
              className: bind(`\`${dayBase} \${${v.name} === ${i + 1} ? '${daySel}' : '${dayIdle}'}\``,
                cx(dayBase, selectedDay === i + 1 ? daySel : dayIdle),
                (rt) => cx(dayBase, num(rt, v.name, selectedDay) === i + 1 ? daySel : dayIdle)),
              onClick: on(`() => ${setterName(v.name)}(${i + 1})`, (rt) => rt.set(v.name, i + 1)),
            })),
        ]),
      ]);
    }

    // ── Feedback ──
    case 'alert': {
      const box: Record<string, string> = {
        // `info` es un color SEMÁNTICO, no la marca. No hay rol de tema para
        // él —los roles son éxito, aviso y error— y tomar prestado el primario
        // hacía que el aviso informativo cambiara de color con cada librería.
        info: 'bg-blue-50 text-blue-800 border-blue-200', success: 'bg-green-50 text-green-800 border-green-200',
        warning: 'bg-amber-50 text-amber-800 border-amber-200', error: 'bg-red-50 text-red-800 border-red-200',
      };
      const icon: Record<string, string> = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };
      const iconBg: Record<string, string> = {
        info: 'bg-blue-200/60 text-blue-800', success: 'bg-green-200/60 text-[color:var(--vz-exito)]',
        warning: 'bg-amber-200/60 text-[color:var(--vz-aviso)]', error: 'bg-red-200/60 text-[color:var(--vz-error)]',
      };
      const v = box[p.variant] ? p.variant : 'info';
      return el('div', cx('flex items-start gap-3 px-4 py-3 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] text-sm', box[v], cls), [
        el('span', cx('flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold', iconBg[v]), [txt(icon[v])]),
        el('span', 'pt-px', [txt(p.text || '')]),
      ], { role: v === 'error' ? 'alert' : 'status' });
    }
    case 'toast': {
      const border: Record<string, string> = {
        success: 'border-green-400', error: 'border-red-400', info: 'border-[color:var(--vz-primario)]',
      };
      const icon: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' };
      const color: Record<string, string> = { success: 'text-green-500', error: 'text-[color:var(--vz-error)]', info: 'text-[color:var(--vz-primario)]' };
      const v = border[p.variant] ? p.variant : 'success';
      return el('div', cx('flex items-center gap-3 border-l-4 bg-[var(--vz-superficie)] px-4 py-3 rounded-r-lg shadow-lg text-sm', border[v], cls), [
        el('span', cx('font-bold', color[v]), [txt(icon[v])]),
        el('span', null, [txt(p.text || '')]),
      ], { role: 'status' });
    }
    case 'progress': {
      const v = boundVar(block, ctx);
      const value = v ? int(v.initial, 0) : int(p.value, 0);
      // El preview de `style` va como texto CSS: el lienzo lo parsea y el
      // emisor usa `code`, que sí es un objeto de estilo de JSX.
      const width = v
        ? bind(`{ width: \`\${${v.name}}%\` }`, `width: ${value}%`,
            (rt) => `width: ${num(rt, v.name, value)}%`)
        : bind(`{ width: '${value}%' }`, `width: ${value}%`);
      return el('div', cls, [
        ...(p.label ? [el('div', 'flex justify-between text-xs text-[color:var(--vz-texto-suave)] mb-1', [
          el('span', null, [txt(p.label)]),
          el('span', null, [
            v
              ? expr(`\`\${${v.name}}%\``, `${value}%`, (rt) => `${num(rt, v.name, value)}%`)
              : txt(`${value}%`),
          ]),
        ])] : []),
        el('div', 'w-full h-2 bg-slate-200 rounded-full overflow-hidden', [
          el('div', 'h-full bg-[var(--vz-primario)] rounded-full transition-all', [], { style: width }),
        ], {
          role: 'progressbar',
          'aria-valuenow': v
            ? bind(v.name, String(value), (rt) => String(num(rt, v.name, value)))
            : bind(String(value), String(value)),
          // React tipa los aria-value* como números, así que van como expresión
          // y no como cadena.
          'aria-valuemin': bind('0', '0'),
          'aria-valuemax': bind('100', '100'),
        }),
      ]);
    }
    case 'spinner': {
      const sizes: Record<string, string> = { sm: 'w-5 h-5 border-2', md: 'w-8 h-8 border-[3px]', lg: 'w-12 h-12 border-4' };
      return el('div', cx(sizes[p.size || 'md'] || sizes.md, 'border-[color:var(--vz-borde)] border-t-blue-600 rounded-full animate-spin', cls),
        [], { role: 'status', 'aria-label': 'Cargando' });
    }
    case 'skeleton':
      return el('div', cx('space-y-3 animate-pulse', cls), Array.from({ length: int(p.lines, 3) }, (_, i) =>
        el('div', cx('h-3 bg-slate-200 rounded', i === 0 ? 'w-3/4' : 'w-full'))), { 'aria-hidden': 'true' });
    case 'result': {
      const variants: Record<string, { color: string; icon: string }> = {
        success: { color: 'text-green-500', icon: '✓' },
        error: { color: 'text-[color:var(--vz-error)]', icon: '✕' },
        info: { color: 'text-[color:var(--vz-primario)]', icon: 'ℹ' },
      };
      const v = variants[p.variant] || variants.success;
      return el('div', cx('text-center py-6', cls), [
        el('div', cx('text-4xl mb-3', v.color), [txt(v.icon)]),
        el('h3', 'text-lg font-semibold', [txt(p.title || '')]),
        el('p', 'text-sm text-[color:var(--vz-texto-suave)] mt-1', [txt(p.text || '')]),
      ]);
    }

    // ── Overlay ──
    case 'popover': {
      const v = implicitVar(block, ctx, 'open', 'boolean', 'false');
      const set = setterName(v.name);
      return el('div', cx('relative inline-block', cls), [
        el('button', 'text-sm text-[color:var(--vz-primario)] underline decoration-dashed', [txt(p.text || 'Clic')], {
          type: 'button',
          'aria-expanded': bind(String(v.name), 'false', (rt) => String(Boolean(rt.get(v.name)))),
          onClick: on(`() => ${set}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
        }),
        // Visible en diseño para poder editarlo; en ejecución empieza cerrado.
        when(String(v.name), true, [
          el('div', 'absolute z-10 mt-2 w-56 bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg p-3 text-sm text-[color:var(--vz-texto-suave)]', [txt(p.content || '')]),
        ], (rt) => Boolean(rt.get(v.name))),
      ]);
    }
    case 'dialog':
      return el('div', cx('bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-xl p-6 max-w-sm', cls), [
        el('h3', 'font-semibold', [txt(p.title || '')]),
        el('p', 'text-sm text-[color:var(--vz-texto-suave)] mt-2', [txt(p.text || '')]),
        el('div', 'flex gap-2 mt-4 justify-end', [
          el('button', 'px-3 py-1.5 text-sm border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] hover:bg-[var(--vz-superficie-alt)]', [txt('Cancelar')], { type: 'button' }),
          el('button', 'px-3 py-1.5 text-sm bg-[var(--vz-error)] text-[color:var(--vz-primario-contraste)] rounded-[var(--vz-radio)]', [txt('Confirmar')], { type: 'button' }),
        ]),
      ], { role: 'dialog', 'aria-modal': 'true' });

    // ── Layout ──
    case 'divider':
      return p.text
        ? el('div', cx('flex items-center gap-3', cls), [
            el('hr', 'flex-1 border-[color:var(--vz-borde)]'),
            el('span', 'text-xs text-[color:var(--vz-texto-suave)]', [txt(p.text)]),
            el('hr', 'flex-1 border-[color:var(--vz-borde)]'),
          ])
        : el('hr', cx('border-[color:var(--vz-borde)] my-2', cls));
    case 'spacer':
      return el('div', cls, [], {
        style: bind(`{ height: '${int(p.size, 32)}px' }`, `height: ${int(p.size, 32)}px`),
      });
    case 'accordion': {
      const v = boundVar(block, ctx) ?? implicitVar(block, ctx, 'panel', 'number', '0');
      const items = pairs(p.items);
      const open = int(v.initial, 0);
      return el('div', cx('border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] divide-y', cls), items.map(([title, content], i) => {
        const header = el('button', 'w-full flex justify-between items-center px-4 py-3 text-left hover:bg-[var(--vz-superficie-alt)]', [
          el('span', 'text-sm font-medium', [txt(title)]),
          el('span', 'text-[color:var(--vz-texto-suave)] text-xs', [
            expr(`${v.name} === ${i} ? '▾' : '▸'`, open === i ? '▾' : '▸',
              (rt) => (num(rt, v.name, open) === i ? '▾' : '▸')),
          ]),
        ], {
          type: 'button',
          'aria-expanded': bind(`${v.name} === ${i}`, open === i ? 'true' : 'false',
            (rt) => String(num(rt, v.name, open) === i)),
          onClick: on(`() => ${setterName(v.name)}((c) => (c === ${i} ? -1 : ${i}))`,
            (rt) => rt.set(v.name, num(rt, v.name, open) === i ? -1 : i)),
        });
        const body = el('div', 'px-4 pb-3 text-sm text-[color:var(--vz-texto-suave)]', [txt(content)]);
        return el('div', null, [
          header,
          when(`${v.name} === ${i}`, open === i, [body], (rt) => num(rt, v.name, open) === i),
        ]);
      }));
    }

    // ── Acciones ──
    case 'button-group':
      return el('div', cx('inline-flex rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] divide-x', cls), csv(p.items).map((x) =>
        el('button', 'px-4 py-2 text-sm hover:bg-[var(--vz-superficie-alt)] first:rounded-l-lg last:rounded-r-lg', [txt(x)], { type: 'button' })));
    case 'dropdown': {
      const v = implicitVar(block, ctx, 'open', 'boolean', 'false');
      const set = setterName(v.name);
      const items = csv(p.items);
      return el('div', 'relative inline-block', [
        el('button', cx('flex items-center gap-1 bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm hover:bg-[var(--vz-superficie-alt)]', cls), [
          txt(p.text || 'Opciones'),
          el('span', 'text-[color:var(--vz-texto-suave)] text-xs', [
            expr(`${v.name} ? '▴' : '▾'`, '▾', (rt) => (rt.get(v.name) ? '▴' : '▾')),
          ]),
        ], {
          type: 'button', 'aria-haspopup': 'menu',
          'aria-expanded': bind(String(v.name), 'false', (rt) => String(Boolean(rt.get(v.name)))),
          onClick: on(`() => ${set}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
        }),
        // Cerrado en diseño: el menú desplegado taparía los bloques de debajo.
        when(String(v.name), false, [
          el('div', 'absolute left-0 top-full mt-1 w-44 bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg py-1 z-10', items.map((x) =>
            el('button', 'block w-full text-left px-3 py-2 text-sm text-[color:var(--vz-texto)] hover:bg-[var(--vz-superficie-alt)]', [txt(x)], {
              type: 'button',
              onClick: on(`() => ${set}(false)`, (rt) => rt.set(v.name, false)),
            })), { role: 'menu' }),
        ], (rt) => Boolean(rt.get(v.name))),
      ]);
    }
    case 'fab':
      return el('button', cx('w-12 h-12 bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] rounded-full shadow-lg flex items-center justify-center text-xl hover:opacity-90', cls),
        [txt(p.icon || '+')], { type: 'button' });
    case 'icon-button':
      return el('button', cx('w-9 h-9 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)] flex items-center justify-center text-[color:var(--vz-texto-suave)] hover:bg-[var(--vz-superficie-alt)]', cls),
        [txt(p.icon || '✕')], { type: 'button', 'aria-label': p.label || 'Acción' });
    /*
      La llamada a la acción es marca pura: su color lo pone el TEMA.

      Venía medio traducido —radio y color de contraste del tema, pero el fondo
      en un degradado azul de Tailwind y el texto en `text-blue-100`—, así que
      cambiar el color de marca de una librería repintaba todo menos este
      bloque, que es justo el que más grita el color. El degradado desaparece
      porque necesita dos colores y el tema define uno.
    */
    case 'cta':
      return el('div', cx('bg-[var(--vz-primario)] rounded-[var(--vz-radio)] p-6 text-[color:var(--vz-primario-contraste)]', cls), [
        el('h3', 'text-lg font-bold', [txt(p.title || '')]),
        el('p', 'text-sm text-[color:var(--vz-primario-contraste)] mt-1', [txt(p.text || '')]),
        el('button', 'mt-4 bg-[var(--vz-superficie)] text-[color:var(--vz-primario)] font-medium px-4 py-2 rounded-[var(--vz-radio)] text-sm', [txt(p.buttonText || 'Acción')], { type: 'button' }),
      ]);

    default:
      // Sin esquema: se marca explícitamente en vez de fingir que exporta bien.
      return el('div', cx('p-2 bg-[var(--vz-superficie-alt)] rounded text-sm text-[color:var(--vz-texto-suave)]', cls), [txt(`Bloque sin esquema: ${t}`)]);
  }
}

/** Contenedores: markup limpio con un `slot` donde van los hijos. */
/**
 * Columnas de una rejilla, que se van plegando al estrechar la pantalla.
 *
 * Una rejilla de tres columnas fijas mete tres tarjetas de ~120 px en un móvil,
 * donde no se lee nada. El componente debe servir en cualquier pantalla sin que
 * haya que acordarse de configurarlo, así que la escala es la que se emite por
 * defecto: una columna en móvil, dos en tablet y las pedidas de ahí para arriba.
 *
 * Se escribe **mobile-first**, como manda Tailwind: la clase sin prefijo es la
 * de la pantalla pequeña y los `sm:`/`md:` la van ampliando.
 */
function responsiveCols(cols: string | undefined): string {
  const n = Math.max(1, Math.min(12, parseInt(cols || '3', 10) || 3));
  if (n === 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2';
  return `grid-cols-1 sm:grid-cols-2 md:grid-cols-${n}`;
}

function buildContainer(block: BuilderBlock, ctx: SchemaCtx): UiNode {
  const p = block.props;
  const t = block.type;
  const tag = CONTAINER_TAGS[t] || 'div';
  let cls = p.className || '';

  if (t === 'grid') cls = cx(`grid ${responsiveCols(p.cols)} gap-${p.gap || 4}`, cls);
  // `flex-wrap` en la fila: sin él, cuatro tarjetas en una pantalla de móvil se
  // comprimen hasta ser ilegibles en lugar de bajar a la línea siguiente.
  if (t === 'flex') {
    cls = p.direction === 'col'
      ? cx(`flex flex-col gap-${p.gap || 4}`, cls)
      : cx(`flex flex-row flex-wrap gap-${p.gap || 4}`, cls);
  }
  if (t === 'table-c') cls = cx('w-full border-collapse', cls);
  if (t === 'th') cls = cx('border border-[color:var(--vz-borde)] px-3 py-2 bg-[var(--vz-superficie-alt)] text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--vz-texto-suave)]', cls);
  if (t === 'td') cls = cx('border border-[color:var(--vz-borde)] px-3 py-2 text-sm align-middle', cls);
  if (t === 'navbar') cls = cx('flex flex-wrap items-center justify-between', cls);
  if (t === 'sidebar') cls = cx('flex flex-col', cls);

  // Collapse con cabecera: la cabecera pliega y despliega el contenido. Sin
  // título no hay dónde pulsar, así que se queda estático como antes.
  if (t === 'collapse' && p.title) {
    const v = implicitVar(block, ctx, 'open', 'boolean', 'true');
    const set = setterName(v.name);
    return el('div', cls, [
      el('button', 'w-full px-4 py-3 font-medium text-sm border-b cursor-pointer flex justify-between text-left', [
        el('span', null, [txt(p.title)]),
        el('span', 'text-[color:var(--vz-texto-suave)]', [
          expr(`${v.name} ? '▾' : '▸'`, '▾', (rt) => (rt.get(v.name) ? '▾' : '▸')),
        ]),
      ], {
        type: 'button',
        'aria-expanded': bind(String(v.name), 'true', (rt) => String(Boolean(rt.get(v.name)))),
        onClick: on(`() => ${set}((a) => !a)`, (rt) => rt.set(v.name, !rt.get(v.name))),
      }),
      // El envoltorio evita JSX adyacente inválido cuando hay varios hijos.
      when(String(v.name), true, [el('div', null, [slot()])], (rt) => Boolean(rt.get(v.name))),
    ]);
  }

  const before: UiNode[] = [];
  if (t === 'fieldset' && p.legend) before.push(el('legend', 'text-sm font-medium px-2', [txt(p.legend)]));
  if (t === 'modal' && p.title) before.push(el('h3', 'text-lg font-semibold mb-4', [txt(p.title)]));
  if (t === 'drawer' && p.title) before.push(el('h3', 'text-lg font-semibold mb-4', [txt(p.title)]));
  if (t === 'navbar') {
    if (p.brand) before.push(el('span', 'font-bold text-sm', [txt(p.brand)]));
    if (p.items && block.children.length === 0) {
      before.push(el('div', 'flex gap-4', csv(p.items).map((x) =>
        el('a', 'text-sm text-[color:var(--vz-texto-suave)] hover:text-[color:var(--vz-texto)]', [txt(x)], { href: '#' }))));
    }
  }
  if (t === 'sidebar' && p.items && block.children.length === 0) {
    before.push(el('div', 'space-y-0.5', csv(p.items).map((x, i) =>
      el('div', cx('px-3 py-2 rounded-[var(--vz-radio)] text-sm', i === 0 ? 'bg-slate-800 text-[color:var(--vz-primario-contraste)]' : 'text-[color:var(--vz-texto-suave)] hover:text-[color:var(--vz-primario-contraste)] hover:bg-slate-800'), [txt(x)]))));
  }

  const attrs: Record<string, string> = {};
  if (t === 'modal') { attrs.role = 'dialog'; attrs['aria-modal'] = 'true'; }
  if (t === 'navbar' || t === 'nav-html') attrs['aria-label'] = p.ariaLabel || 'Navegación';

  return el(tag, cls, [...before, slot()], attrs);
}
