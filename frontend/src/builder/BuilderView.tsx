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
import { AiChatPanel, type AssistantComponent, type BatchOutcome } from './AiChatPanel';
import { reactEmitter } from './emit-react';
import type { AssistTarget } from '../api/components';
import { CodeView } from './CodeView';
import { DevicePreview } from './DevicePreview';
import { currentCode, getEmitter } from './emitters';
import { DropHintProvider, type DropHint } from './drop-hint';
import { themeCss } from './theme';
import { TEMPLATES } from './templates';
import type { BlockType, BuilderState, CallbackProp, CenterTab, StateVar, StylesLanguage } from './types';
import { EMPTY_MODEL, type DataModel } from './data-model';
import { getDefinition } from './defaults';
import { createLibrary, listLibraries, saveComponent, type LibrarySummary } from '../api/libraries';
import { addComponent, getProject, saveComponentTree, saveProjectTheme, setBackendLibraryId, setSavedComponentId } from '../projects/storage';
import type { ActiveProject, NavGuard } from '../App';
import type { MutableRefObject } from 'react';

type RightPanel = 'none' | 'props' | 'ai' | 'theme';

/** Todo lo que se guarda de un componente, que es también lo que decide si está sucio. */
interface Guardable {
  blocks: BuilderState['blocks'];
  rootIds: string[];
  stateVars: StateVar[];
  customStyles: string;
  stylesLanguage: StylesLanguage;
  componentName: string;
  model: DataModel;
  callbacks: CallbackProp[];
}

/**
 * Huella de lo guardable, para comparar «lo que hay» con «lo último guardado».
 *
 * Existe como función única —y enumera las claves en un orden fijo— porque la
 * comparación es entre CADENAS: `JSON.stringify` respeta el orden en que se
 * declaran las propiedades, así que dos objetos con los mismos datos y distinto
 * orden producen huellas distintas y el componente aparece modificado sin que
 * nadie lo haya tocado. Con dos objetos literales escritos a mano en dos sitios,
 * eso era cuestión de tiempo; y de hecho pasaba.
 */
function huella(g: Guardable): string {
  return JSON.stringify([
    g.blocks, g.rootIds, g.stateVars, g.customStyles, g.stylesLanguage,
    g.componentName, g.model, g.callbacks,
  ]);
}

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
   * Deshacer y rehacer con el teclado.
   *
   * Los botones anunciaban «(Ctrl+Z)» y «(Ctrl+Y)» en su tooltip, pero no había
   * nada escuchando esas teclas: la interfaz prometía un atajo que no existía, y
   * pulsarlo no daba ningún aviso de que no iba a pasar nada.
   *
   * Se ignora mientras se escribe. El lienzo tiene campos de texto por todas
   * partes —el editor de un bloque, el panel de propiedades, el chat— y ahí
   * Ctrl+Z tiene que deshacer lo TECLEADO, no tirarse atrás el diseño entero.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

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
  //
  // El proyecto se relee del almacenamiento en cada render. `projectVersion`
  // existe para forzar ese render cuando algo lo modifica fuera del flujo
  // normal —una tanda de componentes creada por el asistente—, que si no se
  // guardaría en disco sin aparecer en la barra hasta recargar.
  const [projectVersion, setProjectVersion] = useState(0);
  const project = useMemo(
    () => (active ? getProject(active.projectId) : null),
    [active, projectVersion],
  );
  const activeComponent = project?.components.find((c) => c.id === active?.componentId) ?? null;
  // Firma de lo que se persiste del componente. Los estilos propios entran
  // aquí: si no, cambiarlos no marcaba el proyecto como sucio y se perdían.
  /**
   * Huella de lo guardable del componente. El NOMBRE entra en ella.
   *
   * Sin el nombre, renombrar no marcaba cambios pendientes y el botón Guardar
   * seguía deshabilitado: el campo de la pestaña Paquete aceptaba el texto, el
   * fichero exportado cambiaba de nombre delante de ti, y la única acción que
   * podía persistirlo estaba apagada. No es que renombrar fallara — es que **no
   * se podía llegar a guardar**, y una librería entera acababa como
   * «Componente 1…5» sin forma de arreglarlo desde el editor.
   */
  const treeJson = useMemo(
    () => huella({
      blocks: state.blocks,
      rootIds: state.rootIds,
      stateVars: state.stateVars,
      customStyles: state.customStyles,
      stylesLanguage: state.stylesLanguage,
      componentName: state.componentName,
      model: state.model,
      callbacks: state.callbacks,
    }),
    [state.blocks, state.rootIds, state.stateVars, state.customStyles, state.stylesLanguage,
      state.componentName, state.model, state.callbacks],
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
      model: activeComponent.model,
      callbacks: activeComponent.callbacks,
    };
    dispatch({ type: 'LOAD_TREE', ...persisted, componentName: activeComponent.name });
    // El tema es del proyecto, no del componente: se aplica al abrir cualquiera.
    if (project?.theme) dispatch({ type: 'SET_THEME', theme: project.theme });
    /*
      La huella se calcula con la MISMA función y sobre lo que el estado va a
      contener tras cargar, no sobre lo que había en disco.

      Las dos cosas fallaban por separado y con el mismo síntoma: el componente
      se abría marcado como «cambios sin guardar» sin haberlo tocado, así que el
      aviso al salir saltaba siempre y dejaba de significar nada. Una era el
      ORDEN de las claves —`JSON.stringify` lo conserva, y los dos objetos las
      declaraban en orden distinto—; la otra, que en disco `model` y `callbacks`
      pueden faltar mientras que el reductor los normaliza a un modelo vacío y a
      una lista vacía. Comparar cadenas exige que las dos se construyan igual.
    */
    setLastSaved(huella({
      ...persisted,
      componentName: activeComponent.name,
      model: persisted.model ?? EMPTY_MODEL,
      callbacks: persisted.callbacks ?? [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.componentId, activeComponent?.id]);

  const saveProject = useCallback(async () => {
    if (!project || !active || !activeComponent) return;
    /*
      El nombre viaja con el guardado.

      El campo NOMBRE de la pestaña Paquete escribía `state.componentName`, que
      solo se usaba para bautizar el fichero exportado: el componente seguía
      llamándose «Componente 3» en el proyecto y en el catálogo, y no había
      ninguna otra forma de renombrarlo. Una librería entera acababa como
      «Componente 1…5», que es exactamente lo que un catálogo no puede ser.
    */
    const nombre = state.componentName.trim() || activeComponent.name;
    saveComponentTree(project.id, activeComponent.id, {
      blocks: state.blocks,
      rootIds: state.rootIds,
      stateVars: state.stateVars,
      customStyles: state.customStyles,
      stylesLanguage: state.stylesLanguage,
      model: state.model,
      callbacks: state.callbacks,
    }, nombre);
    saveProjectTheme(project.id, state.theme);
    setLastSaved(treeJson);
    // Proyecto «librería consolidada»: publica el TSX emitido en el backend.
    // Si la librería no llegó a crearse (backend caído al crear el proyecto),
    // se reintenta aquí: la consolidación se auto-repara en el primer guardado
    // con backend disponible.
    //
    // Solo con React: la librería del backend es React+TS y publicar ahí un SFC
    // guardaría en el catálogo un componente que no es lo que dice ser. El
    // proyecto local sí conserva el árbol, así que no se pierde nada.
    if (project.kind === 'library' && getEmitter(state.framework).verifiable) {
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
          name: nombre,
          sourceCode: currentCode(state),
          treeJson,
          componentId: activeComponent.savedComponentId,
        });
        if (saved.id !== activeComponent.savedComponentId) {
          setSavedComponentId(project.id, activeComponent.id, saved.id);
          // Releer: sin esto el `savedComponentId` recién asignado no llegaría a
          // `activeComponent`, y el siguiente guardado volvería a ir sin id —
          // es decir, crearía otra copia en el catálogo en vez de revisarla.
          setProjectVersion((v) => v + 1);
        }
      } catch {
        /* backend no disponible: el proyecto local ya quedó guardado */
      }
    }
  }, [project, active, activeComponent, state, treeJson]);

  // ── Contexto que el asistente necesita para preguntar con datos reales ──
  //
  // Sin las librerías existentes, la pregunta «¿dónde lo guardo?» ofrecería
  // nombres inventados; sin los componentes del proyecto, el asistente
  // propondría nombres ya usados y el catálogo quedaría con duplicados.
  const [assistantLibraries, setAssistantLibraries] = useState<LibrarySummary[]>([]);
  useEffect(() => {
    if (rightPanel !== 'ai') return;
    let cancelled = false;
    listLibraries()
      .then((all) => { if (!cancelled) setAssistantLibraries(all); })
      // Sin backend el asistente sigue funcionando: solo ofrecerá crear una
      // librería nueva o ninguna, que es la verdad en ese momento.
      .catch(() => { if (!cancelled) setAssistantLibraries([]); });
    return () => { cancelled = true; };
  }, [rightPanel]);

  const librariesJson = useMemo(
    () => JSON.stringify(assistantLibraries.map((l) => ({
      id: l.id, name: l.name, framework: l.framework, language: l.language,
    }))),
    [assistantLibraries],
  );

  const projectJson = useMemo(
    () => (project
      ? JSON.stringify({
        name: project.name,
        kind: project.kind,
        linkedLibraryId: project.backendLibraryId ?? null,
        components: project.components.map((c) => c.name),
      })
      : null),
    [project],
  );

  /**
   * Crea en el proyecto los componentes de una tanda del asistente.
   *
   * Van al proyecto y no al lienzo a propósito: el lienzo edita UN componente,
   * y volcar ahí varios los fundiría en uno solo, que es justo lo contrario de
   * lo que pidió el usuario al hablar de componentes atómicos. Devuelve cuántos
   * se crearon para que el chat lo diga con exactitud.
   */
  const createAssistantComponents = useCallback(async (
    components: AssistantComponent[],
    target: AssistTarget | null,
  ): Promise<BatchOutcome> => {
    if (!active || !project) return { created: 0 };

    const entries: { componentId: string; item: AssistantComponent }[] = [];
    for (const item of components) {
      const entry = addComponent(active.projectId, item.name);
      if (!entry) continue;
      saveComponentTree(active.projectId, entry.id, {
        blocks: item.blocks,
        rootIds: item.rootIds,
        stateVars: item.stateVars,
      }, item.name);
      entries.push({ componentId: entry.id, item });
    }

    // El selector de componentes lee del almacenamiento en cada render, así que
    // basta con provocar uno para que la tanda aparezca en la barra de proyecto.
    if (entries.length > 0) setProjectVersion((v) => v + 1);

    const outcome: BatchOutcome = { created: entries.length };
    if (entries.length === 0 || !target || target.kind === 'none') return outcome;

    // Publicar en la librería es lo que convierte la pregunta del destino en una
    // decisión con efecto. Va aparte de la creación local a propósito: si el
    // backend falla, los componentes ya están a salvo en el proyecto y lo único
    // que se pierde es la publicación, que se puede repetir guardando.
    try {
      let libraryId = target.kind === 'existing' ? target.libraryId ?? '' : '';
      let libraryName = assistantLibraries.find((l) => l.id === libraryId)?.name;

      if (target.kind === 'new' || !libraryId) {
        const name = target.libraryName?.trim() || project.name;
        const created = await createLibrary({ name, framework: 'React', language: 'TypeScript' });
        libraryId = created.id;
        libraryName = created.name;
        // El proyecto queda enlazado, de modo que los guardados posteriores
        // publican en la misma librería en vez de crear otra.
        setBackendLibraryId(project.id, libraryId);
      }

      for (const { componentId, item } of entries) {
        // Se publica el TSX emitido y también el árbol: sin el árbol el
        // componente entra al catálogo como «solo código» y no se puede reabrir.
        const saved = await saveComponent(libraryId, {
          name: item.name,
          sourceCode: reactEmitter.emit({
            blocks: item.blocks,
            rootIds: item.rootIds,
            vars: item.stateVars,
          }),
          treeJson: JSON.stringify({
            blocks: item.blocks,
            rootIds: item.rootIds,
            stateVars: item.stateVars,
          }),
        });
        setSavedComponentId(project.id, componentId, saved.id);
      }

      outcome.libraryName = libraryName;
      setProjectVersion((v) => v + 1);
    } catch (err) {
      outcome.libraryError = err instanceof Error ? err.message : 'error desconocido';
    }

    return outcome;
  }, [active, project, assistantLibraries]);

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
    // La extensión sale del emisor: un SFC descargado como `.tsx` no lo abriría
    // ninguna herramienta de Vue.
    a.download = `Component.${getEmitter(state.framework).extension}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg('Descargado');
    setTimeout(() => setExportMsg(null), 2000);
  }, [code, state.framework]);

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
                title={`Descargar .${getEmitter(state.framework).extension}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                .{getEmitter(state.framework).extension}
              </button>
              {/*
                Las librerías del backend son React+TS: guardar ahí un SFC
                dejaría en el catálogo un componente que no se puede ni
                previsualizar ni compilar como lo que dice ser.
              */}
              {getEmitter(state.framework).verifiable && <SaveToLibraryButton code={code} />}
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
                    {/*
                      El sandbox transpila con Babel y monta React: un SFC de Vue
                      no se puede previsualizar ahí. Decirlo es preferible a
                      mostrar un iframe en blanco o un error de sintaxis, que es
                      lo que saldría al pasarle el `.vue` como si fuera TSX.
                    */}
                    {getEmitter(state.framework).verifiable ? (
                      <DevicePreview
                        sourceCode={code}
                        // En el preview el componente se monta suelto, sin el
                        // contenedor `.visualiza-component` del paquete, así que
                        // el tema se ancla al body del propio iframe.
                        themeCss={themeCss(state.theme, 'body', '', true)}
                        componentCss={state.customStyles}
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center gap-2 bg-white text-center px-8">
                        <p className="text-sm text-slate-600">
                          La vista previa solo está disponible en React + TypeScript.
                        </p>
                        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                          El sandbox monta React dentro de un iframe, así que no puede ejecutar
                          un SFC de {getEmitter(state.framework).label}. El lienzo del modo
                          Interactivo sí refleja el comportamiento, y el código emitido está en
                          la pestaña Código.
                        </p>
                      </div>
                    )}
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
                {rightPanel === 'ai' && (
                  <AiChatPanel
                    onCreateComponents={active ? createAssistantComponents : undefined}
                    librariesJson={librariesJson}
                    projectJson={projectJson}
                  />
                )}
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
