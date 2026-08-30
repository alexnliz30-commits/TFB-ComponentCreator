/**
 * Exportación del componente de Angular como paquete de carpeta.
 *
 * La vista de código enseña el componente en un fichero único, que es cómodo
 * para leerlo pero no es como se entrega un componente de Angular: la convención
 * del framework —y lo que espera cualquier proyecto generado con su CLI— es una
 * carpeta con la clase, la plantilla y los estilos en ficheros separados y
 * nombrados en `kebab-case.component.*`.
 *
 * Se emite desde las mismas `piezasAngular` que el fichero único, así que las dos
 * formas no pueden decir cosas distintas del mismo componente.
 */

import { piezasAngular, type AngularVersion } from './emit-angular';
import { toComponentName, THEME_FILE, type PackageFile, type PackageInput } from './emit-package';
import { itemTypeOf, usedCallbacks, type EmitInput } from './emit-react';
import { themeCss } from './theme';
import { componentLayer } from './cascade';
import { ITEMS_PROP } from './schema';

/** `ProductCatalog` → `product-catalog`, que es el nombre de fichero de Angular. */
export function toFileBase(nombre: string): string {
  return nombre
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export interface AngularPackageInput extends PackageInput {
  version: AngularVersion;
}

export function emitAngularPackage(input: AngularPackageInput): PackageFile[] {
  const name = toComponentName(input.name);
  const base = toFileBase(name);
  const piezas = piezasAngular(input, input.version);

  const stylesExt = input.stylesLanguage ?? 'css';
  const hasStyles = Boolean(input.customStyles?.trim());
  const files: PackageFile[] = [];

  if (!piezas) {
    // Sin bloques no hay componente que repartir en ficheros; se entrega el
    // esqueleto vacío antes que una carpeta a medio hacer.
    files.push({
      path: `${name}/${base}.component.ts`,
      contents: `import { Component } from '@angular/core';\n\n@Component({\n  selector: 'vz-${base}',\n  template: '<div class="p-4 text-slate-400">Vacío</div>',\n})\nexport class ${name} {}\n`,
      language: 'ts',
    });
    files.push({ path: `${name}/index.ts`, contents: `export { ${name} } from './${base}.component';\n`, language: 'ts' });
    return files;
  }

  /*
    `templateUrl` y `styleUrl`, no plantilla ni estilos en línea.

    Es la diferencia entre la vista de código y la carpeta: en línea se lee de
    una vez, en ficheros se edita con el resaltado y las herramientas de HTML y
    CSS que el editor ya tiene. `styleUrl` en singular es la forma vigente desde
    Angular 17; `styleUrls` sigue funcionando pero está desaconsejada.
  */
  const opciones = [
    `  selector: '${piezas.selector}',`,
    ...(piezas.onPush ? ['  changeDetection: ChangeDetectionStrategy.OnPush,'] : []),
    `  templateUrl: './${base}.component.html',`,
    ...(hasStyles ? [`  styleUrl: './${base}.component.${stylesExt}',`] : []),
  ];

  /*
    El contrato de datos y los datos de ejemplo salen a sus propios ficheros.

    En el fichero único viven delante de la clase porque no hay dónde ponerlos;
    en la carpeta son otra cosa: `types.ts` es lo que importa quien integra el
    componente para tipar lo que le va a pasar, y `constants.ts` es lo que
    sustituye por sus datos reales. Con los dos dentro del `.component.ts`, usar
    el tipo obligaba a importar del fichero de la clase, y cambiar un dato de
    ejemplo obligaba a abrirlo.

    Los nombres son los mismos que en React y en Vue a propósito: los ocho
    destinos entregan la misma estructura, así que conocer un paquete es
    conocerlos todos.
  */
  const importaModelo = piezas.modelo
    ? [
      `import type { ${itemTypeOf(input as EmitInput)} } from './types';`,
      `import { MOCK_ITEMS } from './constants';`,
    ].join('\n')
    : '';

  files.push({
    path: `${name}/${base}.component.ts`,
    contents: `${piezas.imports}\n`
      + (importaModelo ? `${importaModelo}\n` : '')
      + '\n'
      + `@Component({\n${opciones.join('\n')}\n})\n`
      + `export class ${piezas.nombre} {\n${piezas.cuerpoClase}\n}\n`,
    language: 'ts',
  });

  if (piezas.modelo) {
    files.push({
      path: `${name}/types.ts`,
      contents: `/** Public data contract of the ${name} component. */\n${piezas.modelo}\n`,
      language: 'ts',
    });
    files.push({
      path: `${name}/constants.ts`,
      contents: `import type { ${itemTypeOf(input as EmitInput)} } from './types';\n\n`
        + '/** Sample data. Replace with the real collection. */\n'
        + `export ${piezas.mock}\n`,
      language: 'ts',
    });
  }

  files.push({
    path: `${name}/${base}.component.html`,
    // La plantilla venía sangrada para vivir dentro del decorador; en su propio
    // fichero ese sangrado sobra y dejaría todo el HTML corrido a la derecha.
    contents: desangrar(piezas.plantilla) + '\n',
    language: 'html',
  });

  if (hasStyles) {
    files.push({
      path: `${name}/${base}.component.${stylesExt}`,
      contents: componentLayer(input.customStyles!),
      language: stylesExt,
    });
  }

  if (input.theme && !input.themeHref) {
    files.push({
      path: `${name}/styles/${THEME_FILE}`,
      contents: themeCss(input.theme),
      language: 'css',
    });
  }

  files.push({
    path: `${name}/index.ts`,
    // El tipo del elemento sale por la misma puerta que la clase: quien integra
    // el componente lo necesita para declarar la colección que le va a pasar, y
    // obligarle a importarlo de `./types` sería abrir un interior que el barril
    // existe para tapar.
    contents: `export { ${name} } from './${base}.component';\n`
      + (piezas.modelo ? `export type { ${itemTypeOf(input as EmitInput)} } from './types';\n` : ''),
    language: 'ts',
  });

  files.push({
    path: `${name}/README.md`,
    contents: readme(name, base, piezas.selector, input, hasStyles, stylesExt),
    language: 'md',
  });

  return files;
}

/** Quita el sangrado común, que solo existía para caber dentro del decorador. */
function desangrar(plantilla: string): string {
  const lineas = plantilla.split('\n');
  const minimo = lineas
    .filter((l) => l.trim())
    .reduce((min, l) => Math.min(min, l.length - l.trimStart().length), Infinity);
  if (!Number.isFinite(minimo) || minimo === 0) return plantilla;
  return lineas.map((l) => (l.trim() ? l.slice(minimo) : '')).join('\n');
}

function readme(
  name: string,
  base: string,
  selector: string,
  input: AngularPackageInput,
  hasStyles: boolean,
  stylesExt: string,
): string {
  const itemType = itemTypeOf(input as EmitInput);
  const llamadas = usedCallbacks(input.callbacks, JSON.stringify(input.blocks));

  const entradas = itemType
    ? `| \`${ITEMS_PROP}\` | \`input<${itemType}[]>\` | Colección a repetir. Trae datos de ejemplo por defecto. |`
    : '| — | — | El componente no recibe entradas. |';

  const salidas = llamadas.length > 0
    ? llamadas.map((c) => `| \`${c.name}\` | \`output<${c.passesItem && itemType ? itemType : 'void'}>\` | ${c.passesItem && itemType ? 'Avisa con el elemento de la fila.' : 'Avisa a la aplicación.'} |`).join('\n')
    : '| — | — | El componente no emite salidas. |';

  const ficheros = [
    `- \`${base}.component.ts\` — la clase, con sus señales, entradas y salidas.`,
    `- \`${base}.component.html\` — la plantilla.`,
    ...(itemType ? [
      `- \`types.ts\` — el contrato de datos: la interfaz \`${itemType}\`.`,
      '- `constants.ts` — los datos de ejemplo, para sustituir por los reales.',
    ] : []),
    ...(hasStyles ? [`- \`${base}.component.${stylesExt}\` — estilos propios del componente, ya encapsulados por Angular.`] : []),
    ...(input.theme && !input.themeHref ? [`- \`styles/${THEME_FILE}\` — el tema: color de marca, tipografía y forma, como variables CSS.`] : []),
    '- `index.ts` — punto de entrada de la carpeta.',
  ].join('\n');

  /*
    Angular no tiene `utils.ts`, y no es un olvido.

    En React y en Vue los validadores salen a su propio fichero porque son
    funciones puras y el marcado puede llamarlas desde el ámbito del módulo. La
    plantilla de Angular solo resuelve nombres contra la instancia del
    componente, así que un validador fuera de la clase compilaría y luego no
    existiría al renderizar: aquí viven como métodos, que es su sitio.
  */

  return `# ${name}

Componente de **Angular ${input.version}** generado con Visualiza. Standalone y con
señales: se importa directamente, sin declararlo en ningún módulo.

## Ficheros

${ficheros}

## Uso

\`\`\`ts
import { ${name} } from './${name}';

@Component({
  imports: [${name}],
  template: \`<${selector} />\`,
})
export class Pagina {}
\`\`\`

## Entradas

| Entrada | Tipo | Para qué |
| --- | --- | --- |
${entradas}

## Salidas

| Salida | Tipo | Cuándo |
| --- | --- | --- |
${salidas}

## Estilos

La plantilla usa utilidades de **Tailwind CSS**, que son globales por definición:
la encapsulación de vista de Angular no las alcanza, así que Tailwind tiene que
estar en el proyecto anfitrión con esta carpeta en su \`content\`.

\`\`\`js
// tailwind.config.js
export default {
  content: ['./src/**/*.{html,ts}', './ruta/a/${name}/**/*.html'],
};
\`\`\`
${input.theme && !input.themeHref ? `
El tema va en \`angular.json\` como hoja global, no en \`styleUrl\`: define variables
en \`:root\` y, encapsulado en el componente, no llegarían al resto de la aplicación.

\`\`\`json
"styles": ["src/styles.css", "ruta/a/${name}/styles/${THEME_FILE}"]
\`\`\`
` : ''}`;
}
