/**
 * Exportación del componente de Vue como paquete de carpeta.
 *
 * Faltaba entero. Cuatro de los ocho destinos —Vue 3 y Vue 2, en los dos
 * lenguajes— solo sabían entregarse como un SFC suelto, y como la condición para
 * publicar en una librería es tener paquete de carpeta, tampoco se podían
 * publicar. El SFC de un fichero está bien para leerlo; para llevárselo a otro
 * proyecto hace falta lo mismo que en React y en Angular: un punto de entrada,
 * el contrato aparte, los datos de ejemplo sustituibles y los estilos.
 *
 * Se compone desde las mismas `piezasVue` que el fichero único, así que las dos
 * formas no pueden decir cosas distintas del mismo componente. Lo único que
 * cambia es de dónde salen el modelo, los mock y los validadores: allí se
 * declaran dentro del SFC, aquí se importan de los ficheros hermanos.
 */

import { componerSfc, piezasVue, type PiezasVue } from './emit-vue';
import { toComponentName, THEME_FILE, type PackageFile, type PackageInput } from './emit-package';
import { callbackSignature, type EmitInput } from './emit-react';
import { modelTypedef } from './data-model';
import { themeCss } from './theme';
import { componentLayer } from './cascade';
import { jsdocBloque } from './lang';
import { ITEMS_PROP } from './schema';

export interface VuePackageInput extends PackageInput {
  dialecto: 2 | 3;
}

const EMPTY_SFC = '<template>\n  <div class="p-4 text-slate-400">Vacío</div>\n</template>\n';

/** `const validateCorreo = (v) => …` → `validateCorreo`. */
function nombreDelHelper(helper: string): string {
  return /^const\s+([A-Za-z_$][\w$]*)/.exec(helper.trim())?.[1] ?? '';
}

export function emitVuePackage(input: VuePackageInput): PackageFile[] {
  const name = toComponentName(input.name);
  const lang = input.lang ?? 'ts';
  const modulo = lang === 'ts' ? 'ts' : 'js';
  const stylesExt = input.stylesLanguage ?? 'css';
  const hasStyles = Boolean(input.customStyles?.trim());
  const hasTheme = Boolean(input.theme && !input.themeHref);

  const piezas = piezasVue(input as EmitInput, input.dialecto);
  const files: PackageFile[] = [];

  if (!piezas) {
    // Sin bloques no hay componente que repartir; se entrega el esqueleto vacío
    // antes que una carpeta a medio hacer, igual que en Angular.
    files.push({ path: `${name}/${name}.vue`, contents: EMPTY_SFC, language: 'vue' });
    files.push({
      path: `${name}/index.${modulo}`,
      contents: `export { default as ${name} } from './${name}.vue';\n`,
      language: modulo,
    });
    return files;
  }

  const helperNames = piezas.helpers.map(nombreDelHelper).filter(Boolean);
  /*
    El tipo con nombre solo lo USA el SFC de Vue 3 en TypeScript.

    Vue 2 declara sus props en runtime dentro del objeto de opciones —
    `defineProps` con genéricos es de `<script setup>`, que allí no existe— así
    que importar el tipo dejaría un import sin usar, y un import sin usar no es
    un detalle de estilo: tumba la compilación de cualquier proyecto con
    `noUnusedLocals`, que es donde este paquete va a acabar. El contrato sigue
    emitiéndose en `types.ts` para quien integra el componente; lo que no se hace
    es traerlo a un fichero que no lo nombra.
  */
  const tipoDeProps = piezas.campos.length > 0 ? `${name}Props` : undefined;
  const propsType = input.dialecto === 3 ? tipoDeProps : undefined;

  /*
    Los imports del SFC: solo lo que el componente usa de verdad.

    `MOCK_ITEMS` solo si repite, los validadores solo si hay campos con reglas y
    el tipo de las props solo en TypeScript. Un import de más no es cosmético:
    en un proyecto con `noUnusedLocals` rompe la compilación, y este paquete
    existe para compilar dentro de otro proyecto.
  */
  const imports = [
    ...(propsType && lang === 'ts' ? [`import type { ${propsType} } from './types';`] : []),
    ...(piezas.itemType ? [`import { MOCK_ITEMS } from './constants';`] : []),
    ...(helperNames.length > 0 ? [`import { ${helperNames.join(', ')} } from './utils';`] : []),
  ];

  /*
    Los estilos entran por `<style src="…">`, que es la forma que Vue tiene de
    apuntar a una hoja externa desde el SFC. Sin `scoped`: el marcado usa
    utilidades de Tailwind, que son globales por definición, y el atributo de
    ámbito no las alcanzaría —el mismo motivo por el que el paquete de Angular
    deja el tema fuera de `styleUrl`.
  */
  const estilos = [
    // Con `themeHref` el tema lo aporta quien empaqueta —al exportar una
    // librería vive una sola vez en su raíz— así que aquí no se emite el
    // fichero, pero el componente lo sigue enlazando desde donde esté.
    ...(input.theme ? [`<style src="${input.themeHref ?? `./styles/${THEME_FILE}`}"></style>`] : []),
    ...(input.generatedCss ? [`<style src="./styles/${name}.css"></style>`]
      : hasStyles ? [`<style src="./styles/${name}.${stylesExt}"></style>`] : []),
  ];

  const sfc = componerSfc(piezas, { imports, inline: false, propsType })
    + (estilos.length > 0 ? `\n${estilos.join('\n')}\n` : '');

  files.push({ path: `${name}/${name}.vue`, contents: sfc, language: 'vue' });

  files.push({
    path: `${name}/types.${modulo}`,
    contents: contrato(name, piezas, input),
    language: modulo,
  });

  if (piezas.itemType) {
    files.push({
      path: `${name}/constants.${modulo}`,
      // En TypeScript el mock va tipado con la interfaz del elemento y necesita
      // importarla; en JavaScript el tipo viaja en el JSDoc con `import(…)`.
      contents: (lang === 'ts'
        ? `import type { ${piezas.itemType} } from './types';\n\n`
          + '/** Sample data. Replace with the real collection. */\n'
        : `/** @type {import('./types').${piezas.itemType}[]} */\n`)
        + `export ${piezas.mock}\n`,
      language: modulo,
    });
  }

  if (piezas.helpers.length > 0) {
    files.push({
      path: `${name}/utils.${modulo}`,
      contents: '/** Pure functions extracted from the tree: field validation rules. */\n\n'
        + piezas.helpers.map((h) => `export ${h}`).join('\n\n') + '\n',
      language: modulo,
    });
  }

  if (hasTheme) {
    files.push({
      path: `${name}/styles/${THEME_FILE}`,
      contents: themeCss(input.theme!),
      language: 'css',
    });
  }

  if (input.generatedCss) {
    files.push({
      path: `${name}/styles/${name}.css`,
      contents: input.generatedCss.trim() + '\n',
      language: 'css',
    });
  } else if (hasStyles) {
    files.push({
      path: `${name}/styles/${name}.${stylesExt}`,
      contents: componentLayer(input.customStyles!),
      language: stylesExt,
    });
  }

  files.push({
    path: `${name}/index.${modulo}`,
    /*
      El componente sale por defecto del `.vue` y se reexporta con su nombre.

      Un SFC exporta por defecto y no hay otra opción; lo que sí se puede elegir
      es cómo se importa desde fuera, y `import { MiTabla } from './MiTabla'` es
      lo mismo que ofrecen los paquetes de React y de Angular. El tipo de las
      props sale por la misma puerta: quien integra el componente lo necesita
      para declarar lo que le va a pasar.
    */
    contents: `export { default as ${name} } from './${name}.vue';\n`
      + (lang === 'ts' && (tipoDeProps || piezas.itemType)
        ? `export type { ${[tipoDeProps, piezas.itemType].filter(Boolean).join(', ')} } from './types';\n`
        : ''),
    language: modulo,
  });

  files.push({
    path: `${name}/README.md`,
    contents: readme(name, piezas, input, files.map((f) => f.path.slice(name.length + 1))),
    language: 'md',
  });

  return files;
}

/**
 * El contrato del componente, fuera del SFC.
 *
 * En TypeScript es una interfaz con nombre que el propio SFC usa como genérico
 * de `defineProps`, así que no hay dos descripciones del contrato que puedan
 * discrepar. En JavaScript es el mismo contrato escrito en JSDoc, que es como lo
 * declara y lo lee un proyecto JS —y lo comprueba su editor—; el fichero existe
 * y se llama igual en los dos lenguajes para que la estructura del paquete sea
 * la misma y quien la conozca no tenga que reaprenderla.
 */
function contrato(name: string, p: PiezasVue, input: VuePackageInput): string {
  const lang = input.lang ?? 'ts';

  if (lang === 'js') {
    const propiedades: [string, string, string][] = [
      ...(p.itemType
        ? [[`${p.itemType}[]`, `[${ITEMS_PROP}]`, 'Collection to render. Defaults to the sample data.'] as [string, string, string]]
        : []),
      ...p.llamadas.map((c) => [
        callbackSignature(c, p.itemType),
        `[${c.name}]`,
        'Notifies the host application. Optional: without it nothing happens.',
      ] as [string, string, string]),
    ];

    return (p.itemType ? `${modelTypedef(input.model!)}\n\n` : '')
      + jsdocBloque([
        `Public contract of the ${name} component.`,
        '',
        `@typedef {object} ${name}Props`,
        ...propiedades.map(([t, n, d]) => `@property {${t}} ${n} ${d}`),
      ])
      // Sin una exportación el fichero no es un módulo y `import('./types')` no
      // resolvería nada.
      + '\n\nexport {};\n';
  }

  const props = p.campos.length > 0
    ? `/** Public contract of the ${name} component. */\n`
      + `export interface ${name}Props {\n${p.campos.join('\n')}\n}\n`
    // Un componente sin colección ni avisos no recibe nada, y decirlo con una
    // interfaz vacía sería peor que no decir nada: `export {}` deja el fichero
    // siendo un módulo y el paquete conserva su estructura.
    : 'export {};\n';

  return (p.modelo ? `${p.modelo}\n\n` : '') + props;
}

/** Para qué sirve cada fichero del paquete, en el índice del README. */
const ROLES: [RegExp, string][] = [
  [/^index\.[jt]s$/, 'punto de entrada: lo único que se importa desde fuera.'],
  [/\.vue$/, 'el componente: plantilla, script y enlace a sus estilos.'],
  [/^types\.[jt]s$/, 'el contrato: props y tipo del elemento de la colección.'],
  [/^constants\.[jt]s$/, 'los datos de ejemplo, para sustituir por los reales.'],
  [/^utils\.[jt]s$/, 'funciones puras: las reglas de validación de los campos.'],
  [/^styles\/theme\.css$/, 'el tema: color de marca, tipografía y forma.'],
  [/^styles\//, 'estilos del componente.'],
];

function readme(name: string, p: PiezasVue, input: VuePackageInput, paths: string[]): string {
  const lang = input.lang ?? 'ts';
  const version = `Vue ${input.dialecto}`;

  const ficheros = paths
    .map((ruta) => {
      const rol = ROLES.find(([patron]) => patron.test(ruta));
      return `- \`${ruta}\` — ${rol ? rol[1] : 'recurso del componente.'}`;
    })
    .join('\n');

  const filas = [
    ...(p.itemType
      ? [`| \`${ITEMS_PROP}\` | \`${p.itemType}[]\` | datos de ejemplo | Colección a pintar. |`]
      : []),
    ...p.llamadas.map(
      (c) => `| \`${c.name}\` | \`${callbackSignature(c, p.itemType)}\` | — | Aviso a la aplicación anfitriona. |`,
    ),
  ];

  const props = filas.length > 0
    ? ['| Prop | Tipo | Por defecto | Descripción |', '| --- | --- | --- |---|', ...filas].join('\n')
    : 'El componente no recibe props.';

  return `# ${name}

Componente de **${version}** generado con Visualiza.

## Ficheros

${ficheros}

## Uso

\`\`\`vue
<script setup${lang === 'ts' ? ' lang="ts"' : ''}>
import { ${name} } from './${name}';
</script>

<template>
  <${name} />
</template>
\`\`\`

## Props

${props}

## Requisitos

- ${version}${input.dialecto === 3 && lang === 'ts' ? ' — 3.3 o superior, que es desde cuando `defineProps` resuelve un tipo importado' : ''}.
- **Tailwind CSS configurado en el proyecto anfitrión**, con esta carpeta en su \`content\`:

\`\`\`js
// tailwind.config.js
export default {
  content: ['./src/**/*.{vue,js,ts}', './ruta/a/${name}/**/*.vue'],
};
\`\`\`

## Estilos

Las hojas se enlazan desde el propio SFC con \`<style src="…">\` y **sin \`scoped\`**:
el marcado usa utilidades de Tailwind, que son globales por definición, y el
atributo de ámbito no las alcanzaría.
`;
}
