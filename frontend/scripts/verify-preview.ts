/**
 * Escribe, para cada componente y cada destino, la página que monta su sandbox.
 *
 * El documento lo emite el MISMO `buildIframeHtml` que usa la aplicación, y se
 * monta **dentro de un iframe con el mismo `sandbox`**. Las dos cosas importan
 * por el mismo motivo: en cuanto la verificación deja de parecerse al sitio
 * real, deja de verificarlo. La primera versión de este guión abría el
 * documento como página suelta y daba los 8 destinos por buenos mientras en la
 * aplicación **ningún formulario validaba**: el iframe cortaba el `submit` por
 * no tener `allow-forms`, y una página de primer nivel no tiene esa
 * restricción. Lo encontró una prueba a mano; no debe volver a hacer falta.
 *
 * El que las ejecuta y comprueba es `verify-preview.mjs`.
 *
 * Uso: `npm run verify:preview`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_GLOBAL_CSS, SEED_LIBRARY, SEED_THEME } from '../src/libraries/seed-library';
import { availableEmitters } from '../src/builder/emitters';
import { buildIframeHtml } from '../src/components/ComponentSandbox';
import { themeCss } from '../src/builder/theme';

const outDir = process.argv[2] ?? 'dist-preview-check';
mkdirSync(outDir, { recursive: true });

/*
  Con el tema y la hoja global de la semilla, no pelados.

  El componente se previsualiza dentro de una cascada —tema, hoja de la
  librería, hoja propia— y el sandbox tiene que montarla igual en los ocho
  destinos. Verificarlo sin estilos comprobaría medio camino.
*/
const tema = themeCss(SEED_THEME, 'body', SEED_GLOBAL_CSS, true);

const casos: Array<{ fichero: string; componente: string; destino: string }> = [];

for (const componente of SEED_LIBRARY.components) {
  for (const emisor of availableEmitters()) {
    const code = emisor.emit({
      blocks: componente.blocks,
      rootIds: componente.rootIds,
      vars: componente.stateVars,
      name: componente.name,
    });
    const fichero = `${componente.name}.${emisor.key}.html`;
    const documento = buildIframeHtml(code, tema, componente.customStyles ?? '', false, emisor.key);
    writeFileSync(join(outDir, fichero), paginaAnfitriona(documento));
    casos.push({ fichero, componente: componente.name, destino: emisor.key });
  }
}

writeFileSync(join(outDir, 'casos.json'), JSON.stringify(casos, null, 2));
console.log(`${casos.length} documentos de sandbox escritos (${SEED_LIBRARY.components.length} componentes × ${availableEmitters().length} destinos)`);

/**
 * La página que aloja el sandbox, con el mismo iframe que monta la aplicación.
 *
 * Copia tres cosas de `ComponentSandbox` porque las tres cambian lo que el
 * documento puede hacer: los permisos del `sandbox`, que se asigne por `srcdoc`
 * y que el documento viaje como texto y no como atributo. El HTML se pasa en
 * JSON para no tener que escapar nada a mano, igual que hace el propio sandbox
 * con el código del componente.
 */
function paginaAnfitriona(documento: string): string {
  const json = JSON.stringify(documento).replace(/<\//g, '<\\/');
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head>
<body>
  <iframe id="vz-marco" title="Sandbox del componente evaluado" sandbox="allow-scripts allow-forms"></iframe>
  <script type="application/json" id="vz-documento">${json}</script>
  <script>
    document.getElementById('vz-marco').srcdoc =
      JSON.parse(document.getElementById('vz-documento').textContent);
  </script>
</body>
</html>`;
}
