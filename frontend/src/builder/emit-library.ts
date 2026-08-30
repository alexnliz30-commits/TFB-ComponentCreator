/**
 * Exportación de una librería entera.
 *
 * Una librería no es una bolsa de componentes sueltos: es la unidad que se
 * entrega. Por eso se exporta como un paquete único —con su barril, su tema
 * compartido y su README— y no componente a componente. Se apoya en
 * `emitPackage`, que sigue siendo quien sabe emitir UN componente; aquí solo se
 * compone: se reubican las rutas bajo la carpeta de la librería y el tema se
 * emite UNA vez en la raíz en lugar de repetirse dentro de cada componente.
 *
 * Los componentes sin árbol de bloques (los generados directamente como código)
 * también entran, pero con su fuente tal cual: de un TSX emitido no se puede
 * reconstruir el árbol, así que no hay props ni estado que exponer.
 */

import { toComponentName, THEME_FILE, type PackageFile } from './emit-package';
import { packageFor } from './emitters';
import { themeCss, type Theme } from './theme';
import type { BuilderBlock } from './types';
import type { CallbackProp, StateVar } from './actions';
import type { DataModel } from './data-model';
import type { Lang } from './lang';
import type { ZipEntry } from './zip';

/** Un componente de la librería, tal y como lo devuelve el catálogo. */
export interface LibraryComponentInput {
  name: string;
  sourceCode: string;
  /** Árbol de bloques serializado; ausente en los generados como código. */
  treeJson: string | null;
}

export interface LibraryPackageInput {
  libraryName: string;
  components: LibraryComponentInput[];
  /** Estilos globales que comparten todos los componentes de la librería. */
  theme: Theme;
  /**
   * Hoja de estilos global de la librería, más allá de los roles del tema.
   *
   * Se emite junto al tema en la capa `vz-global`, así que manda sobre los
   * estilos propios de cada componente salvo donde estos marquen su desvío
   * con `!propio`.
   */
  globalStyles?: string;
  /** Extensión del fuente para los componentes sin árbol (`tsx`, `vue`, `ts`…). */
  sourceExtension: string;
  /**
   * Lenguaje en el que se reconstruyen los componentes que sí tienen árbol.
   *
   * Es el de la librería, no el de cada componente: un kit que mezclara TSX y
   * JSX obligaría a quien lo recibe a configurar las dos cadenas de compilación
   * para usar la mitad de las piezas.
   */
  lang?: Lang;
  /**
   * Clave del emisor con el que se reconstruyen los componentes con árbol.
   *
   * Sin ella la exportación caía siempre en el paquete de React: una librería de
   * Angular salía del zip como carpetas de TSX, es decir, con el framework
   * equivocado en todos sus ficheros.
   */
  target?: string;
}

/** Forma persistida del árbol de un componente, tal y como la guarda el proyecto. */
interface PersistedTree {
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  stateVars: StateVar[];
  /**
   * Contrato del componente: lo que recibe y lo que avisa.
   *
   * Faltaba, y con él se perdía la mitad del componente al exportar la librería
   * entera: un componente con modelo salía del zip sin su prop `items`, sin sus
   * datos de ejemplo y con el repetidor desactivado, mientras que exportado
   * suelto salía completo. El mismo componente, dos resultados distintos.
   */
  model?: DataModel;
  callbacks?: CallbackProp[];
  customStyles?: string;
  stylesLanguage?: 'css' | 'scss';
}

export function parseTree(treeJson: string | null): PersistedTree | null {
  if (!treeJson) return null;
  try {
    const parsed = JSON.parse(treeJson);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.blocks || !Array.isArray(parsed.rootIds)) return null;
    return {
      blocks: parsed.blocks,
      rootIds: parsed.rootIds,
      stateVars: Array.isArray(parsed.stateVars) ? parsed.stateVars : [],
      model: parsed.model && typeof parsed.model === 'object' ? parsed.model : undefined,
      callbacks: Array.isArray(parsed.callbacks) ? parsed.callbacks : undefined,
      customStyles: typeof parsed.customStyles === 'string' ? parsed.customStyles : undefined,
      stylesLanguage: parsed.stylesLanguage === 'scss' ? 'scss' : 'css',
    };
  } catch {
    return null;
  }
}

/** `ProductCatalog` -> `product-catalog`, para nombrar ficheros en Angular. */
function kebab(nombre: string): string {
  return nombre
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** `mi librería` -> `MiLibreria`, para usarlo como nombre de carpeta. */
export function toLibraryFolder(raw: string): string {
  return toComponentName(raw) || 'Libreria';
}

/**
 * Nombres de carpeta únicos dentro de la librería.
 *
 * Dos componentes distintos pueden normalizar al mismo PascalCase («Botón» y
 * «boton»), y en el zip eso sería una carpeta pisando a la otra sin aviso.
 */
function uniqueNames(components: LibraryComponentInput[]): string[] {
  const used = new Set<string>();
  return components.map((c) => {
    const base = toComponentName(c.name) || 'Componente';
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);
    return name;
  });
}

export function emitLibrary(input: LibraryPackageInput): PackageFile[] {
  const root = toLibraryFolder(input.libraryName);
  const names = uniqueNames(input.components);
  const files: PackageFile[] = [];
  /*
    `props` dice si el paquete del componente exporta su tipo de props.

    Antes el barril lo DEDUCÍA del destino: reexportaba `XProps` salvo en
    JavaScript y en Angular. La deducción se quedó corta en cuanto Vue tuvo
    paquete: un componente de Vue sin colección ni avisos no recibe nada, así que
    su `types.ts` no declara ningún `XProps`, y el barril anunciaba un tipo
    inexistente —que rompe el punto de entrada de toda la librería, no solo el de
    ese componente. Ahora se mira lo que el paquete exporta de verdad.
  */
  const exported: { name: string; editable: boolean; props: boolean }[] = [];

  input.components.forEach((component, i) => {
    const name = names[i];
    const tree = parseTree(component.treeJson);

    if (!tree) {
      // Sin árbol solo se puede entregar el fuente tal cual.
      files.push({
        path: `${root}/${name}/${name}.${input.sourceExtension}`,
        contents: component.sourceCode.trim() + '\n',
        language: input.sourceExtension === 'tsx' ? 'tsx' : 'ts',
      });
      exported.push({ name, editable: false, props: false });
      return;
    }

    const componentFiles = packageFor(input.target ?? 'react', {
      blocks: tree.blocks,
      rootIds: tree.rootIds,
      vars: tree.stateVars,
      model: tree.model,
      callbacks: tree.callbacks,
      lang: input.lang,
      name,
      theme: input.theme,
      // El tema es de la librería y vive en su raíz: un nivel por encima.
      themeHref: `../${THEME_FILE}`,
      customStyles: tree.customStyles,
      stylesLanguage: tree.stylesLanguage,
    });

    if (!componentFiles) {
      // Destino sin paquete de carpeta: se entrega el fuente, como los que no
      // tienen árbol. Es peor que una carpeta, pero es cierto.
      files.push({
        path: `${root}/${name}/${name}.${input.sourceExtension}`,
        contents: component.sourceCode.trim() + '\n',
        language: input.sourceExtension === 'tsx' ? 'tsx' : 'ts',
      });
      exported.push({ name, editable: false, props: false });
      return;
    }

    for (const file of componentFiles) {
      files.push({ ...file, path: `${root}/${file.path}` });
    }
    const indice = componentFiles.find((f) => /\/index\.[jt]s$/.test(f.path))?.contents ?? '';
    exported.push({
      name,
      editable: true,
      props: new RegExp(`export type \\{[^}]*\\b${name}Props\\b`).test(indice),
    });
  });

  files.push({
    path: `${root}/${THEME_FILE}`,
    contents: themeCss(input.theme, undefined, input.globalStyles),
    language: 'css',
  });

  /*
    El barril sigue al lenguaje de la librería, no al de quien lo escribió.

    Estaba fijo en `index.ts` y reexportaba los tipos con `export type`, así que
    una librería de JavaScript salía del zip con un fichero TypeScript en la raíz
    —el único de todo el paquete— y con sintaxis que ningún empaquetador de JS
    entiende. El resto de ficheros ya respetaban el idioma; este se había quedado
    atrás y rompía el paquete justo en su punto de entrada.
  */
  const esJs = input.lang === 'js';
  const barril = exported
    .filter((c) => c.editable)
    .map((c) => (c.props
      ? `export { ${c.name} } from './${c.name}';\nexport type { ${c.name}Props } from './${c.name}';`
      : `export { ${c.name} } from './${c.name}';`))
    .join('\n');

  files.push({
    path: `${root}/index.${esJs ? 'js' : 'ts'}`,
    contents: exported.some((c) => c.editable)
      ? barril + '\n'
      : '// La librería no tiene componentes con árbol editable.\nexport {};\n',
    language: esJs ? 'js' : 'ts',
  });

  files.push({
    path: `${root}/README.md`,
    contents: libraryReadme(root, input, exported),
    language: 'md',
  });

  return files;
}

function libraryReadme(
  root: string,
  input: LibraryPackageInput,
  exported: { name: string; editable: boolean; props: boolean }[],
): string {
  const target = input.target ?? 'react';
  const esAngular = target.startsWith('angular');
  const esVue = target.startsWith('vue');
  /*
    Cómo se llama la vista de cada componente, según el destino.

    El README describe una carpeta que ya está emitida, así que si esto se queda
    atrás cuando aparece un destino nuevo, el índice manda a quien reciba el zip
    a un fichero que no existe. Es lo que pasaba con Vue, que salía anunciado
    como `.tsx`.
  */
  const vista = esAngular ? 'component.ts' : esVue ? 'vue' : input.lang === 'js' ? 'jsx' : 'tsx';
  const rows = exported
    .map((c) => `| \`${c.name}\` | ${c.editable ? `\`${c.name}/${esAngular ? kebab(c.name) : c.name}.${vista}\`` : `\`${c.name}/${c.name}.${input.sourceExtension}\` (solo fuente)`} |`)
    .join('\n');

  const soloFuente = exported.filter((c) => !c.editable).length;

  return `# ${input.libraryName}

Librería de componentes exportada con **Visualiza**.

## Componentes

| Componente | Fichero |
| --- | --- |
${rows}

${soloFuente > 0
  ? `> ${soloFuente} componente(s) se entregan solo como fuente: se generaron como código y no
> tienen árbol de bloques, así que no exponen props ni se pueden reabrir en el constructor.\n`
  : ''}
## Uso

\`\`\`${esAngular || esVue ? 'ts' : input.lang === 'js' ? 'jsx' : 'tsx'}
import { ${exported.find((c) => c.editable)?.name ?? 'Componente'} } from './${root}';
\`\`\`

## Tema

\`${THEME_FILE}\` está en la raíz de la librería y lo importan todos sus componentes:
define el color de marca, la tipografía y la forma como variables CSS. Cambiarlo
repinta la librería entera desde un único sitio, que es la razón de que el tema sea
de la librería y no de cada componente.

## Requisitos

- ${esAngular
  ? 'Angular 21 o superior: los componentes son standalone y usan señales.'
  : esVue
    ? `Vue ${target.startsWith('vue2') ? '2' : '3'}${target === 'vue3' ? ' — 3.3 o superior, que es desde cuando `defineProps` resuelve un tipo importado' : ''}.`
    : 'React 18 o superior.'}
- **Tailwind CSS en el proyecto anfitrión**, incluyendo esta carpeta en su \`content\`:

\`\`\`js
// tailwind.config.js
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx,vue,html}', './ruta/a/${root}/**/*.${esAngular ? 'html' : esVue ? 'vue' : input.lang === 'js' ? 'jsx' : 'tsx'}'],
};
\`\`\`

Para obtener componentes autocontenidos (sin depender de Tailwind en destino), expórtalos
uno a uno desde el constructor con la hoja de estilos generada: esa compilación la hace el
backend con la CLI de Tailwind y requiere Node disponible.
`;
}

/** Convierte los ficheros del paquete en entradas de zip. */
export function toZipEntries(files: PackageFile[]): ZipEntry[] {
  return files.map((f) => ({ path: f.path, contents: f.contents }));
}
