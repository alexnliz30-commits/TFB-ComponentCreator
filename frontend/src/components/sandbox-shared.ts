/**
 * Piezas comunes a los sandboxes de previsualización.
 *
 * Un componente se previsualiza **ejecutándolo en su propio framework**, no
 * traduciéndolo a otro: el iframe de React monta React, el de Vue compila el
 * SFC y el de Angular arranca la aplicación. Lo que cambia entre ellos es el
 * arranque; todo lo demás —el aislamiento, las hojas de estilo, la caja de
 * error, la altura automática— es lo mismo tres veces, y vive aquí.
 *
 * Estas constantes salieron de `ComponentSandbox` tal cual, **sin tocar ni un
 * byte**: el corpus del experimento SUS se renderiza con el sandbox de React y
 * tiene que verse exactamente igual que el día que se congeló.
 */

import { componentLayer } from '../builder/cascade';

/**
 * El runtime que hay que montar para previsualizar un destino.
 *
 * No es lo mismo que el destino: `react` y `react-js` se previsualizan igual
 * —el lenguaje desaparece al ejecutar— y lo mismo pasa con los dos dialectos de
 * cada Vue. Lo que de verdad distingue un sandbox de otro son estos cuatro.
 */
export type SandboxRuntime = 'react' | 'vue3' | 'vue2' | 'angular';

/**
 * Runtime de un destino del constructor.
 *
 * Cae a React cuando no se le dice nada, que es lo que hacen el experimento y
 * cualquier otro sitio que solo tenga el código delante.
 */
export function runtimeDe(target?: string): SandboxRuntime {
  if (!target) return 'react';
  if (target.startsWith('angular')) return 'angular';
  if (target.startsWith('vue3')) return 'vue3';
  if (target.startsWith('vue2')) return 'vue2';
  return 'react';
}

/** Neutraliza el cierre de etiqueta dentro de una hoja incrustada. */
export function escapeStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

/**
 * Las hojas extra del documento, ya escritas como etiquetas.
 *
 * El orden importa y no es el de este array: lo fija la declaración de capas
 * que emite cada hoja. El del componente va en la capa `vz-componente` y el
 * global en `vz-global`, declarada después, así que el global manda aunque su
 * `<style>` se escriba primero. Un componente se desvía a propósito marcando
 * la declaración con `!propio` (ver `cascade.ts`).
 */
export function hojasExtra(themeCss?: string, componentCss?: string): string {
  return [themeCss, componentLayer(componentCss ?? '')]
    .filter((css): css is string => Boolean(css?.trim()))
    .map((css) => `  <style>${escapeStyle(css)}</style>`)
    .join('\n');
}

/**
 * Almacén de mentira para el iframe, inyectado antes que ningún otro script.
 *
 * El sandbox es `allow-scripts` SIN `allow-same-origin`, así que el documento
 * tiene origen opaco y **leer `window.localStorage` lanza una excepción**, no
 * devuelve `null`. Las herramientas que llegan por CDN lo consultan para
 * cachear, la excepción sube sin capturar y el script muere ahí: cuando el que
 * muere es Babel, el bloque `text/babel` de abajo no se transforma nunca y la
 * vista previa se queda **en blanco sin decir por qué**.
 *
 * Añadir `allow-same-origin` lo arreglaría y sería un error: junto a
 * `allow-scripts` permite que el propio documento se quite el aislamiento, y
 * aquí dentro corre código generado por una IA mientras en ese mismo origen
 * viven la sesión del diseñador y los proyectos del usuario. Se le da un almacén
 * en memoria y se acabó.
 *
 * Va como cadena aparte porque dentro de la plantilla no puede llevar acentos
 * graves: cerrarían el literal.
 */
export const STORAGE_SHIM = `
  <script>
    (function () {
      var almacen = {};
      var falso = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
        setItem: function (k, v) { almacen[k] = String(v); },
        removeItem: function (k) { delete almacen[k]; },
        clear: function () { almacen = {}; },
        key: function (i) { return Object.keys(almacen)[i] || null; },
        get length() { return Object.keys(almacen).length; }
      };
      ['localStorage', 'sessionStorage'].forEach(function (nombre) {
        try {
          void window[nombre];
        } catch (e) {
          try {
            Object.defineProperty(window, nombre, { value: falso, configurable: true });
          } catch (e2) { /* nada que hacer */ }
        }
      });
    })();
  </script>`;

/**
 * Informa al anfitrión de lo que mide el componente, para que el iframe pueda
 * crecer hasta contenerlo entero.
 *
 * Va por `postMessage` y no leyendo `contentDocument` porque el sandbox no
 * lleva `allow-same-origin`: el documento es de origen opaco y el anfitrión no
 * puede inspeccionarlo. Al revés sí se puede, que es justo lo que se necesita.
 *
 * Se inyecta SOLO cuando se pide altura automática: sin la opción, el HTML
 * generado sigue siendo byte a byte el de antes.
 */
export const ALTURA_SCRIPT = `  <script>
    (function () {
      var ultimo = 0;
      function avisar() {
        var alto = Math.ceil(document.documentElement.scrollHeight);
        if (alto === ultimo) return;
        ultimo = alto;
        parent.postMessage({ tipo: 'vz-alto', alto: alto }, '*');
      }
      // El contenido se monta con Babel en un script posterior, y las fuentes o
      // el CSS de Tailwind llegan más tarde todavía: una sola medida saldría
      // corta. El observador cubre además los cambios de estado del componente.
      if (window.ResizeObserver) new ResizeObserver(avisar).observe(document.documentElement);
      window.addEventListener('load', avisar);
      setTimeout(avisar, 300);
      setTimeout(avisar, 1200);
    })();
  </script>`;

/** La caja roja donde acaba lo que falle, igual en los cuatro runtimes. */
export const CAJA_ERROR =
  '<pre id="err" style="color:#b91c1c;background:#fee2e2;padding:8px;border-radius:4px;display:none;font-size:12px;"></pre>';

/** La hoja mínima del documento: el margen y la tipografía del iframe. */
export const ESTILO_BASE = '  <style>body { margin: 16px; font-family: system-ui, sans-serif; }</style>';

/** Tailwind por CDN, fijado: los bloques se describen con sus clases. */
export const SCRIPT_TAILWIND = '  <script src="https://cdn.tailwindcss.com/3.4.16"></script>';

/**
 * Recogedor de errores para los runtimes que arrancan de forma asíncrona.
 *
 * React se monta dentro de un `try` y puede enseñar ahí mismo lo que falle. Vue
 * compila el SFC y Angular carga sus módulos: los dos terminan **después** de
 * que el script haya acabado, así que un `try` no los ve. Sin esto, un error de
 * compilación de plantilla dejaba el iframe en blanco y en silencio, que es la
 * peor forma de fallar y justo lo que esta vista viene a evitar.
 */
export const SCRIPT_ERROR = `  <script>
    function vzError(motivo) {
      var pre = document.getElementById('err');
      if (!pre) return;
      var texto = motivo && (motivo.message || motivo.reason) ? (motivo.message || motivo.reason) : String(motivo);
      pre.style.display = 'block';
      pre.textContent = texto;
    }
    window.addEventListener('error', function (ev) { vzError(ev.error || ev.message); });
    window.addEventListener('unhandledrejection', function (ev) { vzError(ev.reason); });
  </script>`;

/**
 * Deja que el formulario avise, pero no que navegue.
 *
 * El iframe se aisla con `allow-scripts`, y sin `allow-forms` Chrome corta el
 * envío **antes de disparar el evento**: el `submit` no llega nunca, así que el
 * manejador del componente no se ejecutaba y validar un formulario en la vista
 * previa no hacía absolutamente nada. Pasaba en los cuatro runtimes, React
 * incluido, y no se veía porque en la consola del iframe —que no es la de la
 * página— solo quedaba un «Blocked form submission».
 *
 * Con el permiso puesto aparece el problema contrario: un formulario **sin**
 * manejador —los hay, y son legítimos— se enviaría de verdad y dejaría el
 * iframe en blanco. De ahí este guión: escucha en el documento, que es el
 * último de la cadena —React delega en su raíz, y Vue y Angular atan al propio
 * `<form>`, los dos por debajo—, así que el componente ya ha hecho lo suyo
 * cuando aquí se corta la navegación. Un formulario sin manejador se queda
 * exactamente como estaba.
 */
export const SCRIPT_FORMULARIO = `  <script>
    document.addEventListener('submit', function (ev) { ev.preventDefault(); });
  </script>`;

/** Identificador del bloque que lleva el código fuente dentro del documento. */
export const ID_FUENTE = 'vz-fuente';

/**
 * El código fuente incrustado como JSON, para leerlo luego con `JSON.parse`.
 *
 * El SFC de Vue y el componente de Angular llevan dentro comillas de los tres
 * tipos y acentos graves, así que meterlos en un literal de JavaScript obliga a
 * escapar a mano justo lo que el emisor acaba de escribir. Como JSON no hay nada
 * que escapar salvo el cierre de etiqueta, y `<\/script` es una secuencia
 * **válida en JSON** que se lee de vuelta como `</script`: el texto que llega al
 * compilador es exactamente el que se ve en la pestaña Código.
 */
export function bloqueFuente(source: string): string {
  const json = JSON.stringify(source).replace(/<\//g, '<\\/');
  return `  <script type="application/json" id="${ID_FUENTE}">${json}</script>`;
}
