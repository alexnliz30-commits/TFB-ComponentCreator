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
import type { StateVar } from './actions';
import { setterName, stateDeclarations } from './actions';
import { buildNode, collectImplicitVars } from './schema';
import { VOID_TAGS, type Attr, type UiNode } from './ui-node';

export interface EmitInput {
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  vars: StateVar[];
}

export interface CodeEmitter {
  key: string;
  label: string;
  /** Extensión del fichero exportado. */
  extension: string;
  /** Sintaxis para el resaltado y para el harness de compilación. */
  language: 'tsx' | 'jsx' | 'vue' | 'ts';
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

export const reactEmitter: CodeEmitter = {
  key: 'react',
  label: 'React + TypeScript',
  extension: 'tsx',
  language: 'tsx',
  verifiable: true,
  emit(input) {
    if (input.rootIds.length === 0) return EMPTY_COMPONENT;

    const { constants, handlers, body, usedVars, implicitVars, readVars } = emitComponentParts(input);
    // Las implícitas las lee siempre el widget que las declara.
    const read = new Set([...readVars, ...implicitVars.map((v) => v.name)]);
    const declarations = stateDeclarations([...usedVars, ...implicitVars], read);

    const head = [...declarations, ...handlers].map((line) => `  ${line}`).join('\n');
    const preamble = constants.length > 0 ? constants.join('\n\n') + '\n\n' : '';

    return `${preamble}export function App() {\n${head ? head + '\n\n' : ''}  return (\n    <div className="${ROOT_LAYOUT}">\n${body}\n    </div>\n  );\n}`;
  },
};

/**
 * Emite las piezas del componente a partir de la IR.
 *
 * El cuerpo sale indentado tres niveles (seis espacios), que es donde queda
 * dentro del contenedor raíz de cualquiera de los dos artefactos.
 */
export function emitComponentParts(input: EmitInput): ComponentParts {
  const { blocks, rootIds, vars } = input;
  const { usedVars, readVars } = usedStateVars(blocks, rootIds, vars);
  const implicitVars = collectImplicitVars(blocks, rootIds, vars);

  const ctx: EmitCtx = {
    blocks,
    vars,
    constants: [],
    handlers: [],
    // Los nombres del usuario mandan: lo extraído se desambigua contra ellos.
    taken: new Set([...vars, ...implicitVars].flatMap((v) => [v.name, setterName(v.name)])),
  };

  const body = rootIds
    .map((id) => {
      const block = blocks[id];
      return block ? emitNode(buildNode(block, { vars }), ctx, 3, block.children) : '';
    })
    .filter(Boolean)
    .join('\n');

  return { constants: ctx.constants, handlers: ctx.handlers, body, usedVars, implicitVars, readVars };
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
function usedStateVars(
  blocks: Record<string, BuilderBlock>,
  rootIds: string[],
  vars: StateVar[],
): { usedVars: StateVar[]; readVars: ReadonlySet<string> } {
  if (vars.length === 0) return { usedVars: [], readVars: new Set() };

  const fragments: string[] = [];
  const ctx = { vars };
  const collect = (id: string) => {
    const block = blocks[id];
    if (!block) return;
    walkNode(buildNode(block, ctx), (node) => {
      if (node.kind === 'expr') fragments.push(node.code);
      if (node.kind === 'when') fragments.push(node.test);
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

const HANDLER_NAMES: Record<string, string> = {
  onClick: 'manejarClic',
  onChange: 'manejarCambio',
  onSubmit: 'manejarEnvio',
  onInput: 'manejarEntrada',
};

/**
 * Saca del JSX un manejador con cuerpo de bloque.
 *
 * Solo los de varias sentencias: `onClick={() => setAbierto(!abierto)}` se lee
 * perfectamente en línea y sacarlo a una constante numerada sería peor.
 */
function handlerExpression(name: string, code: string, ctx: EmitCtx): string {
  if (!code.includes('=> {')) return code;

  const varName = reserveName(HANDLER_NAMES[name] ?? 'manejarEvento', ctx.taken, '');
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
  ul: 'ELEMENTOS',
  ol: 'ELEMENTOS',
  select: 'OPCIONES',
  optgroup: 'OPCIONES',
  tbody: 'FILAS',
  thead: 'CABECERAS',
  table: 'FILAS',
  tr: 'CELDAS',
  dl: 'DEFINICIONES',
  nav: 'ENLACES',
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

  const name = reserveName(LIST_NAMES[parentTag] ?? 'ELEMENTOS', ctx.taken, '_');
  const single = columns === 1;
  const param = single ? 'elemento' : 'fila';

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

    case 'expr':
      return `${pad}{${node.code}}`;

    case 'slot':
      return childIds
        .map((id) => {
          const child = ctx.blocks[id];
          return child
            ? emitNode(buildNode(child, { vars: ctx.vars }), ctx, level, child.children)
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
