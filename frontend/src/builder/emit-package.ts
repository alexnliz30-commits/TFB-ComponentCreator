/**
 * Exportación del componente como paquete de carpeta.
 *
 * El emisor de `emit-react.ts` produce la forma `export function App()` que
 * exigen el sandbox y el harness KR1: un artefacto de *verificación*, útil para
 * comprobar que el componente compila, pero no para reutilizarlo.
 *
 * Este módulo produce el artefacto de *entrega*: una carpeta por componente con
 * nombre propio, interfaz de props y punto de entrada, pensada para copiarse a
 * otro proyecto. Ambos salen de la misma IR, así que no pueden describir cosas
 * distintas.
 *
 * Criterios aplicados:
 *   - Responsabilidad única: un componente por carpeta, sin lógica ajena a su
 *     presentación.
 *   - Abierto/cerrado: se extiende por props (estado inicial y `className` del
 *     raíz) sin tocar el fichero.
 *   - Sin datos ocultos: lo configurable viaja por props y tiene valor por
 *     defecto, de modo que `<Componente />` sigue funcionando.
 */

import type { StateVar } from './actions';
import { initialLiteral, setterName } from './actions';
import { buildNode, collectImplicitVars } from './schema';
import { reactEmitter, type EmitInput } from './emit-react';

export interface PackageFile {
  /** Ruta relativa dentro de la carpeta del componente. */
  path: string;
  contents: string;
  language: 'tsx' | 'ts' | 'css' | 'scss' | 'md';
}

export interface PackageInput extends EmitInput {
  /** Nombre elegido por el usuario; se normaliza a PascalCase. */
  name: string;
  /** CSS o SASS propio que el usuario haya escrito para el componente. */
  customStyles?: string;
  stylesLanguage?: 'css' | 'scss';
  /**
   * Hoja autocontenida devuelta por el backend (utilidades Tailwind resueltas + los
   * estilos propios ya compilados). Cuando está presente, el paquete no depende de
   * que el proyecto anfitrión tenga Tailwind.
   */
  generatedCss?: string;
}

/**
 * Clase aplicada a la raíz del componente.
 *
 * Acota el reset de la hoja generada: el preflight de Tailwind se desactiva al
 * compilar porque su reset global arrasaría los estilos de la web anfitriona, y en su
 * lugar se emite uno equivalente pero limitado a este subárbol.
 */
export const ROOT_CLASS = 'visualiza-component';

/** `mi boton genial` -> `MiBotonGenial`. Siempre un identificador válido. */
export function toComponentName(raw: string): string {
  const cleaned = (raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();

  if (!cleaned) return 'MiComponente';

  const pascal = cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  // Un identificador no puede empezar por dígito.
  return /^[0-9]/.test(pascal) ? `Componente${pascal}` : pascal;
}

/** Tipo TypeScript de una variable de estado. */
function tsType(v: StateVar): string {
  return v.type === 'boolean' ? 'boolean' : v.type === 'number' ? 'number' : 'string';
}

/** Nombre del parámetro que sobreescribe el valor inicial de una variable. */
function propName(v: StateVar): string {
  return `${v.name}Inicial`;
}

/**
 * Genera el componente con nombre, props y estado.
 *
 * Se reutiliza el cuerpo JSX del emisor de verificación en vez de recorrer la
 * IR otra vez: así el markup de los dos artefactos es literalmente el mismo.
 */
function componentSource(input: PackageInput, name: string, usedVars: StateVar[]): string {
  // Con hoja generada, el fichero de estilos siempre es .css: el SASS ya viene
  // compilado dentro. Sin ella, se adjunta el fuente propio tal cual.
  const stylesFile = input.generatedCss
    ? `${name}.css`
    : input.customStyles?.trim()
      ? `${name}.${input.stylesLanguage ?? 'css'}`
      : null;
  const body = extractJsxBody(reactEmitter.emit(input));

  // Estado implícito de widgets sin `bindTo`: interno al componente. No se
  // expone como prop porque no lo nombró el usuario; es parte del widget.
  const implicit = collectImplicitVars(input.blocks, input.rootIds, input.vars);

  const propsLines = [
    '  /** Clases adicionales para el contenedor raíz. */',
    '  className?: string;',
    ...usedVars.flatMap((v) => [
      `  /** Valor inicial de \`${v.name}\`. */`,
      `  ${propName(v)}?: ${tsType(v)};`,
    ]),
  ];

  const params = [
    '  className = \'\',',
    ...usedVars.map((v) => `  ${propName(v)} = ${initialLiteral(v)},`),
  ];

  const declarations = [
    ...usedVars.map(
      (v) => `  const [${v.name}, ${setterName(v.name)}] = useState(${propName(v)});`,
    ),
    ...implicit.map(
      (v) => `  const [${v.name}, ${setterName(v.name)}] = useState(${initialLiteral(v)});`,
    ),
  ];

  const imports = [
    // Sin estado no hace falta importar useState.
    usedVars.length + implicit.length > 0 ? "import { useState } from 'react';" : null,
    stylesFile ? `import './${stylesFile}';` : null,
  ].filter(Boolean);

  return `${imports.join('\n')}${imports.length ? '\n\n' : ''}export interface ${name}Props {
${propsLines.join('\n')}
}

/**
 * ${name}
 *
 * Componente generado con Visualiza. Autocontenido: no depende de estado
 * global ni de datos externos, y se configura por props.
 */
export function ${name}({
${params.join('\n')}
}: ${name}Props) {
${declarations.length ? declarations.join('\n') + '\n\n' : ''}  return (
    <div className={\`${ROOT_CLASS} p-4 space-y-4 \${className}\`}>
${body}
    </div>
  );
}
`;
}

/**
 * Extrae el JSX interior del componente de verificación.
 *
 * El emisor envuelve siempre el árbol en `<div className="p-4 space-y-4">`, así
 * que basta con quedarse con lo que hay entre esa apertura y su cierre.
 */
function extractJsxBody(source: string): string {
  const open = source.indexOf('<div className="p-4 space-y-4">');
  if (open === -1) {
    // Lienzo vacío: el emisor devuelve la variante corta.
    return '      {/* Sin contenido */}';
  }
  const start = source.indexOf('\n', open) + 1;
  const end = source.lastIndexOf('    </div>');
  return source.slice(start, end).replace(/\n$/, '');
}

/** Variables realmente usadas, para no exponer props muertas. */
function computeUsedVars(input: PackageInput): StateVar[] {
  if (input.vars.length === 0) return [];

  const fragments: string[] = [];
  const ctx = { vars: input.vars };
  const visit = (id: string) => {
    const block = input.blocks[id];
    if (!block) return;
    const stack = [buildNode(block, ctx)];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (node.kind === 'expr') fragments.push(node.code);
      if (node.kind === 'when') { fragments.push(node.test); stack.push(...node.children); }
      if (node.kind === 'el') {
        for (const attr of Object.values(node.attrs)) {
          if (attr.kind === 'expr' || attr.kind === 'event') fragments.push(attr.code);
        }
        stack.push(...node.children);
      }
    }
    block.children.forEach(visit);
  };
  input.rootIds.forEach(visit);

  const haystack = fragments.join('\n');
  return input.vars.filter((v) => new RegExp(`\\b${v.name}\\b`).test(haystack));
}

/** Construye el paquete completo del componente. */
export function emitPackage(input: PackageInput): PackageFile[] {
  const name = toComponentName(input.name);
  const usedVars = computeUsedVars(input);
  const stylesExt = input.stylesLanguage ?? 'css';
  const hasStyles = Boolean(input.customStyles?.trim());

  const files: PackageFile[] = [
    {
      path: `${name}/${name}.tsx`,
      contents: componentSource(input, name, usedVars),
      language: 'tsx',
    },
    {
      path: `${name}/index.ts`,
      contents:
        `export { ${name} } from './${name}';\n` +
        `export type { ${name}Props } from './${name}';\n`,
      language: 'ts',
    },
  ];

  if (input.generatedCss) {
    // Hoja autocontenida: incluye las utilidades Tailwind resueltas y, al final,
    // los estilos propios ya compilados.
    files.push({
      path: `${name}/${name}.css`,
      contents: input.generatedCss.trim() + '\n',
      language: 'css',
    });
  } else if (hasStyles) {
    files.push({
      path: `${name}/${name}.${stylesExt}`,
      contents: input.customStyles!.trim() + '\n',
      language: stylesExt,
    });
  }

  files.push({
    path: `${name}/README.md`,
    contents: readme(name, usedVars, {
      selfContained: Boolean(input.generatedCss),
      hasStyles,
      stylesExt,
    }),
    language: 'md',
  });

  return files;
}

function readme(
  name: string,
  vars: StateVar[],
  styles: { selfContained: boolean; hasStyles: boolean; stylesExt: string },
): string {
  const propsTable = [
    '| Prop | Tipo | Por defecto | Descripción |',
    '| --- | --- | --- | --- |',
    "| `className` | `string` | `''` | Clases adicionales del contenedor raíz. |",
    ...vars.map(
      (v) => `| \`${propName(v)}\` | \`${tsType(v)}\` | \`${initialLiteral(v)}\` | Valor inicial de \`${v.name}\`. |`,
    ),
  ].join('\n');

  return `# ${name}

Componente generado con **Visualiza**.

## Uso

\`\`\`tsx
import { ${name} } from './${name}';

export function Ejemplo() {
  return <${name} />;
}
\`\`\`

## Props

${propsTable}

## Requisitos

- React 18 o superior.
${styles.selfContained
  ? `- Ninguno más: los estilos van en \`${name}.css\`, que el propio componente importa.`
  : '- **Tailwind CSS configurado en el proyecto anfitrión** (ver más abajo).'}

## Estilos

${styles.selfContained
  ? `Este paquete es **autocontenido**. \`${name}.css\` contiene solo las utilidades que el
componente usa, ya resueltas${styles.hasStyles ? ', más sus estilos propios' : ''}, así que
funciona en cualquier proyecto sin instalar ni configurar Tailwind.

El reset que las utilidades necesitan está acotado a la clase \`${ROOT_CLASS}\` de la
raíz y escrito con \`:where()\`, de modo que no altera los estilos del resto de la
página ni compite con ellos en especificidad.`
  : `El markup usa clases de utilidad de Tailwind CSS y **este paquete no incluye la hoja
resuelta**, así que el proyecto anfitrión debe tener Tailwind configurado y incluir
esta carpeta en su \`content\`:

\`\`\`js
// tailwind.config.js
export default {
  content: ['./src/**/*.{ts,tsx}', './ruta/a/${name}/**/*.tsx'],
};
\`\`\`
${styles.hasStyles ? `\nLos estilos propios están en \`${name}.${styles.stylesExt}\` y los importa el componente.\n` : ''}
Para obtener un paquete autocontenido, vuelve a exportarlo desde un entorno con Node
disponible: la hoja la genera el backend con la CLI de Tailwind.`}
`;
}
