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
import { DEFAULT_FRAMEWORK, currentCode, getEmitter, puedePublicarse, type CodeEmitter } from './emitters';
import { DropHintProvider, type DropHint } from './drop-hint';
import { themeCss } from './theme';
import { TEMPLATES } from './templates';
import type { BlockType, BuilderState, CallbackProp, CenterTab, StateVar, StylesLanguage } from './types';
import { EMPTY_MODEL, type DataModel } from './data-model';
import { getDefinition } from './defaults';
import {
  createLibrary, deleteComponent as deleteLibraryComponent, listLibraries, saveComponent,
  type LibrarySummary,
} from '../api/libraries';
import { ApiError } from '../api/client';
import {
  addComponent, componentLibraryId, getProject, libraryIdFor, linkedLibraryIds, removeComponent,
  saveComponentTree, saveProjectTheme, setBackendLibraryId, setComponentLibrary, setSavedComponentId,
  unlinkBackendLibrary,
} from '../projects/storage';
import type { ActiveProject, NavGuard } from '../App';
import type { MutableRefObject } from 'react';

type RightPanel = 'none' | 'props' | 'ai' | 'theme';

/**
 * Nombre de la librería de un destino dentro de un proyecto.
 *
 * Con un solo destino se llama como el proyecto, que es lo de siempre. En cuanto
 * hay dos, el nombre tiene que distinguirlas o el catálogo enseñaría dos
 * entradas idénticas y elegir entre ellas sería adivinar.
 */
function nombreDeLibreria(proyecto: string, emisor: CodeEmitter): string {
  return emisor.key === DEFAULT_FRAMEWORK ? proyecto : `${proyecto} · ${emisor.label}`;
}

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
  target: string;
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
    g.componentName, g.model, g.callbacks, g.target,
  ]);
}

/**
 * Árbol serializado tal y como lo espera `parseTree`, para publicarlo al catálogo.
 *
 * No es la huella. Se separan porque tienen contratos distintos: la huella es un
 * array posicional que solo sirve para comparar, mientras que el catálogo guarda
 * un OBJETO con claves (`blocks`, `rootIds`, …) porque es lo que hay que volver a
 * leer. Publicar la huella —que es lo que se hacía— dejaba en `treeJson` una
 * cadena que `parseTree` rechaza en silencio: el backend marcaba el componente
 * como editable porque el campo no venía vacío, pero al reabrirlo desde Librerías
 * no había árbol, y al exportar la librería el componente caía a la rama «sin
 * árbol» y salía del zip como un fichero suelto en lugar de su carpeta.
 */
function arbolPersistible(g: Guardable): string {
  return JSON.stringify({
    blocks: g.blocks,
    rootIds: g.rootIds,
    stateVars: g.stateVars,
    customStyles: g.customStyles,
    stylesLanguage: g.stylesLanguage,
    model: g.model,
    callbacks: g.callbacks,
  });
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
  /** Plantilla a la espera del segundo clic; `null` si no hay ninguna. */
  const [confirmarPlantilla, setConfirmarPlantilla] = useState<string | null>(null);
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
  const guardable = useMemo<Guardable>(
    () => ({
      blocks: state.blocks,
      rootIds: state.rootIds,
      stateVars: state.stateVars,
      customStyles: state.customStyles,
      stylesLanguage: state.stylesLanguage,
      componentName: state.componentName,
      model: state.model,
      callbacks: state.callbacks,
      target: state.framework,
    }),
    [state.blocks, state.rootIds, state.stateVars, state.customStyles, state.stylesLanguage,
      state.componentName, state.model, state.callbacks, state.framework],
  );
  /** Solo para comparar con lo último guardado. No se persiste: ver `arbolPersistible`. */
  const firma = useMemo(() => huella(guardable), [guardable]);
  /** Lo que viaja al catálogo como `treeJson`, en la forma que `parseTree` sabe leer. */
  const treeJson = useMemo(() => arbolPersistible(guardable), [guardable]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  /**
   * Se ha cambiado de librería de destino, pero todavía no se ha publicado ahí.
   *
   * Va aparte de la huella porque el destino no es contenido: elegirlo no altera
   * ni un bloque, así que la huella sigue coincidiendo y el botón Guardar se
   * quedaba apagado. El efecto era que elegir una librería no hacía nada visible
   * y no había forma de llevar el componente a ella sin antes tocar el diseño.
   */
  const [publicacionPendiente, setPublicacionPendiente] = useState(false);
  const dirty = project !== null && lastSaved !== null
    && (firma !== lastSaved || publicacionPendiente);
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
      target: activeComponent.target,
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
      target: persisted.target ?? DEFAULT_FRAMEWORK,
    }));
    // La publicación pendiente es de UN componente: sin limpiarla aquí, elegir
    // destino para uno y pasar al siguiente dejaba al segundo anunciando cambios
    // sin guardar que no eran suyos.
    setPublicacionPendiente(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.componentId, activeComponent?.id]);

  /*
    El catálogo de librerías, que ahora hace falta siempre y no solo con el chat.

    Antes se pedía únicamente al abrir el asistente, porque su única razón de ser
    era que la pregunta «¿dónde lo guardo?» ofreciera nombres reales. Desde que
    el destino se elige por componente, la barra del proyecto tiene que poder
    NOMBRAR la librería a la que va lo que estás editando, y eso ocurre antes de
    abrir ningún panel.

    `librariesVersion` fuerza la relectura después de crear una: sin ella, la
    librería recién hecha no aparecería en el desplegable hasta recargar.
  */
  const [assistantLibraries, setAssistantLibraries] = useState<LibrarySummary[]>([]);
  const [librariesVersion, setLibrariesVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listLibraries()
      .then((all) => { if (!cancelled) setAssistantLibraries(all); })
      // Sin backend el constructor sigue funcionando: solo ofrecerá crear una
      // librería nueva o ninguna, que es la verdad en ese momento.
      .catch(() => { if (!cancelled) setAssistantLibraries([]); });
    return () => { cancelled = true; };
  }, [librariesVersion]);

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
      target: state.framework,
    }, nombre);
    saveProjectTheme(project.id, state.theme);
    setLastSaved(firma);
    setPublicacionPendiente(false);
    /*
      Proyecto «librería consolidada»: publica el código emitido en el backend.

      La librería se busca —y se crea si hace falta— POR DESTINO. Un proyecto
      puede tener una de TypeScript y otra de JavaScript a la vez, porque el
      idioma lo declara el catálogo: meter un JSX en una librería que se anuncia
      como TypeScript dejaría el catálogo mintiendo, y quien descargara el
      paquete se encontraría con dos cadenas de compilación en vez de una.

      Si la librería no llegó a crearse (backend caído), se reintenta aquí: la
      consolidación se auto-repara en el primer guardado con backend disponible.
    */
    const emisor = getEmitter(state.framework);
    /*
      Dónde acaba ESTE componente.

      `undefined` = nadie ha elegido, así que manda el proyecto: los de tipo
      «librería» publican en la suya —creándola si hace falta, como siempre— y
      los de componentes sueltos no publican. `null` = alguien eligió que este
      componente NO se publique, y eso no puede deshacerlo el tipo del proyecto.
      Una cadena = va a esa librería aunque el proyecto tenga otra, que es lo que
      permite repartir los componentes de un proyecto entre varios kits.
    */
    const destino = componentLibraryId(project, activeComponent, emisor.key);
    const publica = destino !== null
      && puedePublicarse(state.framework)
      && (destino !== undefined || project.kind === 'library');

    if (publica) {
      /** Da de alta la librería del proyecto para este destino, o reutiliza la que ya está. */
      const libreriaDelProyecto = async (): Promise<string> => {
        const idioma = emisor.lang === 'js' ? 'JavaScript' : 'TypeScript';
        const nombre = nombreDeLibreria(project.name, emisor);
        /*
          Antes de dar de alta una, se mira si ya existe la que tocaría.

          Crear una librería desde el desplegable de destino ya no la elige como
          tal —son dos decisiones—, así que un proyecto de tipo «librería» podía
          llegar aquí con su librería ya creada pero sin enlazar, y el alta ciega
          producía una segunda con el mismo nombre. Dos entradas idénticas en el
          catálogo y elegir entre ellas es adivinar.
        */
        const existente = assistantLibraries.find(
          (l) => l.name === nombre && l.framework === emisor.frameworkName && l.language === idioma,
        );
        const lib = existente ?? await createLibrary({
          name: nombre,
          framework: emisor.frameworkName,
          language: idioma,
        });
        setBackendLibraryId(project.id, emisor.key, lib.id);
        return lib.id;
      };

      // Se publica el árbol además del TSX: es lo único que permite reabrir el
      // componente desde el catálogo de Librerías y seguir editándolo, porque
      // del código emitido no hay vuelta atrás. Y se manda `componentId` para
      // que el guardado sea una revisión y no una copia más en el catálogo.
      const publicar = (libraryId: string) => saveComponent(libraryId, {
        name: nombre,
        sourceCode: currentCode(state),
        treeJson,
        componentId: activeComponent.savedComponentId,
      });

      try {
        let libraryId = destino ?? await libreriaDelProyecto();
        let saved;
        try {
          saved = await publicar(libraryId);
        } catch (error) {
          /*
            404 = el enlace apunta a una librería que ya no está en el catálogo.

            Pasa en cuanto alguien la borra desde la pestaña Librerías, y no era
            un caso raro: el proyecto guarda su identificador y nadie se lo
            quitaba. El guardado fallaba contra ella, el `catch` de fuera se
            tragaba el error y el componente no llegaba nunca al catálogo —con el
            botón diciendo «guardado»—. Aquí se suelta el enlace muerto y se
            publica en una limpia, que es la autorreparación que el proyecto
            prometía desde siempre y no hacía.
          */
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          unlinkBackendLibrary(libraryId);
          setComponentLibrary(project.id, activeComponent.id, emisor.key, null);
          libraryId = await libreriaDelProyecto();
          setComponentLibrary(project.id, activeComponent.id, emisor.key, libraryId);
          saved = await publicar(libraryId);
          setLibrariesVersion((v) => v + 1);
        }

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
  }, [project, active, activeComponent, state, treeJson, firma, assistantLibraries]);

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
        linkedLibraryId: libraryIdFor(project, state.framework) ?? null,
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
        // La tanda se publica en el destino que el constructor tiene abierto:
        // los componentes que acaba de crear el asistente se emiten con ese
        // emisor, así que una librería de otro idioma guardaría un código que no
        // es el que dice ser.
        const emisor = getEmitter(state.framework);
        const name = target.libraryName?.trim() || nombreDeLibreria(project.name, emisor);
        const created = await createLibrary({
          name,
          framework: emisor.frameworkName,
          language: emisor.lang === 'js' ? 'JavaScript' : 'TypeScript',
        });
        libraryId = created.id;
        libraryName = created.name;
        // El proyecto queda enlazado, de modo que los guardados posteriores
        // publican en la misma librería en vez de crear otra.
        setBackendLibraryId(project.id, emisor.key, libraryId);
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
            title={project.kind === 'library' && linkedLibraryIds(project).length === 0
              ? 'El backend no estaba disponible al crear el proyecto: la librería se creará automáticamente en el primer guardado con backend en marcha.'
              : undefined}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
              ${project.kind !== 'library' ? 'bg-slate-700 text-slate-400'
                : linkedLibraryIds(project).length > 0 ? 'bg-violet-500/20 text-violet-300'
                : 'bg-amber-500/20 text-amber-300'}`}
          >
            {project.kind !== 'library' ? 'Sueltos'
              : linkedLibraryIds(project).length > 0 ? 'Librería'
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
          {activeComponent && (
            <BorrarComponente
              nombre={activeComponent.name}
              esElUnico={project.components.length <= 1}
              publicadoEn={activeComponent.savedComponentId
                ? componentLibraryId(project, activeComponent, state.framework) ?? null
                : null}
              onBorrar={async (tambienDelCatalogo) => {
                const libreria = componentLibraryId(project, activeComponent, state.framework);
                const entrada = activeComponent.savedComponentId;
                // El catálogo primero: si se borra el componente local antes y el
                // backend falla, ya no queda a quién preguntarle en qué librería
                // estaba, y la entrada se queda ahí para siempre sin dueño.
                if (tambienDelCatalogo && libreria && entrada) {
                  try {
                    await deleteLibraryComponent(libreria, entrada);
                    setLibrariesVersion((v) => v + 1);
                  } catch {
                    return 'No se pudo borrar del catálogo. ¿Está el backend en marcha?';
                  }
                }
                const siguiente = removeComponent(project.id, activeComponent.id);
                if (siguiente) onSwitchComponent(siguiente.id);
                setProjectVersion((v) => v + 1);
                return null;
              }}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            {activeComponent && puedePublicarse(state.framework) && (
              <DestinoLibreria
                libraries={assistantLibraries}
                emisor={getEmitter(state.framework)}
                destino={componentLibraryId(project, activeComponent, state.framework)}
                heredado={activeComponent.libraryIds?.[state.framework] === undefined}
                proyectoEsLibreria={project.kind === 'library'}
                nombreSugerido={nombreDeLibreria(project.name, getEmitter(state.framework))}
                onElegir={(libraryId) => {
                  setComponentLibrary(project.id, activeComponent.id, state.framework, libraryId);
                  setProjectVersion((v) => v + 1);
                  setPublicacionPendiente(libraryId !== null);
                }}
                // Solo entra en el catálogo y en la lista del desplegable: dónde
                // acaba este componente sigue siendo una decisión aparte.
                onCreada={(lib) => setAssistantLibraries((prev) => [...prev, lib])}
                onAbrir={() => setLibrariesVersion((v) => v + 1)}
              />
            )}
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
                  // Al cerrar el menú se olvida la confirmación pendiente: si no,
                  // volver a abrirlo dejaría una fila esperando un segundo clic
                  // que quien la ve ya no relaciona con nada.
                  onClick={() => { setShowTemplates(!showTemplates); setConfirmarPlantilla(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" /></svg>
                  Templates
                </button>
                {showTemplates && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                    {/*
                      Una plantilla SUSTITUYE el lienzo, no se añade a él.

                      Sobre un lienzo vacío eso es lo esperado y no hay nada que
                      preguntar. Sobre uno con trabajo dentro es una pérdida, y
                      aunque `LOAD_TEMPLATE` entra en el historial y Ctrl+Z lo
                      devuelve, eso solo lo sabe quien ya conoce la herramienta.

                      La confirmación es un segundo clic sobre la misma fila, no
                      un `window.confirm`: el diálogo nativo detiene todo el hilo
                      del navegador y además desentona con el resto de la
                      aplicación, que ya confirma dentro de la propia interfaz
                      (borrar una librería, por ejemplo).
                    */}
                    {TEMPLATES.map((t) => {
                      const pidePermiso = state.rootIds.length > 0;
                      const confirmando = confirmarPlantilla === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            if (pidePermiso && !confirmando) {
                              setConfirmarPlantilla(t.id);
                              return;
                            }
                            dispatch({
                              type: 'LOAD_TEMPLATE',
                              blocks: t.blocks,
                              rootIds: t.rootIds,
                              stateVars: t.stateVars,
                            });
                            setConfirmarPlantilla(null);
                            setShowTemplates(false);
                          }}
                          className={`w-full text-left px-3 py-2 transition-colors ${
                            confirmando ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                        >
                          <div className={`text-xs font-medium ${
                            confirmando ? 'text-amber-700' : 'text-slate-700'}`}
                          >
                            {confirmando ? `Reemplazar el lienzo por «${t.label}»` : t.label}
                          </div>
                          <div className={`text-[10px] ${
                            confirmando ? 'text-amber-600' : 'text-slate-400'}`}
                          >
                            {confirmando ? 'Pulsa otra vez para confirmar' : t.description}
                          </div>
                        </button>
                      );
                    })}
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
                Solo los destinos que saben entregarse como carpeta se publican.
                Un destino sin paquete entraría al catálogo como fuente suelto:
                la librería exportada no podría darle ni props ni punto de
                entrada, y el catálogo prometería una pieza reutilizable que no
                lo es. Hoy lo cumplen los ocho; la condición se queda para el
                siguiente, que nacerá otra vez sin paquete.
              */}
              {puedePublicarse(state.framework)
                && <SaveToLibraryButton
                  code={code}
                  emisor={getEmitter(state.framework)}
                  // Con qué nombre nacería la librería si no hay ninguna todavía:
                  // el mismo que usa el guardado del proyecto, para que las dos
                  // vías no creen dos librerías distintas del mismo proyecto.
                  nombreDeLibreriaSugerido={project ? nombreDeLibreria(project.name, getEmitter(state.framework)) : ''}
                  onCatalogoCambiado={() => setLibrariesVersion((v) => v + 1)}
                  treeJson={treeJson}
                  savedComponentId={activeComponent?.savedComponentId}
                  defaultName={state.componentName}
                  onSaved={(id, libraryId) => {
                    if (!project || !activeComponent) return;
                    /*
                      Este botón y el «Guardar» del proyecto se pisaban.

                      Guardar aquí en la librería A dejaba `savedComponentId`
                      apuntando a una entrada de A, y el guardado del proyecto
                      lo reenviaba a SU librería B; el backend busca ese id
                      dentro de B, no lo encuentra y da de alta una copia. El
                      componente acababa duplicado en dos catálogos y cada
                      botón revisaba el suyo. Anotando aquí el destino, los dos
                      publican en el mismo sitio.
                    */
                    setComponentLibrary(project.id, activeComponent.id, state.framework, libraryId);
                    setSavedComponentId(project.id, activeComponent.id, id);
                    setProjectVersion((v) => v + 1);
                    setPublicacionPendiente(false);
                    setLibrariesVersion((v) => v + 1);
                  }}
                />}
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
                      El sandbox monta el framework del destino, no siempre React:
                      con Vue compila el SFC y con Angular arranca la aplicación.
                      Antes solo sabía ejecutar JSX y los demás destinos veían un
                      cartel en lugar de su componente, que es tanto como decir
                      que el constructor solo se podía juzgar en React.
                    */}
                    <DevicePreview
                      sourceCode={code}
                      // En el preview el componente se monta suelto, sin el
                      // contenedor `.visualiza-component` del paquete, así que
                      // el tema se ancla al body del propio iframe.
                      themeCss={themeCss(state.theme, 'body', '', true)}
                      componentCss={state.customStyles}
                      target={state.framework}
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
                onClick={() => { const go = pendingNav; setPendingNav(null); setLastSaved(firma); go(); }}
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

/**
 * Dónde acaba este componente al guardar.
 *
 * Existe porque el destino lo fijaba el PROYECTO entero: todos sus componentes
 * iban a la misma librería y la única forma de repartirlos entre varios kits era
 * crear un proyecto por kit. La elección es por componente y por destino de
 * emisión, y se ve sin abrir nada: el guardado publica en un sitio concreto, así
 * que la barra tiene que decir en cuál antes de pulsarlo, no después.
 */
function DestinoLibreria({
  libraries, emisor, destino, heredado, proyectoEsLibreria, nombreSugerido, onElegir, onCreada,
  onAbrir,
}: {
  libraries: LibrarySummary[];
  emisor: CodeEmitter;
  /** `null` = no publicar; `undefined` = nadie eligió, manda el proyecto. */
  destino: string | null | undefined;
  /** ¿El destino viene del proyecto en vez de una elección propia? */
  heredado: boolean;
  proyectoEsLibreria: boolean;
  nombreSugerido: string;
  onElegir: (libraryId: string | null) => void;
  onCreada: (lib: LibrarySummary) => void;
  /** Se pide al abrir: el catálogo puede haber cambiado por otras vías. */
  onAbrir: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Nombre de la que se acaba de crear, para confirmarlo sin cerrar el panel. */
  const [recienCreada, setRecienCreada] = useState<string | null>(null);

  /*
    Solo las librerías del MISMO destino que se está emitiendo.

    El par framework + lenguaje es lo que el catálogo promete de cada entrada:
    ofrecer una librería de JavaScript para guardar TSX dejaría el catálogo
    mintiendo sobre lo que contiene, y quien se descargara el paquete se
    encontraría dos cadenas de compilación en vez de una.
  */
  const idioma = emisor.lang === 'js' ? 'JavaScript' : 'TypeScript';
  const compatibles = libraries.filter(
    (l) => l.framework === emisor.frameworkName && l.language === idioma,
  );

  const elegida = destino ? compatibles.find((l) => l.id === destino) : undefined;
  // Si la que se propone crear ya está, ofrecerla otra vez solo produce dos
  // entradas homónimas entre las que elegir es adivinar.
  const yaExiste = compatibles.some((l) => l.name === nombreSugerido);
  const etiqueta = destino === null ? 'Sin publicar'
    : elegida ? elegida.name
    : destino ? 'Librería enlazada'
    : proyectoEsLibreria ? `Se creará «${nombreSugerido}»`
    : 'Sin publicar';

  /**
   * Crea la librería y la deja VACÍA y sin elegir.
   *
   * Antes crear y elegir eran el mismo gesto, así que la librería nueva nacía ya
   * con el componente que estuviera abierto dentro en cuanto se guardaba. Quien
   * crea una librería suele querer justo lo contrario: tenerla en blanco para ir
   * metiendo a mano los componentes que le corresponden. Son dos decisiones y
   * ahora se toman por separado; la recién creada aparece arriba en la lista,
   * esperando a que la elijan.
   */
  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const lib = await createLibrary({
        name: nombreSugerido,
        framework: emisor.frameworkName,
        language: idioma,
      });
      onCreada(lib);
      setRecienCreada(lib.name);
    } catch {
      setError('No se pudo crear. ¿Está el backend en marcha?');
    } finally {
      setCreando(false);
    }
  }

  function elegir(libraryId: string | null) {
    onElegir(libraryId);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        /*
          Al abrir se vuelve a leer el catálogo, en vez de fiarse de la lista que
          se trajo al montar la vista.

          Esta pantalla no es la única que crea librerías: están el panel del
          marcador, la pestaña Librerías y hasta otra pestaña del navegador. Con
          una lista cacheada, una librería recién creada por cualquiera de esas
          vías no aparecía aquí —el desplegable insistía en que no había
          ninguna— y «+ Crear» acababa dando de alta una segunda con el mismo
          nombre.
        */
        onClick={() => {
          const abriendo = !open;
          setOpen(abriendo);
          if (abriendo) { setRecienCreada(null); onAbrir(); }
        }}
        title={`Al guardar, este componente se publica en: ${etiqueta}`}
        className={`flex items-center gap-1.5 max-w-[240px] px-2 py-1 rounded-md text-[11px] transition-colors
          ${open ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5V6a2 2 0 012-2h3v16H6a2 2 0 00-2 1.5zM12 4h3a2 2 0 012 2v13h-5V4z" />
        </svg>
        <span className="truncate">{etiqueta}</span>
        {/*
          La elección propia se marca: si no, «heredado del proyecto» y «elegido
          a mano» se ven igual, y no habría forma de saber cuál de los dos va a
          cambiar solo el día que cambie la librería del proyecto.
        */}
        {!heredado && destino !== undefined && <span className="text-blue-400 shrink-0">•</span>}
        <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 text-slate-700">
          <p className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Guardar este componente en
          </p>

          {compatibles.map((l) => (
            <button
              key={l.id}
              onClick={() => elegir(l.id)}
              className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors
                ${destino === l.id ? 'bg-blue-50 text-blue-800 font-medium' : 'hover:bg-slate-100'}`}
            >
              <span className="block truncate">{l.name}</span>
              <span className="block text-[10px] text-slate-400">
                {l.componentCount} componente{l.componentCount === 1 ? '' : 's'}
              </span>
            </button>
          ))}

          {compatibles.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-slate-500">
              No hay ninguna librería de {emisor.label}.
            </p>
          )}

          <div className="h-px bg-slate-100 my-1.5" />

          {!yaExiste && (
            <button
              onClick={crear}
              disabled={creando}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
            >
              {creando ? 'Creando…' : `+ Crear «${nombreSugerido}»`}
            </button>
          )}
          <button
            onClick={() => elegir(null)}
            className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors
              ${destino === null ? 'bg-slate-100 font-medium' : 'hover:bg-slate-100'}`}
          >
            Sin publicar
            <span className="block text-[10px] text-slate-400">Se queda solo en este proyecto</span>
          </button>

          {recienCreada && (
            <p className="px-2 pt-1.5 text-[11px] text-emerald-700 leading-snug">
              «{recienCreada}» creada y vacía. Elígela arriba si quieres guardar
              este componente en ella.
            </p>
          )}
          {error && <p className="px-2 pt-1.5 text-[11px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Borrado de un componente del proyecto, y opcionalmente del catálogo.
 *
 * Son dos sitios distintos y por eso se preguntan por separado: el componente
 * vive en el proyecto del navegador y, si se ha publicado, también como entrada
 * de una librería que puede tener otros consumidores. Borrar el local sin más
 * dejaba la entrada del catálogo sin nadie que la reclamara; borrar las dos
 * siempre sería decidir por el usuario sobre algo compartido.
 */
function BorrarComponente({ nombre, esElUnico, publicadoEn, onBorrar }: {
  nombre: string;
  esElUnico: boolean;
  /** Librería donde está publicado, o `null` si no lo está. */
  publicadoEn: string | null;
  /** Devuelve el motivo del fallo, o `null` si fue bien. */
  onBorrar: (tambienDelCatalogo: boolean) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [tambien, setTambien] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setBorrando(true);
    const fallo = await onBorrar(tambien);
    setBorrando(false);
    if (fallo) { setError(fallo); return; }
    setOpen(false);
    setError(null);
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setError(null); setTambien(false); }}
        disabled={esElUnico}
        title={esElUnico
          ? 'Es el único componente del proyecto: para deshacerte de él, elimina el proyecto desde Inicio'
          : `Eliminar «${nombre}» del proyecto`}
        className="text-xs text-slate-400 hover:text-red-400 disabled:text-slate-700 disabled:hover:text-slate-700
          disabled:cursor-not-allowed px-1.5 py-1 rounded hover:bg-slate-800 disabled:hover:bg-transparent transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M10 7V5.5A1.5 1.5 0 0111.5 4h1A1.5 1.5 0 0114 5.5V7m-7 0 .7 11a2 2 0 002 1.9h4.6a2 2 0 002-1.9L19 7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-3 text-slate-700">
          <p className="text-xs font-medium text-slate-800">¿Eliminar «{nombre}»?</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Se quita de este proyecto. No se puede deshacer.
          </p>

          {publicadoEn && (
            <label className="mt-2.5 flex items-start gap-2 rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2 cursor-pointer hover:border-slate-300 transition-colors">
              <input
                type="checkbox"
                checked={tambien}
                onChange={(e) => setTambien(e.target.checked)}
                className="mt-0.5 w-3 h-3 accent-red-600"
              />
              <span className="text-[11px] text-slate-600 leading-snug">
                Eliminar también su entrada del <strong className="font-medium">catálogo</strong>.
                Si no lo marcas, seguirá publicada en la librería.
              </span>
            </label>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={confirmar}
              disabled={borrando}
              className="flex-1 bg-red-600 text-white text-[11px] font-medium px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {borrando ? 'Eliminando…' : 'Eliminar'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-slate-600 px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>

          {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Guardado puntual en una librería, desde la barra del constructor.
 *
 * Publica **el árbol además del código**, igual que el guardado del proyecto.
 * Sin el árbol el componente entraba al catálogo como «solo fuente»: no se
 * podía reabrir para editarlo y, al exportar la librería, salía como un único
 * fichero suelto en vez de su carpeta con props, hook y estilos — el mismo
 * componente daba dos paquetes distintos según por dónde se hubiera guardado.
 * Y va con `componentId`, para que volver a guardar sea una revisión y no otra
 * copia en el catálogo.
 */
function SaveToLibraryButton({
  code, emisor, treeJson, savedComponentId, defaultName, nombreDeLibreriaSugerido, onSaved,
  onCatalogoCambiado,
}: {
  code: string;
  emisor: CodeEmitter;
  treeJson: string;
  savedComponentId?: string;
  defaultName: string;
  /** Nombre con el que crear la librería si el destino no tiene ninguna. */
  nombreDeLibreriaSugerido: string;
  /** Avisa de que el catálogo cambió, para que el resto de la pantalla no se quede atrás. */
  onCatalogoCambiado: () => void;
  /** Recibe la entrada creada Y la librería donde quedó, que es la que hay que recordar. */
  onSaved: (id: string, libraryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [libraries, setLibraries] = useState<LibrarySummary[] | null>(null);
  const [libraryId, setLibraryId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function openDialog() {
    setOpen(true);
    setStatus('idle');
    // El nombre por defecto es el del componente abierto: guardarlo con otro
    // crearía un duplicado en el catálogo en vez de revisar el que ya está.
    if (!name.trim()) setName(defaultName);
    try {
      /*
        Solo las librerías del MISMO destino que se está emitiendo.

        Filtrar por «React + TypeScript» a secas escondía las librerías de
        JavaScript aunque fuera exactamente eso lo que el constructor acababa de
        emitir: el usuario veía «no hay librerías» con la suya delante. El
        criterio correcto es el par framework + lenguaje, porque es lo que el
        catálogo promete de cada entrada.
      */
      const idioma = emisor.lang === 'js' ? 'JavaScript' : 'TypeScript';
      const all = await listLibraries();
      const compatibles = all.filter((l) => l.framework === emisor.frameworkName && l.language === idioma);
      setLibraries(compatibles);
      if (compatibles.length > 0) setLibraryId(compatibles[0].id);
    } catch {
      setLibraries([]);
    }
  }

  /**
   * Crea la librería que falta, con el nombre del proyecto.
   *
   * Sin esto el panel era un callejón sin salida: si el destino no tenía ninguna
   * librería compatible —porque es la primera vez, o porque se borró desde el
   * catálogo— lo único que decía era «Crea una en la pestaña Librerías», que
   * obliga a abandonar lo que estabas haciendo, adivinar el framework y el
   * lenguaje correctos, y volver. Y era además incoherente con el otro botón de
   * guardar de esta misma pantalla, el del proyecto, que lleva desde siempre
   * creándola sola cuando falta.
   */
  async function crearLibreria() {
    if (!nombreDeLibreriaSugerido.trim()) return;
    setStatus('saving');
    try {
      const lib = await createLibrary({
        name: nombreDeLibreriaSugerido.trim(),
        framework: emisor.frameworkName,
        language: emisor.lang === 'js' ? 'JavaScript' : 'TypeScript',
      });
      setLibraries([lib]);
      setLibraryId(lib.id);
      setStatus('idle');
      // Este panel tenía su propia lista y se la guardaba: la librería que creaba
      // aquí no existía para el selector de destino de la barra, que seguía
      // diciendo «no hay ninguna» con ella recién hecha delante.
      onCatalogoCambiado();
    } catch {
      setStatus('error');
    }
  }

  async function handleSave() {
    if (!libraryId || !name.trim()) return;
    setStatus('saving');
    try {
      const saved = await saveComponent(libraryId, {
        name: name.trim(),
        sourceCode: code,
        treeJson,
        componentId: savedComponentId,
      });
      onSaved(saved.id, libraryId);
      setStatus('saved');
      setTimeout(() => { setOpen(false); setStatus('idle'); }, 1200);
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
          {libraries !== null && libraries.length === 0 && nombreDeLibreriaSugerido.trim() && (
            <>
              <p className="text-xs text-slate-500">
                Todavía no hay ninguna librería de {emisor.label} para este proyecto.
              </p>
              <button
                onClick={crearLibreria}
                disabled={status === 'saving'}
                className="w-full bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {status === 'saving' ? 'Creando…' : `Crear «${nombreDeLibreriaSugerido}»`}
              </button>
              {status === 'error' && (
                <p className="text-[11px] text-red-500">No se pudo crear. ¿Está el backend en marcha?</p>
              )}
            </>
          )}
          {/*
            Sin proyecto abierto no hay nombre que proponer —el lienzo suelto no
            pertenece a ninguno— así que ahí sí toca ir al catálogo.
          */}
          {libraries !== null && libraries.length === 0 && !nombreDeLibreriaSugerido.trim() && (
            <p className="text-xs text-slate-500">
              No hay librerías de {emisor.label}. Crea una en la pestaña «Librerías».
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
