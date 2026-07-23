import { useCallback, useEffect, useState } from 'react';
import {
  createLibrary, listLibraries, getLibrary, saveComponent, deleteComponent, fileExtension,
  FRAMEWORK_LABELS,
  type CodeLanguage, type LibraryDetail, type LibrarySummary, type SavedComponent, type TargetFramework,
} from '../api/libraries';
import { generateComponent, type ComponentType } from '../api/components';
import { ComponentSandbox } from '../components/ComponentSandbox';

const COMPONENT_TYPES: { value: ComponentType; label: string }[] = [
  { value: 'RegistrationForm', label: 'Formulario de registro' },
  { value: 'DataTable', label: 'Tabla de datos' },
  { value: 'StatsPanel', label: 'Panel de estadísticas' },
  { value: 'NavigationMenu', label: 'Menú de navegación' },
  { value: 'ProductCard', label: 'Tarjeta de producto' },
];

export function LibrariesView() {
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshLibraries = useCallback(async () => {
    try {
      setLibraries(await listLibraries());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando librerías');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      setDetail(await getLibrary(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando la librería');
    }
  }, []);

  useEffect(() => { refreshLibraries(); }, [refreshLibraries]);
  useEffect(() => {
    if (selectedId) refreshDetail(selectedId);
    else setDetail(null);
  }, [selectedId, refreshDetail]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Librerías de componentes</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Colecciones por tecnología y lenguaje</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <p className="text-xs text-slate-400 px-1">Cargando…</p>}
          {!loading && libraries.length === 0 && (
            <p className="text-xs text-slate-400 px-1">Aún no hay librerías. Crea la primera abajo.</p>
          )}
          {libraries.map((lib) => (
            <button
              key={lib.id}
              onClick={() => setSelectedId(lib.id)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors
                ${selectedId === lib.id ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800 truncate">{lib.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{lib.componentCount} comp.</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <FrameworkBadge framework={lib.framework} />
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {lib.language === 'TypeScript' ? 'TS' : 'JS'}
                </span>
              </div>
            </button>
          ))}
        </div>
        <CreateLibraryForm onCreated={async (lib) => { await refreshLibraries(); setSelectedId(lib.id); }} onError={setError} />
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto bg-slate-50">
        {error && (
          <div className="m-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {!detail ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl text-slate-300 mb-3">▤</div>
              <p className="text-sm font-medium text-slate-500">Selecciona una librería</p>
              <p className="text-xs text-slate-400 mt-1">o crea una nueva eligiendo framework y lenguaje</p>
            </div>
          </div>
        ) : (
          <LibraryDetailPane
            detail={detail}
            onChanged={() => refreshDetail(detail.library.id)}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

function FrameworkBadge({ framework }: { framework: TargetFramework }) {
  const colors: Record<TargetFramework, string> = {
    React: 'bg-cyan-100 text-cyan-800',
    Vue2: 'bg-emerald-100 text-emerald-800',
    Vue3: 'bg-green-100 text-green-800',
    Angular: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[framework]}`}>
      {FRAMEWORK_LABELS[framework]}
    </span>
  );
}

function CreateLibraryForm({ onCreated, onError }: {
  onCreated: (lib: LibrarySummary) => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<TargetFramework>('React');
  const [language, setLanguage] = useState<CodeLanguage>('TypeScript');
  const [saving, setSaving] = useState(false);

  const angularSelected = framework === 'Angular';
  const effectiveLanguage: CodeLanguage = angularSelected ? 'TypeScript' : language;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const lib = await createLibrary({ name, framework, language: effectiveLanguage, description: description || undefined });
      setName(''); setDescription(''); setOpen(false);
      onError(null);
      onCreated(lib);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo crear la librería');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={() => setOpen(true)}
          className="w-full bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nueva librería
        </button>
      </div>
    );
  }

  const inputCls = 'w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none';
  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100 space-y-2 bg-slate-50/60">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la librería" required className={inputCls} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-medium text-slate-400 uppercase">Framework</span>
          <select value={framework} onChange={(e) => setFramework(e.target.value as TargetFramework)} className={inputCls}>
            <option value="React">React 18</option>
            <option value="Vue3">Vue 3</option>
            <option value="Vue2">Vue 2</option>
            <option value="Angular">Angular</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-slate-400 uppercase">Lenguaje</span>
          <select
            value={effectiveLanguage}
            onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
            disabled={angularSelected}
            className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400`}
          >
            <option value="TypeScript">TypeScript</option>
            {!angularSelected && <option value="JavaScript">JavaScript</option>}
          </select>
        </label>
      </div>
      {angularSelected && (
        <p className="text-[10px] text-amber-600">Angular moderno requiere TypeScript.</p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Creando…' : 'Crear'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 px-3 py-1.5 rounded-md hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function LibraryDetailPane({ detail, onChanged, onError }: {
  detail: LibraryDetail;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const lib = detail.library;
  const ext = fileExtension(lib.framework, lib.language);
  const [openComponentId, setOpenComponentId] = useState<string | null>(null);

  function download(component: SavedComponent) {
    const blob = new Blob([component.sourceCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${component.name.replace(/\s+/g, '')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(component: SavedComponent) {
    if (!window.confirm(`¿Eliminar «${component.name}» de la librería?`)) return;
    try {
      await deleteComponent(lib.id, component.id);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <div className="p-5 space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900">{lib.name}</h2>
            <FrameworkBadge framework={lib.framework} />
            <span className="text-[10px] font-medium text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">{lib.language}</span>
          </div>
          {lib.description && <p className="text-sm text-slate-500 mt-1">{lib.description}</p>}
          <p className="text-[11px] text-slate-400 mt-1">
            {detail.components.length} componente(s) · exportación como .{ext}
          </p>
        </div>
      </div>

      <GeneratePane library={lib} onSaved={onChanged} onError={onError} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Componentes guardados</h3>
        {detail.components.length === 0 && (
          <p className="text-xs text-slate-400">La librería está vacía: genera un componente arriba o guarda uno desde el Constructor (librerías React).</p>
        )}
        {detail.components.map((component) => (
          <div key={component.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setOpenComponentId(openComponentId === component.id ? null : component.id)}
                className="flex items-center gap-2 text-left"
              >
                <span className="text-slate-400 text-xs">{openComponentId === component.id ? '▾' : '▸'}</span>
                <span className="text-sm font-medium text-slate-800">{component.name}</span>
                <span className="text-[10px] text-slate-400">{new Date(component.createdAt).toLocaleString()}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigator.clipboard.writeText(component.sourceCode)}
                  className="text-[11px] text-slate-500 px-2.5 py-1 rounded-md hover:bg-slate-100"
                >
                  Copiar
                </button>
                <button
                  onClick={() => download(component)}
                  className="text-[11px] text-slate-500 px-2.5 py-1 rounded-md hover:bg-slate-100"
                >
                  .{ext}
                </button>
                <button
                  onClick={() => handleDelete(component)}
                  className="text-[11px] text-red-500 px-2.5 py-1 rounded-md hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
            {openComponentId === component.id && (
              <div className="border-t border-slate-100">
                {lib.framework === 'React' && lib.language === 'TypeScript' && (
                  <div className="h-72 border-b border-slate-100">
                    <ComponentSandbox sourceCode={component.sourceCode} />
                  </div>
                )}
                <pre className="bg-slate-900 text-slate-100 text-xs p-4 overflow-x-auto max-h-72 overflow-y-auto">
                  <code>{component.sourceCode}</code>
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneratePane({ library, onSaved, onError }: {
  library: LibrarySummary;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [type, setType] = useState<ComponentType>('RegistrationForm');
  const [prompt, setPrompt] = useState('');
  const [componentName, setComponentName] = useState('');
  const [generated, setGenerated] = useState<{ sourceCode: string; verified: boolean; compiled: boolean; diagnostics: string | null } | null>(null);
  const [busy, setBusy] = useState<'idle' | 'generating' | 'saving'>('idle');

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    setBusy('generating');
    setGenerated(null);
    try {
      const response = await generateComponent({
        type,
        prompt,
        framework: library.framework,
        language: library.language,
      });
      setGenerated({
        sourceCode: response.sourceCode,
        verified: response.verified ?? true,
        compiled: response.compiled,
        diagnostics: response.diagnostics,
      });
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error generando el componente');
    } finally {
      setBusy('idle');
    }
  }

  async function handleSave() {
    if (!generated) return;
    setBusy('saving');
    try {
      await saveComponent(library.id, {
        name: componentName || COMPONENT_TYPES.find((t) => t.value === type)?.label || 'Componente',
        sourceCode: generated.sourceCode,
      });
      setGenerated(null);
      setPrompt('');
      setComponentName('');
      onError(null);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error guardando el componente');
    } finally {
      setBusy('idle');
    }
  }

  const inputCls = 'w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">
        Generar componente con IA
        <span className="font-normal text-slate-400"> — {FRAMEWORK_LABELS[library.framework]} · {library.language}</span>
      </h3>
      <form onSubmit={handleGenerate} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as ComponentType)} className={inputCls}>
          {COMPONENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe el componente que necesitas…"
          required
          className={inputCls}
        />
        <button
          type="submit"
          disabled={busy !== 'idle'}
          className="bg-blue-600 text-white text-xs font-medium px-4 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy === 'generating' ? 'Generando…' : 'Generar'}
        </button>
      </form>

      {generated && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {generated.verified ? (
              generated.compiled
                ? <span className="text-[10px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Compila (tsc)</span>
                : <span className="text-[10px] font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">✕ No compila</span>
            ) : (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Sin verificación automática para esta tecnología</span>
            )}
          </div>
          {generated.diagnostics && (
            <pre className="bg-red-50 border border-red-200 text-red-700 text-[11px] p-3 rounded-lg overflow-x-auto max-h-40">{generated.diagnostics}</pre>
          )}
          <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
            <code>{generated.sourceCode}</code>
          </pre>
          <div className="flex gap-2">
            <input
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              placeholder="Nombre con el que guardarlo"
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={handleSave}
              disabled={busy !== 'idle'}
              className="bg-slate-900 text-white text-xs font-medium px-4 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {busy === 'saving' ? 'Guardando…' : 'Guardar en la librería'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
