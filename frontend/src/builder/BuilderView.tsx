import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, rectIntersection,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Over,
} from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useBuilderReducer, BuilderCtx, DispatchCtx, HistoryInfoCtx, useBuilderState, useBuilderDispatch, useHistoryInfo } from './useBuilderStore';
import { BlockPalette } from './BlockPalette';
import { BuilderCanvas } from './BuilderCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { ThemePanel } from './ThemePanel';
import { AiChatPanel } from './AiChatPanel';
import { CodeView } from './CodeView';
import { ComponentSandbox } from '../components/ComponentSandbox';
import { currentCode } from './emitters';
import { DropHintProvider, type DropHint } from './drop-hint';
import { themeCss } from './theme';
import { TEMPLATES } from './templates';
import type { BlockType, CenterTab } from './types';
import { getDefinition } from './defaults';
import { createLibrary, listLibraries, saveComponent, type LibrarySummary } from '../api/libraries';
import { addComponent, getProject, saveComponentTree, saveProjectTheme, setBackendLibraryId, setSavedComponentId } from '../projects/storage';
import type { ActiveProject, NavGuard } from '../App';
import type { MutableRefObject } from 'react';

type RightPanel = 'none' | 'props' | 'ai' | 'theme';

const PANEL_TITLES: Record<Exclude<RightPanel, 'none'>, string> = {
  ai: 'Asistente IA',
  props: 'Propiedades',
  theme: 'Estilos de la librería',
};

interface BuilderViewProps {
  /** Proyecto/componente abiertos desde Inicio; `null` = lienzo suelto. */
  active: ActiveProject | null;
  onSwitchComponent: (componentId: string) => void;
  onExit: () => void;
  /** El constructor lo rellena con su guardia mientras haya cambios sin guardar. */
  navGuardRef?: MutableRefObject<NavGuard | null>;
}

export function BuilderView({ active, onSwitchComponent, onExit, navGuardRef }: BuilderViewProps) {
  const [state, dispatch, historyInfo] = useBuilderReducer();

  return (
    <BuilderCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        <HistoryInfoCtx.Provider value={historyInfo}>
          <BuilderInner active={active} onSwitchComponent={onSwitchComponent} onExit={onExit} navGuardRef={navGuardRef} />
        </HistoryInfoCtx.Provider>
      </DispatchCtx.Provider>
    </BuilderCtx.Provider>
  );
}

function BuilderInner({ active, onSwitchComponent, onExit, navGuardRef }: BuilderViewProps) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const { canUndo, canRedo } = useHistoryInfo();
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const [showTemplates, setShowTemplates] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /**
   * Con contenedores anidados, el padre y el hijo se solapan y por área ganaba
   * cualquiera de los dos: el bloque acababa en un sitio distinto del que
   * señalaba el cursor. Mirando primero qué hay *bajo el puntero* gana siempre
   * el destino más concreto; el reparto por área queda de reserva para cuando el
   * cursor sale del lienzo arrastrando.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const underPointer = pointerWithin(args);
    return underPointer.length > 0 ? underPointer : rectIntersection(args);
  }, []);

  // ── Proyecto activo: carga, guardado y aviso de cambios sin guardar ──
  const project = active ? getProject(active.projectId) : null;
  const activeComponent = project?.components.find((c) => c.id === active?.componentId) ?? null;
  // Firma de lo que se persiste del componente. Los estilos propios entran
  // aquí: si no, cambiarlos no marcaba el proyecto como sucio y se perdían.
  const treeJson = useMemo(
    () => JSON.stringify({
      blocks: state.blocks,
      rootIds: state.rootIds,
      stateVars: state.stateVars,
      customStyles: state.customStyles,
      stylesLanguage: state.stylesLanguage,
    }),
    [state.blocks, state.rootIds, state.stateVars, state.customStyles, state.stylesLanguage],
  );
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const dirty = project !== null && lastSaved !== null && treeJson !== lastSaved;
  const loadedComponentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !activeComponent) return;
    if (loadedComponentRef.current === activeComponent.id) return;
    loadedComponentRef.current = activeComponent.id;
    const persisted = {
      blocks: activeComponent.blocks,
      rootIds: activeComponent.rootIds,
      stateVars: activeComponent.stateVars,
      customStyles: activeComponent.customStyles ?? '',
      stylesLanguage: activeComponent.stylesLanguage ?? ('css' as const),
    };
    dispatch({ type: 'LOAD_TREE', ...persisted, componentName: activeComponent.name });
    // El tema es del proyecto, no del componente: se aplica al abrir cualquiera.
    if (project?.theme) dispatch({ type: 'SET_THEME', theme: project.theme });
    setLastSaved(JSON.stringify(persisted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.componentId, activeComponent?.id]);

  const saveProject = useCallback(async () => {
    if (!project || !active || !activeComponent) return;
    saveComponentTree(project.id, activeComponent.id, {
      blocks: state.blocks,
      rootIds: state.rootIds,
      stateVars: state.stateVars,
      customStyles: state.customStyles,
      stylesLanguage: state.stylesLanguage,
    });
    saveProjectTheme(project.id, state.theme);
    setLastSaved(treeJson);
    // Proyecto «librería consolidada»: publica el TSX emitido en el backend.
    // Si la librería no llegó a crearse (backend caído al crear el proyecto),
    // se reintenta aquí: la consolidación se auto-repara en el primer guardado
    // con backend disponible.
    if (project.kind === 'library') {
      try {
        let libraryId = project.backendLibraryId;
        if (!libraryId) {
          const lib = await createLibrary({ name: project.name, framework: 'React', language: 'TypeScript' });
          setBackendLibraryId(project.id, lib.id);
          libraryId = lib.id;
        }
        // Se publica el árbol además del TSX: es lo único que permite reabrir el
        // componente desde el catálogo de Librerías y seguir editándolo, porque
        // del código emitido no hay vuelta atrás. Y se manda `componentId` para
        // que el guardado sea una revisión y no una copia más en el catálogo.
        const saved = await saveComponent(libraryId, {
          name: activeComponent.name,
          sourceCode: currentCode(state),
          treeJson,
          componentId: activeComponent.savedComponentId,
        });
        if (saved.id !== activeComponent.savedComponentId) {
          setSavedComponentId(project.id, activeComponent.id, saved.id);
        }
      } catch {
        /* backend no disponible: el proyecto local ya quedó guardado */
      }
    }
  }, [project, active, activeComponent, state, treeJson]);

  /** Ejecuta `action`, pidiendo confirmación antes si hay cambios sin guardar. */
  function guardNav(action: () => void) {
    if (dirty) setPendingNav(() => action);
    else action();
  }

  // Publica la guardia hacia el menú superior: salir del constructor con
  // cambios sin guardar también debe pasar por el diálogo.
  useEffect(() => {
    if (navGuardRef) navGuardRef.current = dirty ? guardNav : null;
  });

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(String(event.active.id));
  }

  /**
   * `true` si el puntero está en la mitad inferior del bloque de destino.
   *
   * Es lo que distingue «suéltalo encima de este» de «suéltalo debajo». Sin
   * esto solo se podía insertar por delante, y para poner algo al final de un
   * contenedor no había ningún gesto posible.
   */
  function dropsAfter(over: Over, activeRect: DragMoveEvent['active']['rect']): boolean {
    const dragged = activeRect.current.translated;
    if (!dragged || !over.rect) return false;
    return dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
  }

  /**
   * Contenedor y posición donde cae el bloque soltado.
   *
   * Soltar sobre otro bloque significa «junto a él», delante o detrás según la
   * mitad. Soltar sobre la zona de un contenedor (o sobre el fondo del lienzo)
   * significa «al final de esa lista».
   */
  function resolveDropTarget(
    over: Over,
    activeRect: DragMoveEvent['active']['rect'],
  ): { parentId?: string; index: number } {
    const data = over.data.current;
    if (data?.origin === 'canvas') {
      const index = data.index as number;
      return {
        parentId: data.parentId as string | undefined,
        index: dropsAfter(over, activeRect) ? index + 1 : index,
      };
    }
    const parentId = data?.parentId as string | undefined;
    const siblings = parentId ? state.blocks[parentId]?.children ?? [] : state.rootIds;
    return { parentId, index: siblings.length };
  }

  /** Pista visual mientras se arrastra: el mismo cálculo que al soltar. */
  function handleDragMove(event: DragMoveEvent) {
    const { active, over } = event;
    if (!over || over.data.current?.origin !== 'canvas' || String(active.id) === String(over.id)) {
      setDropHint(null);
      return;
    }
    setDropHint({ overId: String(over.id), after: dropsAfter(over, active.rect) });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    setDropHint(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const { parentId, index } = resolveDropTarget(over, active.rect);

    if (activeData?.origin === 'palette') {
      dispatch({ type: 'ADD_BLOCK', blockType: activeData.blockType as BlockType, parentId, index });
    } else if (activeData?.origin === 'canvas' && String(active.id) !== String(over.id)) {
      dispatch({ type: 'MOVE_BLOCK', id: String(active.id), targetIndex: index, parentId });
    }
  }

  const code = currentCode(state);

  const tabs: { key: CenterTab; label: string }[] = [
    { key: 'visual', label: 'Visual' },
    { key: 'code', label: 'Código' },
    { key: 'preview', label: 'Preview' },
  ];

  const dragLabel = activeDrag?.startsWith('palette-')
    ? getDefinition(activeDrag.replace('palette-', '') as BlockType)?.label
    : null;

  function toggleRight(panel: RightPanel) {
    setRightPanel((prev) => prev === panel ? 'none' : panel);
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setExportMsg('Copiado');
      setTimeout(() => setExportMsg(null), 2000);
    });
  }, [code]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Component.tsx';
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg('Descargado');
    setTimeout(() => setExportMsg(null), 2000);
  }, [code]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveDrag(null); setDropHint(null); }}
    >
      <DropHintProvider value={dropHint}>
      <div className="flex flex-col flex-1 min-h-0">
      {project && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 shrink-0">
          <button
            onClick={() => guardNav(onExit)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            title="Volver a Inicio"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Inicio
          </button>
          <div className="w-px h-4 bg-slate-700" />
          <span className="text-xs font-semibold text-white truncate max-w-[180px]">{project.name}</span>
          <span
            title={project.kind === 'library' && !project.backendLibraryId
              ? 'El backend no estaba disponible al crear el proyecto: la librería se creará automáticamente en el primer guardado con backend en marcha.'
              : undefined}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
              ${project.kind !== 'library' ? 'bg-slate-700 text-slate-400'
                : project.backendLibraryId ? 'bg-violet-500/20 text-violet-300'
                : 'bg-amber-500/20 text-amber-300'}`}
          >
            {project.kind !== 'library' ? 'Sueltos'
              : project.backendLibraryId ? 'Librería'
              : 'Librería · sin conectar'}
          </span>
          <div className="w-px h-4 bg-slate-700" />
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Componente</span>
          <select
            value={active?.componentId ?? ''}
            onChange={(e) => {
              const target = e.target.value;
              if (target && target !== active?.componentId) guardNav(() => onSwitchComponent(target));
            }}
            className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none max-w-[220px]"
          >
            {project.components.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => guardNav(() => {
              const created = addComponent(project.id, `Componente ${project.components.length + 1}`);
              if (created) onSwitchComponent(created.id);
            })}
            className="text-xs text-slate-400 hover:text-white px-1.5 py-1 rounded hover:bg-slate-800 transition-colors"
            title="Nuevo componente en este proyecto"
          >
            + Nuevo
          </button>
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-[10px] text-amber-400">● cambios sin guardar</span>}
            <button
              onClick={saveProject}
              disabled={!dirty}
              className="bg-blue-600 text-white text-xs font-medium px-3.5 py-1 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        <BlockPalette collapsed={paletteCollapsed} onToggle={() => setPaletteCollapsed(!paletteCollapsed)} />

        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-1 shrink-0">
            <div className="flex items-center">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => dispatch({ type: 'SET_TAB', tab: t.key })}
                  className={`px-5 py-2.5 text-xs font-medium transition-colors border-b-2
                    ${state.centerTab === t.key
                      ? 'text-blue-600 border-blue-600'
                      : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  {t.label}
                </button>
              ))}
              {state.centerTab === 'visual' && (
                <>
                  <div className="w-px h-5 bg-slate-200 mx-2" />
                  <div className="flex rounded-md bg-slate-100 p-0.5">
                    {([
                      ['design', 'Diseño', 'Seleccionar, arrastrar y editar'],
                      ['interactive', 'Interactivo', 'Probar el componente con estado real'],
                    ] as const).map(([mode, label, hint]) => (
                      <button
                        key={mode}
                        onClick={() => dispatch({ type: 'SET_CANVAS_MODE', mode })}
                        title={hint}
                        className={`px-3 py-1 rounded text-[11px] font-medium transition-colors
                          ${state.canvasMode === mode
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="w-px h-5 bg-slate-200 mx-2" />
              <button
                onClick={() => dispatch({ type: 'UNDO' })}
                disabled={!canUndo}
                className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                title="Deshacer (Ctrl+Z)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              </button>
              <button
                onClick={() => dispatch({ type: 'REDO' })}
                disabled={!canRedo}
                className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                title="Rehacer (Ctrl+Y)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" /></svg>
              </button>
            </div>
            <div className="flex items-center gap-1 pr-2">
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" /></svg>
                  Templates
                </button>
                {showTemplates && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          dispatch({ type: 'LOAD_TEMPLATE', blocks: t.blocks, rootIds: t.rootIds });
                          setShowTemplates(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                      >
                        <div className="text-xs font-medium text-slate-700">{t.label}</div>
                        <div className="text-[10px] text-slate-400">{t.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                title="Copiar código"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                {exportMsg === 'Copiado' ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                title="Descargar .tsx"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                .tsx
              </button>
              <SaveToLibraryButton code={code} />
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <button
                onClick={() => toggleRight('ai')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${rightPanel === 'ai' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                IA
              </button>
              <button
                onClick={() => toggleRight('theme')}
                title="Color, tipografía y forma que comparten todos los componentes"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${rightPanel === 'theme' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-slate-300"
                  style={{ background: state.theme.colors.primario }}
                />
                Estilos
              </button>
              <button
                onClick={() => toggleRight('props')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${rightPanel === 'props' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Propiedades
              </button>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <button
                onClick={() => dispatch({ type: 'CLEAR_CANVAS' })}
                className="text-[11px] text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded hover:bg-red-50"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden">
              {state.centerTab === 'visual' && <BuilderCanvas />}
              {state.centerTab === 'code' && <CodeView />}
              {state.centerTab === 'preview' && (
                <div className="flex-1 flex flex-col p-4 bg-slate-50 min-h-0">
                  <div className="flex-1 rounded-lg overflow-hidden border border-slate-200 shadow-inner min-h-0">
                    <ComponentSandbox
                      sourceCode={code}
                      // En el preview el componente se monta suelto, sin el
                      // contenedor `.visualiza-component` del paquete, así que
                      // el tema se ancla al body del propio iframe.
                      themeCss={themeCss(state.theme, 'body')}
                      componentCss={state.customStyles}
                    />
                  </div>
                </div>
              )}
            </div>

            {rightPanel !== 'none' && (
              <div className="w-80 shrink-0 border-l border-slate-200 bg-slate-900 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    {PANEL_TITLES[rightPanel]}
                  </span>
                  <button
                    onClick={() => setRightPanel('none')}
                    className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {rightPanel === 'ai' && <AiChatPanel />}
                {rightPanel === 'props' && <PropertiesPanel />}
                {rightPanel === 'theme' && <ThemePanel />}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {pendingNav && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-[90vw]">
            <h3 className="text-sm font-semibold text-slate-900">Cambios sin guardar</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              El componente «{activeComponent?.name}» tiene cambios sin guardar. ¿Quieres guardarlos antes de continuar?
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setPendingNav(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { const go = pendingNav; setPendingNav(null); setLastSaved(treeJson); go(); }}
                className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={() => { const go = pendingNav; setPendingNav(null); saveProject(); go(); }}
                className="px-3.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Guardar y continuar
              </button>
            </div>
          </div>
        </div>
      )}

      <DragOverlay>
        {dragLabel ? (
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-xl shadow-blue-600/30">
            {dragLabel}
          </div>
        ) : null}
      </DragOverlay>
      </DropHintProvider>
    </DndContext>
  );
}

function SaveToLibraryButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [libraries, setLibraries] = useState<LibrarySummary[] | null>(null);
  const [libraryId, setLibraryId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function openDialog() {
    setOpen(true);
    setStatus('idle');
    try {
      // El constructor emite React + TSX: solo librerías React/TypeScript.
      const all = await listLibraries();
      const reactLibs = all.filter((l) => l.framework === 'React' && l.language === 'TypeScript');
      setLibraries(reactLibs);
      if (reactLibs.length > 0) setLibraryId(reactLibs[0].id);
    } catch {
      setLibraries([]);
    }
  }

  async function handleSave() {
    if (!libraryId || !name.trim()) return;
    setStatus('saving');
    try {
      await saveComponent(libraryId, { name: name.trim(), sourceCode: code });
      setStatus('saved');
      setTimeout(() => { setOpen(false); setName(''); setStatus('idle'); }, 1200);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : openDialog())}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
          ${open ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        title="Guardar en una librería de componentes"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
        Guardar
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Guardar en librería</p>
          {libraries === null && <p className="text-xs text-slate-400">Cargando librerías…</p>}
          {libraries !== null && libraries.length === 0 && (
            <p className="text-xs text-slate-500">
              No hay librerías React + TypeScript. Crea una en la pestaña «Librerías».
            </p>
          )}
          {libraries !== null && libraries.length > 0 && (
            <>
              <select
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
              >
                {libraries.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del componente"
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={handleSave}
                disabled={status === 'saving' || !name.trim()}
                className="w-full bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {status === 'saving' ? 'Guardando…' : status === 'saved' ? '✓ Guardado' : 'Guardar componente'}
              </button>
              {status === 'error' && <p className="text-[11px] text-red-500">No se pudo guardar. ¿Está el backend en marcha?</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
