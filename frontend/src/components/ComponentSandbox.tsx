import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAngularHtml } from './sandbox-angular';
import { buildVueHtml } from './sandbox-vue';
import {
  ALTURA_SCRIPT, CAJA_ERROR, ESTILO_BASE, SCRIPT_FORMULARIO, SCRIPT_TAILWIND, STORAGE_SHIM,
  hojasExtra, runtimeDe,
} from './sandbox-shared';

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
  /**
   * Destino del que salió el código: decide QUÉ framework monta el iframe.
   *
   * Sin él se monta React, que es lo que hace el experimento SUS —su corpus es
   * de React y no sabe de destinos— y lo que garantiza que ese HTML no cambie.
   * El catálogo y el constructor sí lo pasan, porque un SFC de Vue ejecutado
   * como si fuera TSX no es una vista previa imperfecta: es un iframe en blanco.
   */
  target?: string;
}

export function ComponentSandbox({ sourceCode, themeCss, componentCss, autoAlto, target }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [alto, setAlto] = useState<number | null>(null);
  const html = useMemo(
    () => buildIframeHtml(sourceCode, themeCss, componentCss, autoAlto, target),
    [sourceCode, themeCss, componentCss, autoAlto, target],
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
      /*
        `allow-forms` solo donde hay un destino, es decir, en el constructor y
        en el catálogo. Sin él Chrome corta el envío antes de disparar el evento
        y la validación de un formulario no se podía probar (ver
        `SCRIPT_FORMULARIO`, que es quien evita que además navegue). El corpus
        del experimento no lo lleva: sus formularios no tienen manejador, así
        que el permiso no les daría nada y su documento sigue siendo byte a byte
        el que vieron los participantes.
      */
      sandbox={target ? 'allow-scripts allow-forms' : 'allow-scripts'}
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

/**
 * El documento del iframe, según el framework que haya que montar.
 *
 * Cada destino se previsualiza ejecutándose de verdad en el suyo; lo común
 * —aislamiento, hojas, caja de error, altura— está en `sandbox-shared`.
 */
export function buildIframeHtml(
  source: string,
  themeCss?: string,
  componentCss?: string,
  informaAltura = false,
  target?: string,
): string {
  const runtime = runtimeDe(target);
  if (runtime === 'angular') {
    return buildAngularHtml(target ?? 'angular22', source, themeCss, componentCss, informaAltura);
  }
  if (runtime === 'vue3' || runtime === 'vue2') {
    return buildVueHtml(runtime, source, themeCss, componentCss, informaAltura);
  }

  const { code, componentName } = prepareSource(source);
  const escaped = code
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');

  const extraStyles = hojasExtra(themeCss, componentCss);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- Versiones fijadas a propósito: @babel/standalone sin fijar resolvía a una
       major nueva cuyo preset de React emite imports del JSX runtime automático,
       que dentro de un script text/babel son error de sintaxis y dejaban el
       sandbox en blanco. Misma lección que npx/tsc y tailwindcss@4. -->
${STORAGE_SHIM}${target ? `
${SCRIPT_FORMULARIO}` : ''}
${SCRIPT_TAILWIND}
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
${ESTILO_BASE}
${extraStyles}${informaAltura ? `\n${ALTURA_SCRIPT}` : ''}
</head>
<body>
  <div id="root"></div>
  ${CAJA_ERROR}
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
