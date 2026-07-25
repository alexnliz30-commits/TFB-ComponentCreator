import { useEffect, useMemo, useRef } from 'react';

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
}

export function ComponentSandbox({ sourceCode, themeCss, componentCss }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(
    () => buildIframeHtml(sourceCode, themeCss, componentCss),
    [sourceCode, themeCss, componentCss],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = html;
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Sandbox del componente evaluado"
      sandbox="allow-scripts"
      className="w-full h-full border-0 bg-white"
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

function buildIframeHtml(source: string, themeCss?: string, componentCss?: string): string {
  const { code, componentName } = prepareSource(source);
  const escaped = code
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');

  const extraStyles = [themeCss, componentCss]
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
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
  <style>body { margin: 16px; font-family: system-ui, sans-serif; }</style>
${extraStyles}
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
