/**
 * Emisor de React + TypeScript a partir de la IR.
 *
 * Produce exactamente la forma que espera el resto del sistema —`export
 * function App()` sin props, hooks como globales, sin imports— para que el
 * código generado por el lienzo sea indistinguible del generado por GPT-4o y
 * pase igual por `TsxCompilationChecker` y por el sandbox Babel.
 */

import type { BuilderBlock } from './types';
import type { StateVar } from './actions';
import { stateDeclarations } from './actions';
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

const EMPTY_COMPONENT =
  'export function App() {\n  return <div className="p-4 text-slate-400">Vacío</div>;\n}';

export const reactEmitter: CodeEmitter = {
  key: 'react',
  label: 'React + TypeScript',
  extension: 'tsx',
  language: 'tsx',
  verifiable: true,
  emit({ blocks, rootIds, vars }) {
    if (rootIds.length === 0) return EMPTY_COMPONENT;

    const ctx = { vars };
    // Solo declaramos las variables que el árbol acaba usando. Las implícitas
    // (estado propio de widgets sin `bindTo`) se usan siempre por construcción.
    const used = usedVars(blocks, rootIds, vars);
    const implicit = collectImplicitVars(blocks, rootIds, vars);
    const declarations = stateDeclarations([...used, ...implicit]);

    const body = rootIds
      .map((id) => {
        const block = blocks[id];
        return block ? emitNode(buildNode(block, ctx), blocks, ctx, 3, block.children) : '';
      })
      .filter(Boolean)
      .join('\n');

    const head = declarations.length > 0 ? declarations.map((d) => `  ${d}`).join('\n') + '\n\n' : '';

    return `export function App() {\n${head}  return (\n    <div className="p-4 space-y-4">\n${body}\n    </div>\n  );\n}`;
  },
};

/**
 * Variables realmente referenciadas por el árbol.
 *
 * Declarar una variable sin usarla haría fallar `tsc` con `noUnusedLocals`, así
 * que se filtran comparando contra el código emitido de atributos y expresiones.
 */
function usedVars(
  blocks: Record<string, BuilderBlock>,
  rootIds: string[],
  vars: StateVar[],
): StateVar[] {
  if (vars.length === 0) return [];

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
  return vars.filter((v) => new RegExp(`\\b${v.name}\\b`).test(haystack));
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

function emitAttr(name: string, attr: Attr): string {
  switch (attr.kind) {
    case 'static':
      // Comillas dentro del valor: se pasa a expresión para no romper el atributo.
      return attr.value.includes('"')
        ? ` ${name}={${JSON.stringify(attr.value)}}`
        : ` ${name}="${attr.value}"`;
    case 'expr':
      return ` ${name}={${attr.code}}`;
    case 'event':
      return ` ${name}={${attr.code}}`;
  }
}

function emitNode(
  node: UiNode,
  blocks: Record<string, BuilderBlock>,
  ctx: { vars: StateVar[] },
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
          const child = blocks[id];
          return child ? emitNode(buildNode(child, ctx), blocks, ctx, level, child.children) : '';
        })
        .filter(Boolean)
        .join('\n');

    case 'when': {
      const inner = node.children
        .map((c) => emitNode(c, blocks, ctx, level + 1, childIds))
        .filter(Boolean)
        .join('\n');
      if (!inner) return '';
      return `${pad}{${node.test} && (\n${inner}\n${pad})}`;
    }

    case 'el': {
      const attrs = Object.entries(node.attrs)
        .map(([name, attr]) => emitAttr(name, attr))
        .join('');

      const children = node.children
        .map((c) => emitNode(c, blocks, ctx, level + 1, childIds))
        .filter(Boolean);

      if (children.length === 0) {
        // Void o vacío: autocerrado.
        return `${pad}<${node.tag}${attrs} />`;
      }

      if (VOID_TAGS.has(node.tag)) {
        // Un void con hijos sería inválido; se ignoran los hijos.
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
