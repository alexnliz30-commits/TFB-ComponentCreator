/**
 * Estilos GLOBALES de una librería, editados donde pertenecen: en la librería.
 *
 * Antes el tema vivía únicamente en el proyecto local del navegador, de modo que
 * abrir la misma librería desde otro equipo la pintaba con el genérico. Aquí se
 * edita el que viaja con ella y lo comparten todos sus componentes.
 *
 * Lo que se defina aquí MANDA sobre los estilos propios de cada componente. Un
 * componente solo se desvía marcando la declaración con `!propio`, para que
 * salirse del kit sea una decisión escrita y no un accidente.
 */

import { useEffect, useState } from 'react';
import { ThemeEditor } from '../builder/ThemePanel';
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../builder/theme';
import { DEVIATION_MARK, countDeviations } from '../builder/cascade';
import { updateLibraryStyles, type LibrarySummary } from '../api/libraries';

interface Props {
  library: LibrarySummary;
  onSaved: (library: LibrarySummary) => void;
  onClose: () => void;
}

export function LibraryStylesPanel({ library, onSaved, onClose }: Props) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [globalCss, setGlobalCss] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Se resiembra al cambiar de librería: si no, el panel seguiría enseñando el
  // tema de la anterior y guardarlo se lo habría copiado encima a esta.
  useEffect(() => {
    setTheme(library.themeJson ? safeTheme(library.themeJson) : DEFAULT_THEME);
    setGlobalCss(library.globalStyles ?? '');
    setDirty(false);
    setError(null);
  }, [library.id, library.themeJson, library.globalStyles]);

  const desvios = countDeviations(globalCss);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateLibraryStyles(library.id, {
        themeJson: JSON.stringify(theme),
        // Cadena vacía es «déjala sin nada», que es distinto de no enviarla.
        globalStyles: globalCss,
      });
      setDirty(false);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los estilos');
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-slate-900 flex flex-col min-h-0">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Estilos globales
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar el panel de estilos globales"
          className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        <ThemeEditor
          theme={theme}
          onChange={(next) => { setTheme(next); setDirty(true); }}
        >
          <div className="space-y-2 pt-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Hoja global
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              CSS que se aplica a todos los componentes de la librería. Gana a la
              hoja propia de cada uno; para que un componente se desvíe a
              propósito, su declaración debe llevar{' '}
              <code className="text-slate-300">{DEVIATION_MARK}</code>.
            </p>
            <textarea
              value={globalCss}
              onChange={(e) => { setGlobalCss(e.target.value); setDirty(true); }}
              spellCheck={false}
              rows={10}
              aria-label="Hoja de estilos global de la librería"
              placeholder={'.visualiza-component {\n  letter-spacing: 0.01em;\n}'}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-[11px] font-mono
                text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
            />
            {desvios > 0 && (
              <p className="text-[11px] text-amber-400/90 leading-relaxed">
                Esta hoja es la global: {DEVIATION_MARK} aquí no tiene sentido
                ({desvios} {desvios === 1 ? 'declaración' : 'declaraciones'}). La
                marca es para que un componente se desvíe de esta.
              </p>
            )}
          </div>
        </ThemeEditor>
      </div>

      <footer className="px-4 py-3 border-t border-slate-800 shrink-0 space-y-2">
        {error && <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="w-full py-1.5 rounded-md text-xs font-medium transition-colors
            bg-blue-600 text-white hover:bg-blue-500
            disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando…' : dirty ? 'Guardar estilos' : 'Guardado'}
        </button>
      </footer>
    </aside>
  );
}

/** Un tema ilegible no puede tumbar el catálogo. */
function safeTheme(json: string): Theme {
  try {
    return normalizeTheme(JSON.parse(json));
  } catch {
    return DEFAULT_THEME;
  }
}
