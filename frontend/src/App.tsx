import { useRef, useState } from 'react';
import { BuilderView } from './builder/BuilderView';
import { LibrariesView } from './libraries/LibrariesView';
import { ExperimentView } from './ExperimentView';
import { HomeView } from './projects/HomeView';
import { importSavedComponent, type Project } from './projects/storage';
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

  // Sin proyecto abierto solo se puede estar en Inicio: el trabajo vive
  // dentro de un proyecto, así que el resto del menú queda bloqueado.
  const locked = active === null;

  // Acceso al constructor (RF11). Se lleva en estado además de en el
  // almacenamiento para que cerrar sesión repinte la cabecera al momento.
  const [designer, setDesigner] = useState(hasDesignerAccess);

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
      },
    });
    if (!imported) return;

    setActive({ projectId: active.projectId, componentId: imported.id });
    setView('builder');
  }

  const navBtn = (v: View, label: string) => {
    const disabled = locked && v !== 'home';
    return (
      <button
        onClick={() => navigate(v)}
        disabled={disabled}
        title={disabled ? 'Crea o abre un proyecto primero' : undefined}
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

      {view === 'home' && <HomeView onOpen={openProject} />}
      {/*
        Constructor y Librerías van tras la puerta; el Experimento no. Los
        participantes se identifican con su código de sesión y son anónimos por
        diseño: pedirles además el del diseñador rompería el protocolo.
      */}
      {view === 'builder' && (
        <DesignerGate onUnlocked={() => setDesigner(true)}>
          <BuilderView
            active={active}
            onSwitchComponent={(componentId) => setActive(active ? { ...active, componentId } : null)}
            onExit={() => { setActive(null); setView('home'); }}
            navGuardRef={navGuardRef}
          />
        </DesignerGate>
      )}
      {view === 'libraries' && (
        <DesignerGate onUnlocked={() => setDesigner(true)}>
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
