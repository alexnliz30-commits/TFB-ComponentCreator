import { useEffect, useMemo, useRef, useState } from 'react';
import { BuilderView } from './builder/BuilderView';
import { LibrariesView } from './libraries/LibrariesView';
import { ExperimentView } from './ExperimentView';
import { HomeView } from './projects/HomeView';
import { getProject, importSavedComponent, type Project } from './projects/storage';
import { parseTree } from './builder/emit-library';
import { DesignerGate } from './access/DesignerGate';
import { clearDesignerAccess, hasDesignerAccess } from './api/designer-access';
import type { LibrarySummary, SavedComponent } from './api/libraries';

type View = 'home' | 'builder' | 'libraries' | 'experiment';

/** Proyecto y componente activos en el constructor. */
export interface ActiveProject {
  projectId: string;
  componentId: string;
}

export type NavGuard = (action: () => void) => void;

export default function App() {
  const [view, setView] = useState<View>('home');
  const [active, setActive] = useState<ActiveProject | null>(null);
  /** Lo rellena el constructor cuando hay cambios sin guardar, para interceptar la navegación. */
  const navGuardRef = useRef<NavGuard | null>(null);

  /**
   * Vistas que necesitan un proyecto abierto: el constructor y las librerías.
   *
   * El constructor porque edita el contenido de un proyecto. Las librerías
   * porque, desde que cada proyecto tiene su propio código (RF11), el acceso al
   * catálogo se concede POR PROYECTO: sin saber cuál se está abriendo, la puerta
   * no sabría qué código pedir. El Experimento queda fuera —es de los
   * participantes, anónimos por diseño— y por eso sigue sin pedir nada.
   *
   * De paso resuelve lo que se veía en un navegador recién estrenado: sin
   * ningún proyecto creado, las dos pestañas llevaban a una puerta pidiendo una
   * llave que todavía no existía. Ahora ni siquiera se ofrecen, y el único
   * camino es el que de verdad funciona: crear el proyecto primero.
   */
  const needsProject = (v: View) => v === 'builder' || v === 'libraries';

  /**
   * Cambios en la lista de proyectos, que Inicio comunica al crear o borrar.
   *
   * Sin esto, el proyecto abierto se leía una sola vez y se quedaba cacheado:
   * borrarlo desde Inicio no lo desalojaba de aquí, así que las pestañas seguían
   * habilitadas y el Constructor abría un proyecto que ya no existía.
   */
  const [projectsVersion, setProjectsVersion] = useState(0);

  /**
   * Proyecto abierto, releído del almacenamiento.
   *
   * Hace falta entero —y no solo su id— porque la puerta necesita su nombre y su
   * `serverId` para saber de quién es el código que pide. Vale `null` tanto si no
   * hay ninguno abierto como si el que había ya no existe.
   */
  const activeProject = useMemo(
    () => (active ? getProject(active.projectId) : null),
    [active, projectsVersion],
  );

  /*
    El proyecto manda sobre la vista, no al revés.

    Se bloquea por el proyecto REAL y no por el identificador guardado: si el
    proyecto se borró, tener su id en la mano no es tenerlo abierto.
  */
  const locked = activeProject === null;

  /**
   * Desaloja el proyecto que ha dejado de existir.
   *
   * Borrar el proyecto abierto —o todos— dejaba el identificador colgando: las
   * pestañas seguían seleccionables y entrar al Constructor mostraba un proyecto
   * fantasma. Al vaciarlo, el Constructor y las Librerías se desmontan, que es
   * lo que de verdad limpia el lienzo y el estado que colgaba de él.
   *
   * Vuelve a Inicio con `setView` y no con `navigate`: la guardia de cambios sin
   * guardar pertenece a un proyecto que ya no está, y preguntar «¿seguro que
   * quieres salir sin guardar?» sobre algo recién borrado es ofrecer una opción
   * que no existe.
   */
  useEffect(() => {
    if (!active || activeProject) return;
    setActive(null);
    navGuardRef.current = null;
    setView((v) => (needsProject(v) ? 'home' : v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeProject]);

  const gated = activeProject
    ? { name: activeProject.name, serverId: activeProject.serverId }
    : null;

  // Acceso al constructor (RF11). Se lleva en estado además de en el
  // almacenamiento para que cerrar sesión repinte la cabecera al momento.
  const [designer, setDesigner] = useState(hasDesignerAccess);

  // Borrar un proyecto olvida su código, así que la cabecera puede quedarse
  // ofreciendo «Salir» de una sesión que ya no abre nada.
  useEffect(() => { setDesigner(hasDesignerAccess()); }, [projectsVersion]);

  function openProject(project: Project, componentId: string) {
    setActive({ projectId: project.id, componentId });
    setView('builder');
  }

  function navigate(v: View) {
    if (v === view) return;
    if (view === 'builder' && navGuardRef.current) navGuardRef.current(() => setView(v));
    else setView(v);
  }

  /**
   * Abre en el constructor un componente del catálogo de Librerías.
   *
   * El catálogo es la fuente de verdad de la librería, pero el constructor
   * trabaja siempre dentro de un proyecto local, así que editar significa
   * traerse el árbol al proyecto abierto. `importSavedComponent` reutiliza la
   * entrada si ese mismo componente ya se había traído antes: si no, abrir dos
   * veces desde el catálogo dejaría copias divergentes que al guardar se
   * pisarían la una a la otra en el backend.
   */
  function editFromLibrary(_library: LibrarySummary, component: SavedComponent) {
    if (!active) return;
    const tree = parseTree(component.treeJson);
    if (!tree) return;

    const imported = importSavedComponent(active.projectId, {
      id: component.id,
      name: component.name,
      tree: {
        blocks: tree.blocks,
        rootIds: tree.rootIds,
        stateVars: tree.stateVars,
        customStyles: tree.customStyles,
        stylesLanguage: tree.stylesLanguage,
        // El modelo y las props de función son parte del componente, no
        // decoración: sin ellos el repetidor se abre apagado y los avisos
        // desaparecen, y el siguiente guardado publica esa versión mutilada.
        model: tree.model,
        callbacks: tree.callbacks,
      },
    });
    if (!imported) return;

    setActive({ projectId: active.projectId, componentId: imported.id });
    setView('builder');
  }

  const navBtn = (v: View, label: string) => {
    const disabled = locked && needsProject(v);
    return (
      <button
        onClick={() => navigate(v)}
        disabled={disabled}
        title={disabled ? 'Se trabaja siempre dentro de un proyecto: crea o abre uno primero' : undefined}
        className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all
          ${view === v ? 'bg-white text-slate-900 shadow-sm'
            : disabled ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-500 hover:text-slate-700'}`}
      >
        {label}
      </button>
    );
  };

  return (
    <main className={`bg-slate-100 ${view !== 'experiment' ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen'}`}>
      <header className="bg-white border-b border-slate-200 px-6 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-none">Visualiza</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">UI Builder + IA</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {navBtn('home', 'Inicio')}
              {navBtn('builder', 'Constructor')}
              {navBtn('libraries', 'Librerías')}
              {navBtn('experiment', 'Experimento')}
            </nav>
            {designer && (
              <button
                onClick={() => { clearDesignerAccess(); setDesigner(false); navigate('home'); }}
                title="Olvidar el código de acceso en este navegador"
                className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      {view === 'home' && (
        <HomeView
          onOpen={openProject}
          onProjectsChanged={() => setProjectsVersion((v) => v + 1)}
        />
      )}
      {/*
        Constructor y Librerías van tras la puerta del proyecto abierto; el
        Experimento no. Los participantes se identifican con su código de sesión y
        son anónimos por diseño: pedirles además el del diseñador rompería el
        protocolo.

        La `key` es la que hace que cambiar de proyecto vuelva a preguntar: el
        estado «abierta» de la puerta se calcula al montarla, así que sin
        remontarla, salir de un proyecto y entrar en otro heredaría el permiso del
        primero.
      */}
      {view === 'builder' && (
        <DesignerGate key={`builder-${active?.projectId}`} project={gated} onUnlocked={() => setDesigner(true)}>
          <BuilderView
            active={active}
            onSwitchComponent={(componentId) => setActive(active ? { ...active, componentId } : null)}
            onExit={() => { setActive(null); setView('home'); }}
            navGuardRef={navGuardRef}
          />
        </DesignerGate>
      )}
      {view === 'libraries' && (
        <DesignerGate key={`libraries-${active?.projectId}`} project={gated} onUnlocked={() => setDesigner(true)}>
          <LibrariesView onEditComponent={active ? editFromLibrary : undefined} />
        </DesignerGate>
      )}
      {view === 'experiment' && (
        <div className="max-w-[1600px] mx-auto p-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[calc(100vh-90px)]">
            <ExperimentView />
          </div>
        </div>
      )}
    </main>
  );
}
