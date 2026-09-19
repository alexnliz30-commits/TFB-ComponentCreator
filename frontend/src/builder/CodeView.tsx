import { useState } from 'react';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { availableEmitters, currentCode, getEmitter, packageFor } from './emitters';
import { toComponentName, type PackageFile } from './emit-package';
import { downloadZip } from './zip';
import { compileStylesheet, type CompileStylesheetResponse } from '../api/components';
import type { StylesLanguage } from './types';

type View = 'component' | 'package' | 'styles';

/**
 * Vista de código.
 *
 * Distingue dos artefactos que antes se confundían:
 *   - **Componente**: la forma `export function App()` que verifica el harness
 *     y previsualiza el sandbox. Editable a mano.
 *   - **Paquete**: la carpeta lista para llevarse a otro proyecto, con nombre,
 *     props y punto de entrada. Derivada, por eso es de solo lectura.
 */
export function CodeView() {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [view, setView] = useState<View>('component');
  const [activeFile, setActiveFile] = useState(0);
  const [stylesheet, setStylesheet] = useState<CompileStylesheetResponse | null>(null);
  const [generating, setGenerating] = useState(false);

  const emitter = getEmitter(state.framework);
  const code = currentCode(state);

  const files = packageFor(state.framework, {
    blocks: state.blocks,
    rootIds: state.rootIds,
    vars: state.stateVars,
    model: state.model,
    callbacks: state.callbacks,
    // El paquete se emite en el lenguaje del destino elegido, no siempre en TS.
    lang: emitter.lang,
    name: state.componentName,
    theme: state.theme,
    customStyles: state.customStyles,
    stylesLanguage: state.stylesLanguage,
    generatedCss: stylesheet?.css ?? undefined,
  });
  const file = files ? files[Math.min(activeFile, files.length - 1)] : null;

  // La hoja se pide a demanda: compilarla invoca Tailwind en el backend y sería
  // absurdo hacerlo en cada pulsación de tecla del lienzo.
  async function generateStylesheet() {
    setGenerating(true);
    try {
      const component = files?.find((f) => f.language === 'tsx' || f.language === 'jsx');
      const res = await compileStylesheet({
        markup: component?.contents ?? code,
        customStyles: state.customStyles || undefined,
        stylesLanguage: state.stylesLanguage,
      });
      setStylesheet(res);
    } catch (err) {
      setStylesheet({
        css: null,
        generated: false,
        toolchainAvailable: true,
        diagnostics: err instanceof Error ? err.message : 'Error desconocido',
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117] min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 shrink-0">
        <div className="flex gap-1">
          {([
            ['component', 'Componente'],
            ['package', 'Paquete'],
            ['styles', 'Estilos'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors
                ${view === key ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={state.framework}
            onChange={(e) => dispatch({ type: 'SET_FRAMEWORK', framework: e.target.value })}
            title="Tecnología del código emitido desde el mismo árbol de bloques"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
          >
            {availableEmitters().map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
          {!emitter.verifiable && (
            <span className="text-[10px] text-amber-500/80" title="El harness de compilación solo cubre React + TypeScript. La vista previa sí ejecuta este destino: lo que no hay es una comprobación estática antes de mirarla">
              sin verificación estática
            </span>
          )}
        </div>
      </div>

      {view === 'component' && (
        <textarea
          value={code}
          onChange={(e) => dispatch({ type: 'SET_CODE', code: e.target.value })}
          className="flex-1 bg-transparent text-[#c9d1d9] p-5 text-[13px] font-mono leading-relaxed resize-none focus:outline-none selection:bg-blue-800/40"
          spellCheck={false}
        />
      )}

      {view === 'styles' && <StylesEditor />}

      {/*
        Cada destino emite su propia carpeta: React una de JSX/TSX con su hook,
        Vue una con el SFC y sus ficheros hermanos, Angular una de
        `*.component.ts|html|css`. Los ocho la tienen; este aviso se queda para
        el próximo destino que se añada, porque enseñarle la carpeta de React
        sería TSX diciendo que es otra cosa —la misma clase de mentira que el
        esquema único vino a eliminar del lienzo.
      */}
      {view === 'package' && !files && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
          <p className="text-sm text-slate-400">
            {emitter.label} todavía no se entrega como carpeta.
          </p>
          <p className="text-xs text-slate-500 max-w-md leading-relaxed">
            La pestaña Componente sí muestra el código de {emitter.label} generado desde
            este mismo árbol de bloques.
          </p>
        </div>
      )}

      {view === 'package' && files && file && (
        <PackageView
          files={files}
          active={file}
          activeIndex={files.indexOf(file)}
          onSelect={setActiveFile}
          stylesheet={stylesheet}
          onGenerate={generateStylesheet}
          generating={generating}
        />
      )}
    </div>
  );
}

function StylesEditor() {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 shrink-0">
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Lenguaje</span>
        {(['css', 'scss'] as StylesLanguage[]).map((lang) => (
          <button
            key={lang}
            onClick={() => dispatch({ type: 'SET_CUSTOM_STYLES', styles: state.customStyles, language: lang })}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors
              ${state.stylesLanguage === lang ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
        {state.stylesLanguage === 'scss' && (
          <span className="text-[10px] text-amber-500/80 ml-1">
            El SASS se entrega sin compilar: no se previsualiza en el sandbox.
          </span>
        )}
      </div>
      <textarea
        value={state.customStyles}
        onChange={(e) => dispatch({ type: 'SET_CUSTOM_STYLES', styles: e.target.value })}
        placeholder={'/* Estilos propios del componente, además de las utilidades Tailwind.\n   Se exportan junto al componente en su carpeta. */'}
        className="flex-1 bg-transparent text-[#c9d1d9] p-5 text-[13px] font-mono leading-relaxed resize-none focus:outline-none selection:bg-blue-800/40 placeholder-slate-600"
        spellCheck={false}
      />
    </div>
  );
}

/**
 * Estado de la hoja autocontenida.
 *
 * Distingue tres situaciones que no deben confundirse: no intentado, generado, y no
 * generado por falta de Node en el backend. En este último caso el paquete sigue
 * siendo válido, pero depende de Tailwind en el proyecto destino, y decirlo es
 * preferible a entregar una hoja vacía que aparente que no hacen falta estilos.
 */
function StylesheetStatus({ stylesheet, generating, onGenerate }: {
  stylesheet: CompileStylesheetResponse | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  if (generating) {
    return (
      <div className="px-2 py-1.5 rounded bg-slate-800 text-[10px] text-slate-400 animate-pulse">
        Compilando Tailwind…
      </div>
    );
  }

  if (stylesheet?.generated) {
    return (
      <div className="px-2 py-1.5 rounded bg-green-950/50 border border-green-900 text-[10px] text-green-300 leading-snug">
        ✓ Paquete autocontenido: funciona sin Tailwind en destino.
      </div>
    );
  }

  if (stylesheet && !stylesheet.generated) {
    return (
      <div className="space-y-1.5">
        <div className="px-2 py-1.5 rounded bg-amber-950/50 border border-amber-900 text-[10px] text-amber-300 leading-snug">
          {stylesheet.toolchainAvailable
            ? 'No se pudo generar la hoja.'
            : 'Sin Node en el backend: el paquete requerirá Tailwind en destino.'}
          {stylesheet.diagnostics && (
            <span className="block mt-1 text-amber-400/70 break-words">{stylesheet.diagnostics}</span>
          )}
        </div>
        <button
          onClick={onGenerate}
          className="w-full px-2 py-1.5 rounded bg-slate-800 text-slate-300 text-[11px] hover:bg-slate-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onGenerate}
      title="Resuelve las utilidades Tailwind a CSS real para que el componente funcione en cualquier web"
      className="w-full px-2 py-1.5 rounded bg-slate-800 text-slate-300 text-[11px] hover:bg-slate-700"
    >
      Generar CSS autónomo
    </button>
  );
}

function PackageView({ files, active, activeIndex, onSelect, stylesheet, onGenerate, generating }: {
  files: PackageFile[];
  active: PackageFile;
  activeIndex: number;
  onSelect: (i: number) => void;
  stylesheet: CompileStylesheetResponse | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const name = toComponentName(state.componentName);

  /** Descarga un fichero suelto, con su nombre de hoja (sin la ruta). */
  function download(file: PackageFile) {
    const blob = new Blob([file.contents], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() ?? file.path;
    a.click();
    URL.revokeObjectURL(url);
  }

  /*
    La carpeta se entrega como zip, no como N descargas sueltas.

    Antes cada fichero bajaba por su cuenta con la ruta aplanada a guiones
    (`ProductCatalog-hooks-useProductCatalog.js`), porque el navegador no crea
    carpetas al descargar. El resultado era un paquete que no se podía usar:
    los imports del componente apuntan a `./hooks/…` y `./styles/theme.css`, así
    que quien lo recibía tenía que reconstruir a mano el árbol de directorios
    adivinándolo desde los guiones. El zip conserva las rutas tal y como las
    emite `emitPackage`, que es la única forma de que el paquete compile en
    destino sin tocarlo.
  */
  function downloadFolder() {
    downloadZip(`${name}.zip`, files.map((f) => ({ path: f.path, contents: f.contents })));
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-56 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-2.5 border-b border-slate-800">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Nombre</span>
          <input
            value={state.componentName}
            onChange={(e) => dispatch({ type: 'SET_COMPONENT_NAME', name: e.target.value })}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">{name}/</p>
        </div>
        {files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => onSelect(i)}
            className={`text-left px-3 py-1.5 text-[11px] font-mono truncate transition-colors
              ${i === activeIndex ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {f.path.split('/').slice(1).join('/')}
          </button>
        ))}
        <div className="mt-auto p-2.5 space-y-2 shrink-0">
          <StylesheetStatus stylesheet={stylesheet} generating={generating} onGenerate={onGenerate} />
          <button
            onClick={downloadFolder}
            title={`Descarga ${name}.zip con la carpeta completa y sus subcarpetas`}
            className="w-full px-2 py-1.5 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700"
          >
            Descargar carpeta (.zip)
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-800 shrink-0">
          <span className="text-[11px] font-mono text-slate-400 truncate">{active.path}</span>
          <button
            onClick={() => download(active)}
            className="text-[11px] text-slate-500 hover:text-slate-300 shrink-0 ml-2"
          >
            Descargar
          </button>
        </div>
        <pre className="flex-1 overflow-auto text-[#c9d1d9] p-5 text-[13px] font-mono leading-relaxed">
          {active.contents}
        </pre>
      </div>
    </div>
  );
}
