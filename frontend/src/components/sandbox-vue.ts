/**
 * Sandbox de Vue: compila el SFC **en el navegador** y lo monta.
 *
 * Un `.vue` no es JavaScript: hay que separar sus bloques, compilar la
 * plantilla a una función de render y, en Vue 3, resolver las variables que
 * `<script setup>` expone. Eso lo hace `@vue/compiler-sfc`, que es una
 * herramienta de construcción y no está pensada para el navegador; el paquete
 * `vue3-sfc-loader` es exactamente ese compilador empaquetado para correr aquí,
 * y trae también la versión de Vue 2. Se usa esa —en vez de reescribir el SFC a
 * un objeto de opciones nosotros— porque reescribirlo sería previsualizar OTRA
 * cosa: lo que se ve tiene que salir del mismo texto que se descarga.
 *
 * El lenguaje no aparece por ninguna parte y no es un olvido: el cargador
 * entiende `lang="ts"` y le quita los tipos igual que haría el proyecto de
 * destino, así que el SFC de TypeScript y el de JavaScript se previsualizan por
 * el mismo camino. Lo único que separa los dos dialectos es el montaje, que en
 * Vue 2 es `new Vue(...).$mount(...)` y en Vue 3 `createApp(...).mount(...)`.
 */

import {
  ALTURA_SCRIPT, CAJA_ERROR, ESTILO_BASE, ID_FUENTE, SCRIPT_ERROR, SCRIPT_FORMULARIO, SCRIPT_TAILWIND,
  STORAGE_SHIM, bloqueFuente, hojasExtra,
} from './sandbox-shared';

/**
 * Versiones fijadas, por la misma razón que las de React.
 *
 * Dejar que el CDN resuelva la mayor ya se llevó por delante una vista previa
 * entera cuando Babel saltó de versión: aquí el riesgo es peor, porque el
 * cargador y el runtime de Vue tienen que entenderse entre ellos.
 */
const VUE3 = 'https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js';
const VUE2 = 'https://unpkg.com/vue@2.7.16/dist/vue.min.js';
const CARGADOR = 'https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9.5/dist';

interface Dialecto {
  /** El runtime de Vue, que el cargador recibe como módulo `vue`. */
  runtime: string;
  /** El cargador del SFC y el nombre con el que se publica en `window`. */
  cargador: string;
  global: string;
  /** Cómo se monta un componente ya compilado en este dialecto. */
  montaje: string;
}

const DIALECTOS: Record<'vue3' | 'vue2', Dialecto> = {
  vue3: {
    runtime: VUE3,
    cargador: `${CARGADOR}/vue3-sfc-loader.js`,
    global: 'vue3-sfc-loader',
    montaje: "Vue.createApp(componente).mount('#root');",
  },
  vue2: {
    runtime: VUE2,
    cargador: `${CARGADOR}/vue2-sfc-loader.js`,
    global: 'vue2-sfc-loader',
    // `$mount` sustituye el elemento por el componente en vez de meterlo
    // dentro, que es como Vue 2 ha montado siempre.
    montaje: "new Vue({ render: function (h) { return h(componente); } }).$mount('#root');",
  },
};

export function buildVueHtml(
  dialecto: 'vue3' | 'vue2',
  source: string,
  themeCss?: string,
  componentCss?: string,
  informaAltura = false,
): string {
  const vue = DIALECTOS[dialecto];
  const extraStyles = hojasExtra(themeCss, componentCss);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${STORAGE_SHIM}
${SCRIPT_ERROR}
${SCRIPT_FORMULARIO}
${SCRIPT_TAILWIND}
  <script src="${vue.runtime}"></script>
  <script src="${vue.cargador}"></script>
${ESTILO_BASE}
${extraStyles}${informaAltura ? `\n${ALTURA_SCRIPT}` : ''}
</head>
<body>
  <div id="root"></div>
  ${CAJA_ERROR}
${bloqueFuente(source)}
  <script>
    (function () {
      var fuente = JSON.parse(document.getElementById('${ID_FUENTE}').textContent);
      var cargador = window['${vue.global}'];
      if (!cargador) {
        vzError('No se pudo cargar el compilador de ${dialecto === 'vue3' ? 'Vue 3' : 'Vue 2'}. Comprueba la conexión.');
        return;
      }
      cargador.loadModule('/Componente.vue', {
        // El \`import { ref } from 'vue'\` del SFC se resuelve contra el runtime
        // ya cargado: no hay red que valga dentro del iframe para eso.
        moduleCache: { vue: Vue },
        getFile: function () {
          return { getContentData: function () { return fuente; }, type: '.vue' };
        },
        // El bloque <style> del SFC, si lo hubiera. Va al documento y no a la
        // capa del componente: es del propio fichero, no de la cascada.
        addStyle: function (texto) {
          var hoja = document.createElement('style');
          hoja.textContent = texto;
          document.head.appendChild(hoja);
        },
        log: function (tipo, titulo, detalle) {
          if (tipo === 'error') vzError(titulo + (detalle ? ': ' + detalle : ''));
        }
      }).then(function (componente) {
        ${vue.montaje}
      }).catch(vzError);
    })();
  </script>
</body>
</html>`;
}
