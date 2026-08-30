/**
 * Emisor de React + TypeScript a partir de la IR.
 *
 * Produce exactamente la forma que espera el resto del sistema —`export
 * function App()` sin props, hooks como globales, sin imports— para que el
 * código generado por el lienzo sea indistinguible del generado por la IA y
 * pase igual por `TsxCompilationChecker` y por el sandbox Babel.
 *
 * Calidad del código emitido
 * --------------------------
 * El resultado es código que una persona va a leer y mantener, así que no basta
 * con que compile. Dos transformaciones lo mantienen limpio:
 *
 *   - **DRY**: una lista de N elementos con la misma estructura no se emite como
 *     N nodos repetidos, sino como una constante de datos y un `.map()`. Cambiar
 *     una fila de la tabla pasa a ser editar un dato, no editar marcado.
 *   - **SRP / legibilidad**: los manejadores con varias sentencias salen del JSX
 *     a una función con nombre. Los de una sola sentencia se quedan en línea, que
 *     es la forma idiomática en React y no gana nada al extraerse (KISS).
 *
 * Ambas transformaciones son conservadoras: solo se aplican cuando el subárbol es
 * puramente estático. En cuanto aparece estado, un evento o un hueco de hijos, se
 * emite tal cual, porque extraerlo cambiaría el comportamiento.
 */

import type { BuilderBlock } from './types';
import type { CallbackProp, StateVar } from './actions';
import { setterName, stateDeclarations } from './actions';
import {
  ITEM_PARAM, hasModel, mockRowsLiteral, modelTypeName, type DataModel,
} from './data-model';
import { ITEMS_PROP, buildNode, collectImplicitVars, usesRepeater, type SchemaCtx } from './schema';
import { VOID_TAGS, type Attr, type UiNode } from './ui-node';
import { type Lang } from './lang';

export interface EmitInput {
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  vars: StateVar[];
  /** Contrato de datos; ausente = el componente no recibe colección. */
  model?: DataModel;
  /** Props de función; ausente = el componente no avisa a nadie. */
  callbacks?: CallbackProp[];
  /** Lenguaje del código emitido; ausente = TypeScript, que es el histórico. */
  lang?: Lang;
  /**
   * Nombre del componente, cuando el destino lo necesita.
   *
   * React emite `App()` por contrato del harness y un SFC de Vue es anónimo, así
   * que hasta Angular ningún emisor lo miraba. Una clase de Angular sí se llama
   * de algo, y ese algo tiene que ser el nombre que el usuario le puso.
   */
  name?: string;
}

/**
 * Props de función que un texto emitido llega a llamar.
 *
 * Se filtra por uso real y no por declaración porque `noUnusedLocals` no
 * distingue: una prop declarada y nunca llamada tumba la compilación del
 * artefacto de verificación. En el paquete, en cambio, el contrato lista TODAS
 * las declaradas, porque allí una prop sin usar es una promesa, no un error.
 */
export function usedCallbacks(
  callbacks: CallbackProp[] | undefined,
  text: string,
): CallbackProp[] {
  return (callbacks ?? []).filter((c) => new RegExp(`\\b${c.name}\\b`).test(text));
}

/**
 * Firma de una prop de función.
 *
 * `itemType` es el nombre del tipo del elemento, o `null` si el componente no
 * repite nada. Sin repetidor la firma pierde el parámetro **aunque la prop lo
 * declare**, porque es exactamente lo que hace la llamada emitida: prometer un
 * argumento que nunca se pasa sería un contrato que miente, y quien lo integre
 * escribiría un manejador esperando un dato que no le va a llegar.
 */
export function callbackSignature(cb: CallbackProp, itemType: string | null): string {
  return cb.passesItem && itemType ? `(${ITEM_PARAM}: ${itemType}) => void` : '() => void';
}

/** Tipo del elemento del modelo si el árbol lo repite; `null` si no. */
export function itemTypeOf(input: EmitInput): string | null {
  return hasModel(input.model) && usesRepeater(input.blocks, input.rootIds)
    ? modelTypeName(input.model)
    : null;
}

export interface CodeEmitter {
  key: string;
  label: string;
  /** Extensión del fichero exportado. */
  extension: string;
  /** Sintaxis para el resaltado y para el harness de compilación. */
  language: 'tsx' | 'jsx' | 'vue' | 'ts';
  /**
   * Lenguaje del código que produce.
   *
   * Va aquí, y no solo dentro del emisor, porque fuera hay decisiones que
   * dependen de él y no del framework: qué extensión lleva cada fichero del
   * paquete, qué idioma declara la librería donde se publica, y qué le dice el
   * asistente al usuario sobre lo que está construyendo.
   */
  lang: Lang;
  /**
   * Nombre del framework tal y como lo declara el catálogo.
   *
   * No se deduce de `key` porque `key` distingue lenguaje y versión
   * (`angular22`, `react-js`) mientras que el catálogo agrupa por familia: una
   * librería es «de Angular», y su versión es un detalle del código que guarda.
   */
  frameworkName: 'React' | 'Vue2' | 'Vue3' | 'Angular';
  /** `true` si el resultado se puede verificar estáticamente y previsualizar. */
  verifiable: boolean;
  emit(input: EmitInput): string;
}

/**
 * Piezas del componente, antes de envolverlas en una firma concreta.
 *
 * Existe para que los dos artefactos —el `App()` de verificación y el paquete
 * con nombre propio de `emit-package`— compongan lo mismo. Antes el paquete
 * recortaba el JSX del `App()` ya montado con una búsqueda de texto; con las
 * constantes extraídas ese recorte habría perdido los datos.
 */
export interface ComponentParts {
  /**
   * Funciones puras extraídas del árbol: hoy, los validadores de campo.
   *
   * Van aparte de `constants` porque no son lo mismo ni cambian por lo mismo.
   * Un validador es LÓGICA —se prueba sola, sin montar el componente— y una
   * constante es DATO. Mezcladas en un solo fichero, quien recibe el paquete
   * abre `constants.ts` para tocar los datos de ejemplo y se encuentra dentro
   * las reglas de validación; el artefacto de un fichero las sigue juntando en
   * su preámbulo, porque allí no hay ficheros que separar.
   */
  helpers: string[];
  /** Constantes de datos, a nivel de módulo (fuera del componente). */
  constants: string[];
  /** Manejadores con nombre, dentro del componente y antes del `return`. */
  handlers: string[];
  /** JSX del cuerpo, indentado para ir dentro del contenedor raíz. */
  body: string;
  /** Variables de estado que el árbol usa de verdad (las lee o las escribe). */
  usedVars: StateVar[];
  /** Estado propio de los widgets interactivos sin `bindTo`. */
  implicitVars: StateVar[];
  /** De las anteriores, aquellas cuyo valor se lee en algún sitio. */
  readVars: ReadonlySet<string>;
}

/** Contexto de una emisión: entrada, y lo que se va extrayendo por el camino. */
interface EmitCtx {
  blocks: Record<string, BuilderBlock>;
  vars: StateVar[];
  /** Contexto que reciben todas las llamadas a `buildNode` de esta emisión. */
  schema: SchemaCtx;
  constants: string[];
  handlers: string[];
  /** Identificadores ya ocupados, para no pisar los del usuario. */
  taken: Set<string>;
}

const EMPTY_COMPONENT =
  'export function App() {\n  return <div className="p-4 text-slate-400">Vacío</div>;\n}';

/** Contenedor raíz del componente, compartido por los dos artefactos. */
/**
 * `relative` va siempre: es el ancla de los bloques en posición libre que
 * cuelgan directamente de la raíz. Sin desplazamientos no produce ningún efecto
 * visible, así que no cambia nada para los componentes que no la usan.
 */
export const ROOT_LAYOUT = 'relative p-4 space-y-4';

/**
 * Emisor de React, parametrizado por lenguaje.
 *
 * Los dos registros —TSX y JSX— son el MISMO emisor con otra `lang`, y no dos
 * implementaciones: el árbol, el marcado, los manejadores y los datos salen del
 * mismo recorrido. Lo único que cambia son las anotaciones, y de eso ya se
 * ocupa `lang.ts`. Duplicar el emisor habría sido la forma segura de que las
 * dos versiones se desincronizaran, que es exactamente el error del que nació
 * la IR única.
 */
function emisorReact(lang: Lang): CodeEmitter {
  return {
    key: lang === 'ts' ? 'react' : 'react-js',
    label: lang === 'ts' ? 'React + TypeScript' : 'React + JavaScript',
    extension: lang === 'ts' ? 'tsx' : 'jsx',
    language: lang === 'ts' ? 'tsx' : 'jsx',
    lang,
    frameworkName: 'React',
    // El JSX se comprueba igual que el TSX: el harness lo parsea, y el sandbox
    // lo transpila con el mismo Babel. Un JSX es además estrictamente más fácil
    // de tragar que un TSX, así que no hay razón para degradarlo.
    verifiable: true,
    emit: (input) => emitApp({ ...input, lang }),
  };
}

export const reactEmitter = emisorReact('ts');
export const reactJsEmitter = emisorReact('js');

function emitApp(input: EmitInput): string {
  const lang = input.lang ?? 'ts';
  {
    if (input.rootIds.length === 0) return EMPTY_COMPONENT;

    const { helpers, constants: datos, handlers, body, usedVars, implicitVars, readVars } = emitComponentParts(input);
    /*
      En el artefacto de un fichero los validadores y las constantes de datos
      comparten preámbulo: no hay ficheros donde repartirlos, y el orden importa
      —los manejadores llaman a los validadores— así que van delante.
    */
    const constants = [...helpers, ...datos];
    // Las implícitas las lee siempre el widget que las declara.
    const read = new Set([...readVars, ...implicitVars.map((v) => v.name)]);
    const declarations = stateDeclarations([...usedVars, ...implicitVars], read);

    /*
      La colección, en el artefacto de VERIFICACIÓN, sale de los datos de ejemplo.

      `App()` no tiene props por contrato —lo exigen el sandbox y el harness—, así
      que un repetidor referenciaría un `items` inexistente y el componente no
      compilaría. Declararlo aquí con los mock no es un apaño: es exactamente lo
      que el paquete pone como valor por defecto de la prop, de modo que los dos
      artefactos enseñan lo mismo cuando nadie ha enganchado datos todavía.
    */
    const repite = itemTypeOf(input) !== null;
    // Una línea por fila: `head` sangra línea a línea, así que un literal
    // multilínea metido de una pieza solo sangraría la primera y el resto
    // quedaría pegado al margen.
    const coleccion = repite
      ? `const ${ITEMS_PROP} = ${mockRowsLiteral(input.model!)};`.split('\n')
      : [];

    /*
      Las props de función, en el artefacto de VERIFICACIÓN, se declaran vacías.

      Por el mismo motivo que la colección: `App()` no tiene props, así que
      `onSelect?.(item)` nombraría algo inexistente y el componente no
      compilaría. Declararlas a `undefined` no es un apaño ni un simulacro: es
      literalmente lo que hace el componente entregado cuando quien lo integra no
      pasa la prop, que es el caso por defecto. El artefacto enseña así el mismo
      comportamiento que el paquete —el botón se pulsa y no pasa nada— en lugar
      de inventarse un efecto que el componente real no tiene.
    */
    const llamadas = usedCallbacks(input.callbacks, `${body}\n${handlers.join('\n')}`);
    // El tipo del elemento no existe en este artefacto —no se declara ninguna
    // interfaz— así que se tipa estructuralmente contra los propios datos de
    // ejemplo. Es el mismo tipo que tendrá la colección real por contrato.
    /*
      El tipo va en una aserción y no en una anotación, y no es cosmético.

      Con `const onX: T | undefined = undefined`, el análisis de flujo de
      TypeScript estrecha la constante a `undefined` —es un `const`, nunca va a
      cambiar— y entonces `onX?.(item)` falla con «Type 'never' has no call
      signatures»: el componente no compilaba. Con la aserción, el tipo del
      inicializador ES la unión, así que no hay nada que estrechar.
    */
    const props = llamadas.map((c) => {
      // En JavaScript no hay tipo que declarar y `undefined` basta: la llamada
      // ya va encadenada con `?.`, así que el comportamiento es idéntico.
      if (lang === 'js') return `const ${c.name} = undefined;`;
      const firma = `(${callbackSignature(c, repite ? `typeof ${ITEMS_PROP}[number]` : null)}) | undefined`;
      return `const ${c.name} = undefined as ${firma};`;
    });

    const head = [...coleccion, ...props, ...declarations, ...handlers]
      .map((line) => `  ${line}`).join('\n');
    const preamble = constants.length > 0 ? constants.join('\n\n') + '\n\n' : '';

    return `${preamble}export function App() {\n${head ? head + '\n\n' : ''}  return (\n    <div className="${ROOT_LAYOUT}">\n${body}\n    </div>\n  );\n}`;
  }
}

/**
 * `const validar = (v: string): string => { … };` → método con ese nombre.
 *
 * Vive aquí, con lo demás que comparten los emisores, porque los dos destinos
 * de objeto —la clase de Angular y las `methods` de Vue 2— necesitan la misma
 * conversión y por el mismo motivo: en los dos, la plantilla solo ve lo que
 * cuelga de la instancia, así que un validador declarado como constante de
 * módulo compila y luego no existe al renderizar.
 *
 * Si el texto no tiene la forma esperada se devuelve tal cual: es preferible
 * emitir el original a emitir un método a medio convertir.
 */
export function arrowAMetodo(helper: string): string {
  const m = /^const\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>\s*([\s\S]*);?$/.exec(helper.trim());
  if (!m) return helper;
  const [, nombre, params, retorno, cuerpo] = m;
  const limpio = cuerpo.trim().replace(/;$/, '');
  const bloque = limpio.startsWith('{') ? limpio : `{\n  return ${limpio};\n}`;
  return `${nombre}(${params})${retorno ? `: ${retorno.trim()}` : ''} ${bloque}`;
}

/**
 * Emite las piezas del componente a partir de la IR.
 *
 * El cuerpo sale indentado tres niveles (seis espacios), que es donde queda
 * dentro del contenedor raíz de cualquiera de los dos artefactos.
 */
export function emitComponentParts(input: EmitInput): ComponentParts {
  const { blocks, rootIds, vars } = input;
  const { usedVars, readVars } = analyzeStateUsage(blocks, rootIds, vars, input.model, input.callbacks);
  const implicitVars = collectImplicitVars(blocks, rootIds, vars);

  // Los validadores de campo se recogen una sola vez por nombre: dos campos
  // enlazados a la misma variable comparten validador, y el envío del
  // formulario vuelve a derivarlos al recorrer a sus descendientes.
  const helpers = new Map<string, string>();
  const schema: SchemaCtx = {
    vars,
    blocks,
    model: input.model,
    callbacks: input.callbacks,
    lang: input.lang,
    collectHelper: (name, code) => {
      if (!helpers.has(name)) helpers.set(name, code);
    },
  };

  const ctx: EmitCtx = {
    blocks,
    vars,
    schema,
    constants: [],
    handlers: [],
    // Los nombres del usuario mandan: lo extraído se desambigua contra ellos.
    taken: new Set([...vars, ...implicitVars].flatMap((v) => [v.name, setterName(v.name)])),
  };

  const body = rootIds
    .map((id) => {
      const block = blocks[id];
      return block ? emitNode(buildNode(block, schema), ctx, 3, block.children) : '';
    })
    .filter(Boolean)
    .join('\n');

  // Las listas de clases repetidas se izan sobre el cuerpo ya emitido: son
  // constantes de datos igual que los mock, y salen con ellas.
  const clases = hoistRepeatedClasses(body, ctx.taken);

  return {
    helpers: [...helpers.values()],
    constants: [...ctx.constants, ...clases.constants],
    handlers: ctx.handlers,
    body: clases.body,
    usedVars,
    implicitVars,
    readVars,
  };
}

/** Nombre de la constante de clases según la etiqueta que las lleva. */
const CLASS_NAMES: Record<string, string> = {
  button: 'BUTTON_CLASSES',
  input: 'FIELD_CLASSES',
  textarea: 'FIELD_CLASSES',
  select: 'FIELD_CLASSES',
  label: 'LABEL_CLASSES',
  li: 'ITEM_CLASSES',
  td: 'CELL_CLASSES',
  th: 'HEADER_CLASSES',
  a: 'LINK_CLASSES',
  span: 'TEXT_CLASSES',
  p: 'TEXT_CLASSES',
};

/** A partir de cuántos caracteres compensa dar nombre a una lista de clases. */
const CLASE_LARGA = 40;

/**
 * Iza a constantes las listas de clases repetidas (DRY).
 *
 * Cuatro tarjetas de estadística iguales emitían cuatro veces la misma cadena de
 * ciento y pico caracteres: el código salía correcto pero ilegible, y cambiar el
 * estilo de «la tarjeta» obligaba a editar cuatro sitios sin garantía de no
 * dejarse uno. Medido sobre el kit de ejemplo: 23 repeticiones en 7 componentes.
 *
 * Es un paso de texto sobre el cuerpo ya emitido, y no una fase del recorrido
 * del árbol, por dos razones: no toca la traducción de los 85 bloques —que es
 * donde un error se paga caro— y beneficia por igual a los dos artefactos, que
 * comparten este cuerpo.
 *
 * Solo se izan las cadenas literales. Un `className` con interpolación depende
 * del estado y no es la misma clase en cada render, así que darle nombre único
 * sería mentir sobre lo que hace.
 */
function hoistRepeatedClasses(
  body: string,
  taken: Set<string>,
): { body: string; constants: string[] } {
  const conEtiqueta = /<([a-zA-Z][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)className="([^"]+)"/g;

  const veces = new Map<string, { n: number; tag: string }>();
  for (const [, tag, , clases] of body.matchAll(conEtiqueta)) {
    if (clases.length < CLASE_LARGA) continue;
    const previo = veces.get(clases);
    if (previo) previo.n += 1;
    else veces.set(clases, { n: 1, tag });
  }

  const constants: string[] = [];
  let salida = body;
  for (const [clases, { n, tag }] of veces) {
    if (n < 2) continue;
    const nombre = reserveName(CLASS_NAMES[tag] ?? 'CLASSES', taken, '_');
    constants.push(`const ${nombre} =\n  ${JSON.stringify(clases)};`);
    // Se sustituye el atributo entero para no tocar una coincidencia parcial
    // dentro de otra cadena más larga que empiece igual.
    salida = salida.split(`className="${clases}"`).join(`className={${nombre}}`);
  }

  return { body: salida, constants };
}

/**
 * Variables realmente referenciadas por el árbol.
 *
 * Declarar una variable sin usarla haría fallar `tsc` con `noUnusedLocals`, así
 * que se filtran comparando contra el código emitido de atributos y expresiones.
 *
 * Se busca tanto la variable como su setter: un botón que solo escribe («fijar
 * `enviado` a true») emite `setEnviado(true)` y nunca menciona `enviado`. Mirando
 * solo el nombre, la declaración `useState` se omitía y el componente no
 * compilaba —`Cannot find name 'setEnviado'`—, justo el caso de los componentes
 * con comportamiento.
 */
export function analyzeStateUsage(
  blocks: Record<string, BuilderBlock>,
  rootIds: string[],
  vars: StateVar[],
  /** Mismo modelo que la emisión: sin él, un árbol con repetidor se analiza
   *  como si no lo tuviera y el estado usado dentro de la lista se pierde. */
  model?: DataModel,
  /** Por el mismo motivo: un evento cuya única acción es avisar a la app se
   *  descarta entero sin ellas, y con él las demás acciones de ese evento. */
  callbacks?: CallbackProp[],
): { usedVars: StateVar[]; readVars: ReadonlySet<string> } {
  if (vars.length === 0) return { usedVars: [], readVars: new Set() };

  const fragments: string[] = [];
  const ctx: SchemaCtx = { vars, blocks, model, callbacks };
  const collect = (id: string) => {
    const block = blocks[id];
    if (!block) return;
    walkNode(buildNode(block, ctx), (node) => {
      if (node.kind === 'expr') fragments.push(node.code);
      if (node.kind === 'when') fragments.push(node.test);
      // La expresión de la colección referencia estado cuando el repetidor
      // pagina (`items.slice(pagina * 5, …)`). Sin contarla, esa variable no se
      // declaraba y el componente no compilaba por un nombre inexistente.
      if (node.kind === 'list') fragments.push(node.code);
      if (node.kind === 'el') {
        for (const attr of Object.values(node.attrs)) {
          if (attr.kind === 'expr') fragments.push(attr.code);
          if (attr.kind === 'event') fragments.push(attr.code);
        }
      }
    });
    for (const childId of block.children) collect(childId);
  };
  rootIds.forEach(collect);

  const haystack = fragments.join('\n');
  const readVars = new Set<string>();
  const usedVars: StateVar[] = [];

  for (const v of vars) {
    const isRead = new RegExp(`\\b${v.name}\\b`).test(haystack);
    const isWritten = new RegExp(`\\b${setterName(v.name)}\\b`).test(haystack);
    if (isRead) readVars.add(v.name);
    if (isRead || isWritten) usedVars.push(v);
  }

  return { usedVars, readVars };
}

function walkNode(node: UiNode, visit: (n: UiNode) => void): void {
  visit(node);
  if (node.kind === 'el' || node.kind === 'when') {
    for (const child of node.children) walkNode(child, visit);
  }
  // La plantilla de un repetidor también cuenta: el estado que solo se use
  // dentro de una lista quedaría sin declarar y el componente no compilaría.
  if (node.kind === 'list') walkNode(node.item, visit);
}

const indent = (level: number) => '  '.repeat(level);

/**
 * Texto seguro dentro de JSX. Las llaves y los ángulos se interpretarían como
 * sintaxis, así que ese texto se emite como literal de cadena.
 */
function jsxText(value: string): string {
  if (/[{}<>]/.test(value)) return `{${JSON.stringify(value)}}`;
  return value;
}

/** Reserva un identificador libre a partir de `base` (`FILAS`, `FILAS_2`, …). */
function reserveName(base: string, taken: Set<string>, separator: string): string {
  let name = base;
  let n = 2;
  while (taken.has(name)) name = `${base}${separator}${n++}`;
  taken.add(name);
  return name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejadores con nombre
// ─────────────────────────────────────────────────────────────────────────────

/*
  Los identificadores del código emitido van en INGLÉS.

  El contenido del componente —textos, etiquetas, mensajes— es del diseño y se
  queda tal como se escribió; lo que se traduce es lo que lee quien mantiene el
  código. Un paquete que se publica o se integra en otro proyecto acaba junto a
  código de terceros, y `manejarClic` obliga a todo el que lo abra a cambiar de
  idioma a mitad de fichero.
*/
const HANDLER_NAMES: Record<string, string> = {
  onClick: 'handleClick',
  onChange: 'handleChange',
  onSubmit: 'handleSubmit',
  onInput: 'handleInput',
  onBlur: 'handleBlur',
  onFocus: 'handleFocus',
  onMouseEnter: 'handleMouseEnter',
  onMouseLeave: 'handleMouseLeave',
  onDoubleClick: 'handleDoubleClick',
};

/**
 * Saca del JSX un manejador con cuerpo de bloque.
 *
 * Solo los de varias sentencias: `onClick={() => setAbierto(!abierto)}` se lee
 * perfectamente en línea y sacarlo a una constante numerada sería peor.
 */
function handlerExpression(name: string, code: string, ctx: EmitCtx): string {
  if (!code.includes('=> {')) return code;

  const varName = reserveName(HANDLER_NAMES[name] ?? 'handleEvent', ctx.taken, '');
  ctx.handlers.push(`const ${varName} = ${code};`);
  return varName;
}

function emitAttr(name: string, attr: Attr, ctx: EmitCtx): string {
  switch (attr.kind) {
    case 'static':
      // Comillas dentro del valor: se pasa a expresión para no romper el atributo.
      return attr.value.includes('"')
        ? ` ${name}={${JSON.stringify(attr.value)}}`
        : ` ${name}="${attr.value}"`;
    case 'expr':
      return ` ${name}={${attr.code}}`;
    case 'event':
      return ` ${name}={${handlerExpression(name, attr.code, ctx)}}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de listas repetidas
// ─────────────────────────────────────────────────────────────────────────────

/** Mínimo de elementos iguales para que compense extraer los datos. */
const MIN_REPEATED = 3;

/** Nombre de la constante según el contenedor de la lista. */
const LIST_NAMES: Record<string, string> = {
  ul: 'ITEMS',
  ol: 'ITEMS',
  select: 'OPTIONS',
  optgroup: 'OPTIONS',
  tbody: 'ROWS',
  thead: 'HEADERS',
  table: 'ROWS',
  tr: 'CELLS',
  dl: 'DEFINITIONS',
  nav: 'LINKS',
};

/**
 * Huella estructural del nodo, ignorando el contenido de los textos.
 *
 * Dos nodos con la misma huella difieren únicamente en datos, así que se pueden
 * plegar en un `.map()`. Devuelve `null` cuando el subárbol no es extraíble: si
 * lleva estado (`expr`, `when`), un evento o un hueco de hijos (`slot`), el nodo
 * no es un dato repetido sino comportamiento, y plegarlo lo rompería.
 */
function structuralKey(node: UiNode): string | null {
  switch (node.kind) {
    case 'text':
      return '#';
    case 'expr':
    case 'slot':
    case 'when':
    // Una lista depende de datos vivos: plegarla como si fuera markup repetido
    // congelaría en el código lo que debe venir de fuera.
    case 'list':
      return null;
    case 'el': {
      const attrs: string[] = [];
      for (const [name, attr] of Object.entries(node.attrs)) {
        if (attr.kind !== 'static') return null;
        attrs.push(`${name}=${attr.value}`);
      }
      const children: string[] = [];
      for (const child of node.children) {
        const key = structuralKey(child);
        if (key === null) return null;
        children.push(key);
      }
      return `${node.tag}[${attrs.sort().join('|')}](${children.join(',')})`;
    }
  }
}

/** Textos del subárbol, en orden de aparición. */
function collectTexts(node: UiNode, out: string[] = []): string[] {
  if (node.kind === 'text') out.push(node.value);
  else if (node.kind === 'el') node.children.forEach((c) => collectTexts(c, out));
  return out;
}

/**
 * Emite el nodo modelo de un `.map()`, sustituyendo cada texto por la referencia
 * al dato correspondiente e inyectando la `key` en el elemento raíz.
 */
function emitTemplate(
  node: UiNode,
  level: number,
  dataRef: (position: number) => string,
  counter: { next: number },
  keyExpression: string | null,
): string {
  const pad = indent(level);

  if (node.kind === 'text') return `${pad}{${dataRef(counter.next++)}}`;
  if (node.kind !== 'el') return '';

  const attrs = Object.entries(node.attrs)
    .map(([name, attr]) => (attr.kind === 'static'
      ? (attr.value.includes('"') ? ` ${name}={${JSON.stringify(attr.value)}}` : ` ${name}="${attr.value}"`)
      : ''))
    .join('');
  const key = keyExpression ? ` key={${keyExpression}}` : '';

  const children = node.children
    .map((c) => emitTemplate(c, level + 1, dataRef, counter, null))
    .filter(Boolean);

  if (children.length === 0 || VOID_TAGS.has(node.tag)) {
    return `${pad}<${node.tag}${key}${attrs} />`;
  }
  if (children.length === 1 && node.children[0].kind === 'text') {
    return `${pad}<${node.tag}${key}${attrs}>${children[0].trimStart()}</${node.tag}>`;
  }
  return `${pad}<${node.tag}${key}${attrs}>\n${children.join('\n')}\n${pad}</${node.tag}>`;
}

/**
 * Intenta plegar `group` (nodos hermanos con la misma huella) en una constante
 * de datos más un `.map()`. Devuelve `null` si no compensa o no es posible.
 */
function foldRepeated(
  group: UiNode[],
  parentTag: string,
  ctx: EmitCtx,
  level: number,
): string | null {
  // Solo elementos: un `.map()` de textos sueltos no admite `key` y React
  // avisaría en consola, además de no aportar legibilidad.
  if (group.length < MIN_REPEATED || group[0].kind !== 'el') return null;

  const rows = group.map((node) => collectTexts(node));
  const columns = rows[0].length;
  // Sin datos no hay nada que extraer; con un número desigual de textos los
  // elementos no son la misma plantilla y plegarlos perdería contenido.
  if (columns === 0 || rows.some((r) => r.length !== columns)) return null;

  const name = reserveName(LIST_NAMES[parentTag] ?? 'ITEMS', ctx.taken, '_');
  const single = columns === 1;
  const param = single ? 'item' : 'row';

  const literal = single
    ? `[${rows.map((r) => JSON.stringify(r[0])).join(', ')}]`
    : `[\n${rows.map((r) => `  [${r.map((c) => JSON.stringify(c)).join(', ')}]`).join(',\n')},\n]`;

  ctx.constants.push(`const ${name} = ${literal};`);

  const pad = indent(level);
  const dataRef = (position: number) => (single ? param : `${param}[${position}]`);
  const template = emitTemplate(group[0], level + 1, dataRef, { next: 0 }, 'indice');

  return `${pad}{${name}.map((${param}, indice) => (\n${template}\n${pad}))}`;
}

/**
 * Emite una lista de hijos, plegando por el camino las tandas de nodos iguales.
 *
 * Los nodos no extraíbles (los que llevan estado, eventos o huecos) cortan la
 * tanda: quedan emitidos uno a uno, en su sitio y con su comportamiento intacto.
 */
function emitChildren(
  nodes: UiNode[],
  ctx: EmitCtx,
  level: number,
  childIds: string[],
  parentTag: string,
): string[] {
  const out: string[] = [];
  let run: UiNode[] = [];
  let runKey: string | null = null;

  const flush = () => {
    if (run.length === 0) return;
    const folded = runKey !== null ? foldRepeated(run, parentTag, ctx, level) : null;
    if (folded) out.push(folded);
    else out.push(...run.map((n) => emitNode(n, ctx, level, childIds)).filter(Boolean));
    run = [];
    runKey = null;
  };

  for (const node of nodes) {
    const key = structuralKey(node);
    if (key !== null && key === runKey) {
      run.push(node);
      continue;
    }
    flush();
    if (key !== null) {
      run = [node];
      runKey = key;
    } else {
      const emitted = emitNode(node, ctx, level, childIds);
      if (emitted) out.push(emitted);
    }
  }
  flush();

  return out;
}

function emitNode(
  node: UiNode,
  ctx: EmitCtx,
  level: number,
  /** Hijos del bloque en curso, para resolver el `slot`. */
  childIds: string[] = [],
): string {
  const pad = indent(level);

  switch (node.kind) {
    case 'text':
      return node.value ? `${pad}${jsxText(node.value)}` : '';

    /*
      Repetición sobre datos que llegan en tiempo de ejecución.

      La `key` sale del campo `id` del modelo cuando el modelo lo declara, y del
      índice cuando no. Inventarse `item.id` siempre produciría código roto en
      cuanto la lista no lo traiga; usar siempre el índice desperdicia la
      identidad cuando SÍ la hay, y con el índice React reutiliza el nodo
      equivocado al reordenar o borrar una fila —el texto de un input se queda en
      la fila de al lado—. Se elige en la IR, así que los tres destinos toman la
      misma decisión.
    */
    case 'list': {
      const claveCodigo = node.keyField ? `${node.param}.${node.keyField}` : 'index';
      // La `key` se inyecta en la plantilla, no se envuelve en un fragmento: un
      // `<div>` de más rompería una fila de tabla o un hijo de rejilla.
      const conKey: UiNode = node.item.kind === 'el'
        ? { ...node.item, attrs: { ...node.item.attrs, key: { kind: 'expr', code: claveCodigo, preview: '0' } } }
        : node.item;
      const inner = emitNode(conKey, ctx, level + 2, childIds);
      // El parámetro del índice solo se declara si la clave lo usa: el harness
      // compila con `noUnusedParameters`, así que declararlo «por si acaso»
      // tumbaba la compilación en cuanto el modelo traía su `id`.
      const params = node.keyField ? node.param : `${node.param}, index`;
      return `${pad}{${node.code}.map((${params}) => (
${inner}
${indent(level + 1)}))}`;
    }

    case 'expr':
      return `${pad}{${node.code}}`;

    case 'slot':
      return childIds
        .map((id) => {
          const child = ctx.blocks[id];
          return child
            ? emitNode(buildNode(child, ctx.schema), ctx, level, child.children)
            : '';
        })
        .filter(Boolean)
        .join('\n');

    case 'when': {
      const inner = node.children
        .map((c) => emitNode(c, ctx, level + 1, childIds))
        .filter(Boolean)
        .join('\n');
      if (!inner) return '';
      return `${pad}{${node.test} && (\n${inner}\n${pad})}`;
    }

    case 'el': {
      const attrs = Object.entries(node.attrs)
        .map(([name, attr]) => emitAttr(name, attr, ctx))
        .join('');

      const children = emitChildren(node.children, ctx, level + 1, childIds, node.tag);

      if (children.length === 0 || VOID_TAGS.has(node.tag)) {
        // Void o vacío: autocerrado. Un void con hijos sería inválido.
        return `${pad}<${node.tag}${attrs} />`;
      }

      // Contenido corto en una sola línea: más legible al exportar.
      const singleLine =
        children.length === 1 &&
        (node.children[0].kind === 'text' || node.children[0].kind === 'expr');

      if (singleLine) {
        return `${pad}<${node.tag}${attrs}>${children[0].trimStart()}</${node.tag}>`;
      }

      return `${pad}<${node.tag}${attrs}>\n${children.join('\n')}\n${pad}</${node.tag}>`;
    }
  }
}
