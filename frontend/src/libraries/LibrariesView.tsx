/**
 * Librerías: la librería sigue siendo la unidad, pero se lee como catálogo.
 *
 * A la izquierda, las librerías. En el centro, sus componentes como fichas. Al
 * seleccionar una ficha, a la derecha aparece el componente **renderizado y
 * usable**, no una captura: es la única forma de juzgar si sirve. Desde ahí se
 * puede editar (abre el constructor con su árbol), ver el código, descargarlo o
 * eliminarlo.
 *
 * La exportación es de la librería entera, en un solo zip con el tema
 * compartido en la raíz: entregar los componentes de uno en uno no es entregar
 * una librería.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createLibrary, listLibraries, getLibrary, saveComponent, deleteComponent, deleteLibrary, fileExtension, targetDe,
  FRAMEWORK_LABELS,
  type CodeLanguage, type LibraryDetail, type LibrarySummary, type SavedComponent, type TargetFramework,
} from '../api/libraries';
import { assist } from '../api/components';
import { ApiError } from '../api/client';
import { getEmitter } from '../builder/emitters';
import { sanitizeTree, type SanitizedTree } from '../builder/sanitize-tree';
import { PALETTE_CONTEXT_JSON, STYLE_VOCABULARY_JSON } from '../builder/palette-context';
import { ComponentSandbox } from '../components/ComponentSandbox';
import { emitLibrary, parseTree, toZipEntries } from '../builder/emit-library';
import { downloadZip } from '../builder/zip';
import { DEFAULT_THEME, normalizeTheme, themeCss, type Theme } from '../builder/theme';
import { LibraryStylesPanel } from './LibraryStylesPanel';
import { listProjects, unlinkBackendLibrary, unlinkSavedComponent } from '../projects/storage';

/**
 * Un nombre presentable a partir de la descripción que se tecleó.
 *
 * Sustituye a la etiqueta del desplegable de tipos. Se corta por palabras y no
 * por caracteres —cortar a la mitad de una deja «Un acordeón de pregun»— y se
 * queda corto a propósito: es un nombre por defecto, y el campo de al lado
 * existe justo para cambiarlo.
 */
function nombreDesdeDescripcion(descripcion: string): string {
  const limpia = descripcion.trim().replace(/\s+/g, ' ');
  if (!limpia) return 'Componente';

  const palabras = limpia.split(' ');
  let nombre = palabras[0];
  for (const palabra of palabras.slice(1)) {
    if (`${nombre} ${palabra}`.length > 40) break;
    nombre += ` ${palabra}`;
  }
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export interface LibrariesViewProps {
  /**
   * Abre un componente del catálogo en el constructor. Solo se ofrece cuando el
   * componente conserva su árbol de bloques: del TSX emitido no hay vuelta atrás.
   */
  onEditComponent?: (library: LibrarySummary, component: SavedComponent) => void;
}

/**
 * Hoja de estilos PROPIA de un componente del catálogo.
 *
 * Vive dentro de su árbol serializado. Sin esto la previsualización pintaba el
 * componente con el tema y la hoja global pero SIN sus estilos propios, así que
 * enseñaba media cascada: lo que se veía en el catálogo no era lo que se
 * exportaba ni lo que se veía en el constructor. Los generados como código no
 * tienen árbol, y por tanto tampoco hoja propia.
 */
function componentCssOf(component: SavedComponent): string {
  return parseTree(component.treeJson)?.customStyles ?? '';
}

/**
 * Tema con el que se previsualiza y exporta una librería.
 *
 * Lo trae la propia librería. Antes vivía únicamente en el proyecto local del
 * navegador y se recuperaba buscando el proyecto enlazado, de modo que abrirla
 * desde otro equipo —o después de limpiar el almacenamiento— la pintaba con el
 * tema por defecto: sus «estilos globales» no eran realmente suyos.
 *
 * Se conserva la búsqueda por proyecto local como respaldo para las librerías
 * creadas antes de que el tema viajara con ellas, que tienen `themeJson` nulo.
 * En cuanto se guarde su estilo una vez, la librería pasa a mandar.
 */
function themeForLibrary(library: LibrarySummary): Theme {
  if (library.themeJson) {
    try {
      return normalizeTheme(JSON.parse(library.themeJson));
    } catch {
      // Un tema ilegible no puede tumbar el catálogo: se cae al de por defecto.
    }
  }
  const project = listProjects().find((p) => p.backendLibraryId === library.id);
  return project?.theme ?? DEFAULT_THEME;
}

export function LibrariesView({ onEditComponent }: LibrariesViewProps = {}) {
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

  async function handleDeleteLibrary(library: LibrarySummary) {
    const warning = library.componentCount > 0
      ? `\n\nSe eliminarán también sus ${library.componentCount} componente(s).`
      : '';
    if (!window.confirm(`¿Eliminar la librería «${library.name}»?${warning}\n\nNo se puede deshacer.`)) return;
    try {
      await deleteLibrary(library.id);
      // El proyecto local que la publicaba se queda apuntando a un id que ya no
      // existe: se desenlaza para que el siguiente guardado cree una limpia en
      // vez de fallar contra la borrada.
      unlinkBackendLibrary(library.id);
      if (selectedId === library.id) setSelectedId(null);
      await refreshLibraries();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la librería');
    }
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Librerías</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Cada una se exporta como un paquete</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <p className="text-xs text-slate-400 px-1">Cargando…</p>}
          {!loading && libraries.length === 0 && (
            <p className="text-xs text-slate-400 px-1">Aún no hay librerías. Crea la primera abajo.</p>
          )}
          {libraries.map((lib) => (
            <div
              key={lib.id}
              className={`group relative rounded-lg border transition-colors
                ${selectedId === lib.id ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <button onClick={() => setSelectedId(lib.id)} className="w-full text-left px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">{lib.name}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 mr-5">{lib.componentCount} comp.</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <FrameworkBadge framework={lib.framework} />
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    {lib.language === 'TypeScript' ? 'TS' : 'JS'}
                  </span>
                </div>
              </button>
              <button
                onClick={() => handleDeleteLibrary(lib)}
                title="Eliminar la librería y todos sus componentes"
                className="absolute top-2 right-2 w-5 h-5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-xs leading-none"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <CreateLibraryForm onCreated={async (lib) => { await refreshLibraries(); setSelectedId(lib.id); }} onError={setError} />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-50">
        {error && (
          <div className="m-4 mb-0 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 shrink-0">{error}</div>
        )}
        {!detail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl text-slate-300 mb-3">▤</div>
              <p className="text-sm font-medium text-slate-500">Selecciona una librería</p>
              <p className="text-xs text-slate-400 mt-1">verás su catálogo de componentes</p>
            </div>
          </div>
        ) : (
          <LibraryCatalog
            detail={detail}
            onChanged={() => refreshDetail(detail.library.id)}
            onError={setError}
            onEditComponent={onEditComponent}
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

// ── Catálogo ─────────────────────────────────────────────────────────────────

function LibraryCatalog({ detail, onChanged, onError, onEditComponent }: {
  detail: LibraryDetail;
  onChanged: () => void;
  onError: (msg: string | null) => void;
  onEditComponent?: (library: LibrarySummary, component: SavedComponent) => void;
}) {
  const lib = detail.library;
  const ext = fileExtension(lib.framework, lib.language);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stylesOpen, setStylesOpen] = useState(false);

  // Los estilos globales son de la librería y se recalculan al cambiar de una a
  // otra o al guardarlos desde el panel.
  const theme = useMemo(() => themeForLibrary(lib), [lib]);
  const globalCss = lib.globalStyles ?? '';

  const selected = detail.components.find((c) => c.id === selectedId)
    ?? detail.components[0]
    ?? null;

  /*
    El destino de la librería, que es lo que el sandbox necesita para montar el
    framework correcto.

    Antes aquí había un `canPreview` que valía solo para React, y las fichas de
    una librería de Vue o de Angular enseñaban un `</>` gris en vez del
    componente: el catálogo dejaba de ser un catálogo justo donde más falta hace
    mirar antes de elegir. Es el mismo destino con el que se exporta, así que lo
    que se ve y lo que se descarga salen del mismo sitio.
  */
  const target = targetDe(lib.framework, lib.language);

  async function handleDelete(component: SavedComponent) {
    if (!window.confirm(`¿Eliminar «${component.name}» de la librería?`)) return;
    try {
      await deleteComponent(lib.id, component.id);
      // El proyecto local que lo publicó sigue guardándolo: lo que desaparece
      // es su entrada en el catálogo. Se suelta el enlace para que no quede
      // señalando a algo que ya no está, y para que volver a guardarlo lo dé
      // de alta otra vez en vez de intentar revisar un id muerto.
      unlinkSavedComponent(component.id);
      if (selectedId === component.id) setSelectedId(null);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  }

  function handleExportLibrary() {
    /*
      El destino y el lenguaje viajan con la exportación.

      No lo hacían, y `emitLibrary` caía a sus valores por defecto —React y
      TypeScript— para TODAS las librerías: la de JavaScript salía del zip con
      ficheros `.tsx` y anotaciones de tipos, y la de Angular con componentes de
      React. El catálogo decía una cosa y el paquete entregaba otra.
    */
    const files = emitLibrary({
      libraryName: lib.name,
      components: detail.components.map((c) => ({
        name: c.name,
        sourceCode: c.sourceCode,
        treeJson: c.treeJson,
      })),
      theme,
      globalStyles: globalCss,
      sourceExtension: ext,
      lang: lib.language === 'JavaScript' ? 'js' : 'ts',
      target: targetDe(lib.framework, lib.language),
    });
    downloadZip(`${lib.name.replace(/\s+/g, '-')}.zip`, toZipEntries(files));
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900 truncate">{lib.name}</h2>
                <FrameworkBadge framework={lib.framework} />
                <span className="text-[10px] font-medium text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">{lib.language}</span>
              </div>
              {lib.description && <p className="text-sm text-slate-500 mt-1">{lib.description}</p>}
              <p className="text-[11px] text-slate-400 mt-1">
                {detail.components.length} componente(s) · se exporta como paquete .{ext}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={() => setStylesOpen((open) => !open)}
                aria-pressed={stylesOpen}
                title="Tema y hoja global de la librería: los comparten todos sus componentes"
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors
                  ${stylesOpen
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-slate-300"
                  style={{ background: theme.colors.primario }}
                />
                Estilos globales
              </button>
              <button
                onClick={handleExportLibrary}
                disabled={detail.components.length === 0}
                title="Descarga la librería entera: un zip con cada componente en su carpeta y el tema compartido en la raíz"
                className="bg-slate-900 text-white text-xs font-medium px-3.5 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Exportar librería
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <GeneratePane
            library={lib}
            busy={generating}
            setBusy={setGenerating}
            onSaved={onChanged}
            onError={onError}
          />

          {detail.components.length === 0 ? (
            <p className="text-xs text-slate-400">
              La librería está vacía: genera un componente arriba o guarda uno desde el Constructor.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {detail.components.map((component) => (
                <ComponentCard
                  key={component.id}
                  component={component}
                  selected={selected?.id === component.id}
                  target={target}
                  theme={theme}
                  globalCss={globalCss}
                  onSelect={() => setSelectedId(component.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="w-[440px] shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
        {selected ? (
          <ComponentDetail
            component={selected}
            library={lib}
            theme={theme}
            globalCss={globalCss}
            target={target}
            extension={ext}
            onDelete={() => handleDelete(selected)}
            onEdit={onEditComponent ? () => onEditComponent(lib, selected) : undefined}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center px-6 text-center">
            <p className="text-xs text-slate-400">
              Selecciona un componente del catálogo para verlo funcionando aquí.
            </p>
          </div>
        )}
      </aside>

      {stylesOpen && (
        <LibraryStylesPanel
          library={lib}
          /*
            Recargar entera al guardar y no parchear el estado local: la
            respuesta trae lo que de VERDAD se guardó, y con campos opcionales
            por separado eso difiere de lo enviado siempre que se manda solo uno
            de los dos. Además repinta las miniaturas con el tema nuevo, que es
            el punto de tener estilos globales.
          */
          onSaved={onChanged}
          onClose={() => setStylesOpen(false)}
        />
      )}
    </div>
  );
}

/** Ficha del catálogo: miniatura viva del componente. */
function ComponentCard({ component, selected, target, theme, globalCss, onSelect }: {
  component: SavedComponent;
  selected: boolean;
  /** Destino de la librería: el sandbox monta su framework para la miniatura. */
  target: string;
  theme: Theme;
  /** Hoja global de la librería: la miniatura tiene que enseñar el kit, no el componente aislado. */
  globalCss: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`text-left bg-white rounded-xl border overflow-hidden transition-all
        ${selected ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
    >
      <div className="h-32 bg-slate-50 border-b border-slate-100 relative overflow-hidden">
        <div className="absolute inset-0 origin-top-left scale-[0.55] w-[182%] h-[182%] pointer-events-none">
          <ComponentSandbox
            sourceCode={component.sourceCode}
            themeCss={themeCss(theme, 'body', globalCss, true)}
            componentCss={componentCssOf(component)}
            target={target}
          />
        </div>
        {/* La miniatura es para mirar: el clic debe seleccionar la ficha, no
            caer dentro del iframe. */}
        <div className="absolute inset-0" />
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800 truncate">{component.name}</span>
          {!component.editable && (
            <span
              title="Generado como código: se puede ver y descargar, pero no reabrir en el constructor"
              className="text-[9px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0"
            >
              solo código
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">
          {new Date(component.createdAt).toLocaleDateString()}
        </span>
      </div>
    </button>
  );
}

/** Panel derecho: el componente funcionando, con sus acciones. */
function ComponentDetail({ component, library, theme, globalCss, target, extension, onDelete, onEdit }: {
  component: SavedComponent;
  library: LibrarySummary;
  theme: Theme;
  globalCss: string;
  /** Destino de la librería: el sandbox monta su framework para la vista. */
  target: string;
  extension: string;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');

  function download() {
    const blob = new Blob([component.sourceCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${component.name.replace(/\s+/g, '')}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Cambiar de componente debe volver a la vista renderizada, no dejarte en el
  // código del anterior.
  useEffect(() => { setTab('preview'); }, [component.id]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-semibold text-slate-800 truncate">{component.name}</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {library.name} · {new Date(component.createdAt).toLocaleString()}
        </p>
        <div className="flex gap-1.5 mt-2.5">
          <button
            onClick={onEdit}
            disabled={!onEdit || !component.editable}
            title={
              !component.editable
                ? 'Este componente se generó como código y no conserva su árbol de bloques, así que no se puede editar visualmente'
                : !onEdit
                  ? 'Abre un proyecto para poder editar'
                  : 'Abrir en el constructor con sus bloques y propiedades'
            }
            className="flex-1 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            Editar
          </button>
          <button
            onClick={download}
            className="text-xs text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-100 border border-slate-200"
          >
            .{extension}
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 border border-red-200"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-slate-100 shrink-0">
        {([['preview', 'Vista'], ['code', 'Código']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors
              ${tab === key ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'preview' ? (
        <div className="flex-1 min-h-0 bg-white">
          <ComponentSandbox
            sourceCode={component.sourceCode}
            themeCss={themeCss(theme, 'body', globalCss, true)}
            componentCss={componentCssOf(component)}
            target={target}
          />
        </div>
      ) : (
        <pre className="flex-1 min-h-0 overflow-auto bg-slate-900 text-slate-100 text-[11px] p-4 leading-relaxed">
          <code>{component.sourceCode}</code>
        </pre>
      )}
    </div>
  );
}

// ── Crear librería y generar componentes ─────────────────────────────────────

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

function GeneratePane({ library, busy, setBusy, onSaved, onError }: {
  library: LibrarySummary;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [componentName, setComponentName] = useState('');
  /**
   * Lo generado: el árbol de bloques Y el código que sale de emitirlo.
   *
   * Antes aquí solo había código, y esa era justamente la limitación: sin árbol
   * el componente entraba al catálogo marcado «solo código» y el botón Editar
   * nacía apagado, porque del TSX emitido no se puede volver a los bloques.
   */
  const [generated, setGenerated] = useState<{ tree: SanitizedTree; sourceCode: string; nombre: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // El destino de emisión lo declara la librería, no el proyecto: es lo que el
  // catálogo promete de cada una de sus entradas.
  const emisor = getEmitter(targetDe(library.framework, library.language));

  /**
   * Genera pidiéndole al asistente un ÁRBOL DE BLOQUES, no código.
   *
   * Es el mismo asistente del Constructor, que construye con la paleta en lugar
   * de escribir TSX libre. El árbol es lo que hace editable el resultado; el
   * código se obtiene emitiéndolo, así que lo que se ve y lo que se guarda son
   * la misma cosa por construcción.
   *
   * La contrapartida está asumida: solo puede armar lo que la paleta sabe
   * expresar. A cambio, lo que sale se puede seguir trabajando.
   */
  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setGenerated(null);
    try {
      const res = await assist({
        message: prompt,
        // Lienzo en blanco: aquí no se está modificando nada, se pide algo nuevo.
        treeJson: JSON.stringify({ blocks: {}, rootIds: [], stateVars: [] }),
        paletteJson: PALETTE_CONTEXT_JSON,
        styleVocabularyJson: STYLE_VOCABULARY_JSON,
        // El tema de la librería viaja para que lo generado nazca con sus
        // colores y no con los genéricos.
        themeJson: library.themeJson ?? null,
        targetJson: JSON.stringify({
          framework: emisor.label,
          language: emisor.lang === 'js' ? 'JavaScript' : 'TypeScript',
          extension: emisor.extension,
        }),
      });

      // El asistente responde con una tanda o con un solo árbol, según cómo
      // entienda la petición; los dos caminos sirven y se aceptan igual.
      const crudo = res.components?.[0]?.treeJson ?? res.treeJson;
      if (!crudo) {
        onError(res.reply?.trim() || 'El asistente no devolvió ningún componente. Prueba a describirlo con más detalle.');
        return;
      }

      // Se sanea contra la paleta antes de nada: un árbol con bloques que el
      // lienzo no sabe pintar entraría al catálogo como una entrada rota.
      const tree = sanitizeTree(JSON.parse(crudo), {});
      if (!tree || tree.rootIds.length === 0) {
        onError('Lo que devolvió el asistente no se pudo convertir en bloques del catálogo. Prueba a pedirlo de otra forma.');
        return;
      }

      const nombre = res.components?.[0]?.name?.trim() || nombreDesdeDescripcion(prompt);
      setGenerated({
        tree,
        nombre,
        sourceCode: emisor.emit({
          blocks: tree.blocks,
          rootIds: tree.rootIds,
          vars: tree.stateVars,
          name: nombre,
        }),
      });
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error generando el componente');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!generated) return;
    setSaving(true);
    try {
      // Con `treeJson`: es lo que permite reabrirlo en el constructor y seguir
      // editándolo. Se guarda con la misma forma que el guardado del
      // constructor, porque es la que `parseTree` sabe leer.
      await saveComponent(library.id, {
        // El nombre lo propone el asistente y el campo de al lado lo cambia.
        name: componentName || generated.nombre,
        sourceCode: generated.sourceCode,
        treeJson: JSON.stringify({
          blocks: generated.tree.blocks,
          rootIds: generated.tree.rootIds,
          stateVars: generated.tree.stateVars,
          customStyles: '',
          stylesLanguage: 'css',
        }),
      });
      setGenerated(null);
      setPrompt('');
      setComponentName('');
      onError(null);
      onSaved();
    } catch (err) {
      /*
        404 = la librería seleccionada ya no está en el servidor.

        El listado de la izquierda es una foto de cuando se cargó, así que basta
        con que alguien borre la librería desde otra pestaña —o desde otra
        sesión— para que el guardado dispare contra un identificador muerto. Lo
        que se veía era «Backend respondió 404 en POST /api/libraries/<uuid>…»,
        que no le dice a nadie qué ha pasado ni qué hacer. Se explica y se relee
        el catálogo, que es lo único que devuelve la pantalla a la realidad.
      */
      if (err instanceof ApiError && err.status === 404) {
        onError('Esa librería ya no existe en el servidor: alguien la eliminó mientras la tenías abierta. '
          + 'El listado se ha actualizado; elige otra o créala de nuevo. El código generado sigue aquí.');
        onSaved();
      } else {
        onError(err instanceof Error ? err.message : 'Error guardando el componente');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 hover:text-slate-700 transition-colors"
      >
        + Generar componente con IA como código ({FRAMEWORK_LABELS[library.framework]} · {library.language})
      </button>
    );
  }

  const inputCls = 'w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Generar componente con IA
          <span className="font-normal text-slate-400"> — {FRAMEWORK_LABELS[library.framework]} · {library.language}</span>
        </h3>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">✕</button>
      </div>
      <p className="text-[11px] text-slate-400">
        Genera <strong>bloques editables</strong>: lo que salga se puede abrir después en el
        Constructor y seguir trabajándolo. Se arma con el catálogo de bloques, así que describe
        la pieza en términos de interfaz.
      </p>
      <form onSubmit={handleGenerate} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Un acordeón de preguntas frecuentes con búsqueda y una abierta por defecto"
          required
          className={inputCls}
        />
        <button
          type="submit"
          disabled={busy || saving}
          className="bg-blue-600 text-white text-xs font-medium px-4 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Generando…' : 'Generar'}
        </button>
      </form>

      {generated && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              Editable · {Object.keys(generated.tree.blocks).length} bloques
            </span>
            <span className="text-[10px] text-slate-400">
              Se podrá abrir en el Constructor
            </span>
          </div>
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
              disabled={saving}
              className="bg-slate-900 text-white text-xs font-medium px-4 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar en la librería'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
