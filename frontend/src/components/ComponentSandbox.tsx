import { useEffect, useMemo, useRef, useState } from 'react';
import { componentLayer } from '../builder/cascade';

interface Props {
  sourceCode: string;
  /**
   * Hojas extra que se inyectan antes del componente: el tema de la librería y
   * los estilos propios del componente.
   *
   * Son opcionales a propósito. El experimento SUS renderiza su corpus con este
   * mismo sandbox y debe seguir viéndose **exactamente igual** que el día que se
   * congeló: sin estas props, el HTML generado es byte a byte el de antes.
   */
  themeCss?: string;
  componentCss?: string;
  /**
   * El iframe crece hasta contener el componente entero.
   *
   * Para quien lo aloja en una caja con altura propia —las fichas del catálogo,
   * la previsualización por dispositivo— esto sobra: el marco manda y el
   * componente se adapta. Hace falta donde el sandbox se suelta en una columna
   * de altura automática, porque ahí `h-full` no resuelve contra nada y el
   * navegador aplica los 150 px por defecto de un elemento reemplazado.
   */
  autoAlto?: boolean;
}

export function ComponentSandbox({ sourceCode, themeCss, componentCss, autoAlto }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [alto, setAlto] = useState<number | null>(null);
  const html = useMemo(
    () => buildIframeHtml(sourceCode, themeCss, componentCss, autoAlto),
    [sourceCode, themeCss, componentCss, autoAlto],
  );

  // Solo se atienden los mensajes DE ESTE iframe: en el experimento puede haber
  // más de un sandbox montado, y todos publican en el mismo `window`.
  useEffect(() => {
    if (!autoAlto) return;
    function alRecibir(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.tipo !== 'vz-alto' || typeof e.data.alto !== 'number') return;
      setAlto(e.data.alto);
    }
    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [autoAlto]);

  // Al cambiar de componente se olvida la altura del anterior: si no, uno alto
  // dejaba un hueco enorme bajo el siguiente hasta que llegara su medida.
  useEffect(() => { setAlto(null); }, [html]);

  /**
   * Última plantilla escrita en el iframe.
   *
   * Escribir `srcdoc` DOS VECES SEGUIDAS con el mismo valor deja el documento
   * sin layout: monta, ejecuta sus scripts y responde al inspector, pero su
   * `<html>` mide 0×0 y no se pinta nada. La vista previa salía **en blanco sin
   * un solo error en consola**, que es la peor forma de fallar. Reproducido
   * fuera de la aplicación con un iframe pelado: una asignación funciona, dos en
   * el mismo tick no; separadas en el tiempo, tampoco fallan.
   *
   * Con el guardián, el efecto solo toca el iframe cuando el HTML cambia de
   * verdad, así que da igual cuántas veces se le invoque.
   */
  const escrito = useRef<string | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || escrito.current === html) return;
    escrito.current = html;
    iframe.srcdoc = html;
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Sandbox del componente evaluado"
      sandbox="allow-scripts"
      className={`w-full border-0 bg-white ${autoAlto ? '' : 'h-full'}`}
      style={autoAlto ? { height: alto ?? 150, transition: 'height 120ms' } : undefined}
    />
  );
}

// El código llega con formas variadas según su origen (corpus, builder, GPT-4o):
// `function App()`, `export function App()`, `export default function Card()`…
// El script del iframe va envuelto en un try/catch, donde `export` es error de
// sintaxis, así que se eliminan los export y se detecta el nombre del componente.
function prepareSource(source: string): { code: string; componentName: string } {
  const code = source
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|class|let|var)\b)/g, '');

  if (/\b(?:function|class)\s+App\b/.test(code) || /\bconst\s+App\s*[:=]/.test(code)) {
    return { code, componentName: 'App' };
  }
  const named =
    code.match(/(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/) ??
    code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/);
  return { code, componentName: named?.[1] ?? 'App' };
}

/** Neutraliza el cierre de etiqueta dentro de una hoja incrustada. */
function escapeStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
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
const STORAGE_SHIM = `
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
const ALTURA_SCRIPT = `  <script>
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

function buildIframeHtml(
  source: string,
  themeCss?: string,
  componentCss?: string,
  informaAltura = false,
): string {
  const { code, componentName } = prepareSource(source);
  const escaped = code
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');

  /*
    El orden importa y no es el de este array: lo fija la declaración de capas
    que emite cada hoja. El del componente va en la capa `vz-componente` y el
    global en `vz-global`, declarada después, así que el global manda aunque su
    `<style>` se escriba primero. Un componente se desvía a propósito marcando
    la declaración con `!propio` (ver `cascade.ts`).
  */
  const extraStyles = [themeCss, componentLayer(componentCss ?? '')]
    .filter((css): css is string => Boolean(css?.trim()))
    .map((css) => `  <style>${escapeStyle(css)}</style>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- Versiones fijadas a propósito: @babel/standalone sin fijar resolvía a una
       major nueva cuyo preset de React emite imports del JSX runtime automático,
       que dentro de un script text/babel son error de sintaxis y dejaban el
       sandbox en blanco. Misma lección que npx/tsc y tailwindcss@4. -->
${STORAGE_SHIM}
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
  <style>body { margin: 16px; font-family: system-ui, sans-serif; }</style>
${extraStyles}${informaAltura ? `\n${ALTURA_SCRIPT}` : ''}
</head>
<body>
  <div id="root"></div>
  <pre id="err" style="color:#b91c1c;background:#fee2e2;padding:8px;border-radius:4px;display:none;font-size:12px;"></pre>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useMemo, useRef, useCallback, useReducer, Fragment } = React;
    try {
      ${escaped}
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(${componentName}));
    } catch (err) {
      const pre = document.getElementById('err');
      pre.style.display = 'block';
      pre.textContent = (err && err.message) ? err.message : String(err);
    }
  </script>
</body>
</html>`;
}
