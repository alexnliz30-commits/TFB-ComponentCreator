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

import type { CallbackProp, StateVar } from './actions';
import { initialLiteral, setterName } from './actions';
import {
  callbackSignature, emitComponentParts, itemTypeOf, usedCallbacks,
  ROOT_LAYOUT, type ComponentParts, type EmitInput,
} from './emit-react';
import { themeCss, type Theme } from './theme';
import { componentLayer } from './cascade';
import { mockRowsLiteral, modelInterface, modelTypedef } from './data-model';
import { anot, jsdocBloque } from './lang';
import { ITEMS_PROP } from './schema';

export interface PackageFile {
  /** Ruta relativa dentro de la carpeta del componente. */
  path: string;
  contents: string;
  language: 'tsx' | 'jsx' | 'ts' | 'js' | 'css' | 'scss' | 'md';
}

/** Nombre del fichero de tema dentro del paquete. */
export const THEME_FILE = 'theme.css';

export interface PackageInput extends EmitInput {
  /** Nombre elegido por el usuario; se normaliza a PascalCase. */
  name: string;
  /**
   * Estilos globales de la librería. Se emiten en su propio fichero, separados
   * de los del componente: es lo que permite cambiar el color de marca o la
   * tipografía de todo el kit tocando un único sitio.
   */
  theme?: Theme;
  /** CSS o SASS propio que el usuario haya escrito para el componente. */
  customStyles?: string;
  stylesLanguage?: 'css' | 'scss';
  /**
   * Hoja autocontenida devuelta por el backend (utilidades Tailwind resueltas + los
   * estilos propios ya compilados). Cuando está presente, el paquete no depende de
   * que el proyecto anfitrión tenga Tailwind.
   */
  generatedCss?: string;
  /**
   * Ruta desde la que importar el tema, si no es el fichero hermano.
   *
   * Al exportar una librería entera el tema es uno solo para todos sus
   * componentes y vive en la raíz del paquete, no repetido dentro de cada
   * carpeta; entonces el importador la aporta y este emisor no emite el fichero.
   */
  themeHref?: string;
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
  return `${v.name}Initial`;
}

/**
 * Identificadores que declara una lista de sentencias `const …`.
 *
 * Se mira LÍNEA A LÍNEA y no el principio de cada sentencia, porque una
 * sentencia puede venir precedida de su propio JSDoc: en JavaScript el tipo del
 * mock se anota así, y con el ancla puesta al principio del bloque el nombre no
 * se reconocía. La consecuencia era la de siempre —el fichero que lo usa se
 * quedaba sin su import— y la peor posible: el paquete se veía bien aquí y no
 * compilaba en el proyecto de destino.
 */
function declaredNames(statements: string[]): string[] {
  return statements.flatMap((statement) => statement.split('\n').flatMap((line) => {
    // Acepta anotación de tipo: `const MOCK_ITEMS: Pedido[] = …`.
    const simple = line.match(/^const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/);
    if (simple) return [simple[1]];
    // `const [valor, setValor] = useState(…)`, con el primero posiblemente vacío
    // cuando la variable solo se escribe.
    const pair = line.match(/^const\s+\[\s*([\w$]*)\s*,\s*([\w$]+)\s*\]/);
    if (pair) return [pair[1], pair[2]].filter(Boolean);
    return [];
  }));
}

/**
 * Importa de un módulo solo lo que el fichero usa de verdad.
 *
 * Con `noUnusedLocals` un import de más no es un detalle de estilo: rompe la
 * compilación, y el paquete se entrega precisamente para compilarse dentro de
 * otro proyecto.
 */
function importOf(names: string[], text: string, from: string): string | null {
  const used = [...new Set(names)].filter((n) => new RegExp(`\\b${n}\\b`).test(text));
  return used.length > 0 ? `import { ${used.join(', ')} } from '${from}';` : null;
}

/**
 * Genera el componente con nombre, props y estado.
 *
 * Se reutilizan las piezas del emisor de verificación en vez de recorrer la IR
 * otra vez: así el markup, los datos extraídos y los manejadores de los dos
 * artefactos son literalmente los mismos.
 */
/**
 * Ficheros del paquete, ya repartidos por responsabilidad.
 *
 * La estructura no es decorativa: separa lo que cambia por motivos distintos.
 * La presentación (`Name.tsx`) se toca al rediseñar; el estado y los eventos
 * (`hooks/useName.ts`) al cambiar el comportamiento; los datos y las clases
 * (`constants.ts`) al ajustar contenido o estilo; y el contrato (`types.ts`) al
 * cambiar lo que el componente acepta de fuera. Todo junto en un fichero, cada
 * uno de esos cambios obligaba a leer los otros tres.
 *
 * El `index.ts` es la única puerta pública: quien lo consume importa del
 * paquete, no de sus interiores, así que la estructura de dentro puede cambiar
 * sin romper a nadie.
 */
interface SplitSources {
  component: string;
  types: string;
  constants: string | null;
  hook: string | null;
  index: string;
}

function splitSources(input: PackageInput, name: string, parts: ComponentParts): SplitSources {
  const lang = input.lang ?? 'ts';
  const stylesFile = input.generatedCss
    ? `${name}.css`
    : input.customStyles?.trim()
      ? `${name}.${input.stylesLanguage ?? 'css'}`
      : null;

  const { body, usedVars, implicitVars: implicit } = parts;
  const hookName = `use${name}`;

  // ── types.ts / types.js ───────────────────────────────────────────────────
  const propsLines = [
    '  /** Extra classes for the root container. */',
    '  className?: string;',
    ...usedVars.flatMap((v) => [
      `  /** Initial value of \`${v.name}\`. */`,
      `  ${propName(v)}?: ${tsType(v)};`,
    ]),
  ];
  /** Descripción de cada prop en la forma que entiende JSDoc. */
  const propsJsdoc: [string, string, string][] = [
    ['string', '[className]', 'Extra classes for the root container.'],
    ...usedVars.map((v) => [tsType(v), `[${propName(v)}]`, `Initial value of \`${v.name}\`.`] as [string, string, string]),
  ];
  /*
    La colección entra en el contrato como prop OPCIONAL con los mock por
    defecto. Es lo que permite las dos formas de usarlo: `<X />` enseña datos de
    ejemplo mientras el modelo no está enganchado, y `<X items={reales} />` los
    de verdad. Obligarla dejaría el componente inservible hasta tener backend.
  */
  const itemType = itemTypeOf(input);
  if (itemType) {
    propsLines.push(
      '  /** Collection to render. Defaults to the sample data. */',
      `  ${ITEMS_PROP}?: ${itemType}[];`,
    );
    propsJsdoc.push([`${itemType}[]`, `[${ITEMS_PROP}]`, 'Collection to render. Defaults to the sample data.']);
  }

  /*
    Las props de función se listan TODAS las declaradas, usadas o no.

    Es lo contrario del criterio del artefacto de verificación, y a propósito:
    esto es el contrato público del componente, y una prop declarada describe
    algo que el diseñador ha decidido que el componente ofrece. Filtrarla por
    uso convertiría el contrato en un reflejo del markup de hoy.
  */
  for (const cb of input.callbacks ?? []) {
    propsLines.push(
      `  /** Notifies the host application. Optional: without it nothing happens. */`,
      `  ${cb.name}?: ${callbackSignature(cb, itemType)};`,
    );
    propsJsdoc.push([
      callbackSignature(cb, itemType),
      `[${cb.name}]`,
      'Notifies the host application. Optional: without it nothing happens.',
    ]);
  }

  /*
    En JavaScript el contrato NO desaparece: se escribe en JSDoc.

    Es la forma en que un proyecto JS declara y documenta lo que un componente
    acepta, y la que leen tanto el editor de quien recibe el paquete como su
    comprobador de tipos si algún día lo enciende (`checkJs`). El fichero sigue
    existiendo y llamándose igual —solo cambia la extensión— para que la
    estructura del paquete sea la misma en los dos lenguajes y quien la conozca
    no tenga que reaprenderla.
  */
  const types = lang === 'js'
    ? (itemType ? `${modelTypedef(input.model!)}\n\n` : '')
      + jsdocBloque([
        `Public contract of the ${name} component.`,
        '',
        `@typedef {object} ${name}Props`,
        ...propsJsdoc.map(([t, n, d]) => `@property {${t}} ${n} ${d}`),
      ])
      // Sin una exportación el fichero no es un módulo, y `import('./types')`
      // —que es como se referencian estos tipos desde los demás ficheros— no
      // resolvería nada.
      + '\n\nexport {};\n'
    : (itemType ? `${modelInterface(input.model!)}\n\n` : '')
      + `/** Public contract of the ${name} component. */\n`
      + `export interface ${name}Props {\n${propsLines.join('\n')}\n}\n`;

  // ── constants.ts ──────────────────────────────────────────────────────────
  // Los mock viven aquí con nombre propio: son datos, y este es el fichero donde
  // quien reciba el paquete espera encontrarlos para sustituirlos por los suyos.
  const mockConst = itemType ? 'MOCK_ITEMS' : null;
  // En JavaScript el tipo del mock se anota en JSDoc en vez de en la
  // declaración: el dato es el mismo y sigue diciendo de qué es lista.
  const mockDecl = mockConst && (lang === 'js'
    ? `/** @type {import('./types').${itemType}[]} */\nconst ${mockConst} = ${mockRowsLiteral(input.model!)};`
    : `const ${mockConst}: ${itemType}[] = ${mockRowsLiteral(input.model!)};`);
  const allConstants = mockDecl ? [...parts.constants, mockDecl] : parts.constants;
  const constantNames = declaredNames(allConstants);
  const constants = allConstants.length > 0
    // Los mock van tipados con la interfaz del elemento, así que este fichero la
    // necesita importada: sin el import el paquete no compila en destino. En JS
    // el tipo viaja dentro del propio JSDoc con `import(...)` y no hace falta.
    ? (itemType && lang === 'ts' ? `import type { ${itemType} } from './types';\n\n` : '')
      + `/** Data and class lists extracted from the markup (DRY). */\n\n`
      + allConstants.map((c) => `export ${c}`).join('\n\n') + '\n'
    : null;

  // ── hooks/useName.ts ──────────────────────────────────────────────────────
  const declarations = [
    ...usedVars.map(
      (v) => `  const [${parts.readVars.has(v.name) ? v.name : ''}, ${setterName(v.name)}] = useState(${propName(v)});`,
    ),
    ...implicit.map(
      (v) => `  const [${v.name}, ${setterName(v.name)}] = useState(${initialLiteral(v)});`,
    ),
    ...parts.handlers.map((line) => `  ${line}`),
  ];
  const exposed = declaredNames(declarations.map((l) => l.trim()));
  const usedByBody = exposed.filter((n) => new RegExp(`\\b${n}\\b`).test(body));
  const hookBody = declarations.join('\n');
  const hookParams = [
    ...usedVars.map((v) => `  ${propName(v)} = ${initialLiteral(v)},`),
    // Las props de función que los manejadores llaman. Solo esas: el hook
    // desestructura, y una prop desestructurada sin usar tumba `noUnusedLocals`
    // en el proyecto que reciba el paquete.
    ...usedCallbacks(input.callbacks, hookBody).map((c) => `  ${c.name},`),
  ];
  const hook = declarations.length > 0
    ? [
      "import { useState } from 'react';",
      lang === 'ts' ? `import type { ${name}Props } from '../types';` : null,
      constants ? importOf(constantNames, hookBody, '../constants') : null,
      '',
      `/**`,
      ` * State and event handlers of ${name}.`,
      ` *`,
      ` * Kept apart from the markup so behaviour can be read, tested and changed`,
      ` * without touching presentation, and reused by a different view if needed.`,
      lang === 'js' ? ` * @param {import('../types').${name}Props} props` : null,
      ` */`,
      `export function ${hookName}({\n${hookParams.join('\n')}\n}${anot(lang, `${name}Props`)}) {`,
      hookBody,
      '',
      `  return { ${exposed.join(', ')} };`,
      '}',
      '',
    ].filter((l) => l !== null).join('\n')
    : null;

  // ── Name.tsx ──────────────────────────────────────────────────────────────
  const componentImports = [
    input.theme ? `import '${input.themeHref ?? `./styles/${THEME_FILE}`}';` : null,
    stylesFile ? `import './styles/${stylesFile}';` : null,
    lang === 'ts' ? `import type { ${name}Props } from './types';` : null,
    hook ? `import { ${hookName} } from './hooks/${hookName}';` : null,
    constants ? importOf(constantNames, `${body}
${mockConst ?? ''}`, './constants') : null,
  ].filter(Boolean);

  const component = `${componentImports.join('\n')}\n\n`
    + `/**\n * ${name}\n *\n`
    + ` * Generated with Visualiza. Self-contained: no global state, no external\n`
    + ` * data source, configured through props.\n`
    + (lang === 'js' ? ` * @param {import('./types').${name}Props} props\n` : '')
    + ` */\n`
    + `export function ${name}(props${anot(lang, `${name}Props`)}) {\n`
    // La colección se desestructura con los mock por defecto: es lo que hace que
    // `<X />` funcione sola mientras nadie ha enganchado datos reales.
    + `  const { className = ''${mockConst ? `, ${ITEMS_PROP} = ${mockConst}` : ''}`
    // Las props de función que el marcado llama directamente (`onClick={() =>
    // onSelect?.(item)}`). Las que solo usan los manejadores viven en el hook.
    + usedCallbacks(input.callbacks, body).map((c) => `, ${c.name}`).join('')
    + ` } = props;\n`
    // Del hook se toma SOLO lo que el marcado nombra. Un `setX` que únicamente
    // usa un manejador vive dentro del hook y no pinta nada aquí: traerlo lo
    // dejaría sin usar y `noUnusedLocals` tumbaría la compilación del paquete.
    + (hook && usedByBody.length > 0
      ? `  const { ${usedByBody.join(', ')} } = ${hookName}(props);\n`
      : hook ? `  ${hookName}(props);\n` : '')
    + `\n  return (\n    <div className={\`${ROOT_CLASS} ${ROOT_LAYOUT} \${className}\`}>\n`
    + `${body}\n    </div>\n  );\n}\n`;

  // En JavaScript no hay exportación de tipos que hacer: el contrato vive en el
  // JSDoc de `types.js` y se referencia con `import('./types')` desde donde haga
  // falta. Emitir `export type` allí sería sintaxis de TypeScript en un `.js`.
  const index = `export { ${name} } from './${name}';\n`
    + (lang === 'ts' ? `export type { ${name}Props } from './types';\n` : '')
    + (hook ? `export { ${hookName} } from './hooks/${hookName}';\n` : '');

  return { component, types, constants, hook, index };
}


/** Piezas de un componente sin contenido, para no duplicar el caso vacío. */
const EMPTY_PARTS: ComponentParts = {
  constants: [],
  handlers: [],
  body: '      {/* Sin contenido */}',
  usedVars: [],
  implicitVars: [],
  readVars: new Set(),
};

/** Construye el paquete completo del componente. */
export function emitPackage(input: PackageInput): PackageFile[] {
  const name = toComponentName(input.name);
  // Una sola emisión para todo el paquete: el fuente, las props expuestas y el
  // README hablan así del mismo componente por construcción.
  const parts = input.rootIds.length > 0 ? emitComponentParts(input) : EMPTY_PARTS;
  const usedVars = parts.usedVars;
  const stylesExt = input.stylesLanguage ?? 'css';
  const hasStyles = Boolean(input.customStyles?.trim());

  const src = splitSources(input, name, parts);

  // Las extensiones son lo único de la estructura que cambia con el lenguaje:
  // los mismos cinco ficheros, con los mismos nombres y las mismas
  // responsabilidades, para que quien conozca un paquete conozca los dos.
  const lang = input.lang ?? 'ts';
  const vista = lang === 'ts' ? 'tsx' : 'jsx';
  const modulo = lang === 'ts' ? 'ts' : 'js';

  const files: PackageFile[] = [
    { path: `${name}/index.${modulo}`, contents: src.index, language: modulo },
    { path: `${name}/${name}.${vista}`, contents: src.component, language: vista },
    { path: `${name}/types.${modulo}`, contents: src.types, language: modulo },
  ];
  if (src.constants) {
    files.push({ path: `${name}/constants.${modulo}`, contents: src.constants, language: modulo });
  }
  if (src.hook) {
    files.push({ path: `${name}/hooks/use${name}.${modulo}`, contents: src.hook, language: modulo });
  }

  // Con `themeHref` el tema lo aporta quien empaqueta (la exportación de una
  // librería lo emite una sola vez en su raíz), así que aquí no se duplica.
  if (input.theme && !input.themeHref) {
    files.push({
      path: `${name}/styles/${THEME_FILE}`,
      contents: themeCss(input.theme),
      language: 'css',
    });
  }

  if (input.generatedCss) {
    // Hoja autocontenida: incluye las utilidades Tailwind resueltas y, al final,
    // los estilos propios ya compilados.
    files.push({
      path: `${name}/styles/${name}.css`,
      contents: input.generatedCss.trim() + '\n',
      language: 'css',
    });
  } else if (hasStyles) {
    files.push({
      path: `${name}/styles/${name}.${stylesExt}`,
      // En la capa del componente: los estilos globales de la librería mandan
      // sobre estos, salvo donde la declaración se marque con `!propio`.
      contents: componentLayer(input.customStyles!),
      language: stylesExt,
    });
  }

  files.push({
    path: `${name}/README.md`,
    contents: readme(name, usedVars, input.callbacks ?? [], itemTypeOf(input), {
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
  callbacks: CallbackProp[],
  itemType: string | null,
  styles: { selfContained: boolean; hasStyles: boolean; stylesExt: string },
): string {
  const propsTable = [
    '| Prop | Tipo | Por defecto | Descripción |',
    '| --- | --- | --- | --- |',
    "| `className` | `string` | `''` | Clases adicionales del contenedor raíz. |",
    ...(itemType
      ? [`| \`${ITEMS_PROP}\` | \`${itemType}[]\` | datos de ejemplo | Colección a pintar. |`]
      : []),
    ...vars.map(
      (v) => `| \`${propName(v)}\` | \`${tsType(v)}\` | \`${initialLiteral(v)}\` | Valor inicial de \`${v.name}\`. |`,
    ),
    ...callbacks.map(
      (c) => `| \`${c.name}\` | \`${callbackSignature(c, itemType)}\` | — | Aviso a la aplicación anfitriona. |`,
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
