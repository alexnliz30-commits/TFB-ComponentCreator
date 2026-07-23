import { useRef, useState } from 'react';
import { BuilderView } from './builder/BuilderView';
import { LibrariesView } from './libraries/LibrariesView';
import { ExperimentView } from './ExperimentView';
import { HomeView } from './projects/HomeView';
import type { Project } from './projects/storage';

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

  function openProject(project: Project, componentId: string) {
    setActive({ projectId: project.id, componentId });
    setView('builder');
  }

  function navigate(v: View) {
    if (v === view) return;
    if (view === 'builder' && navGuardRef.current) navGuardRef.current(() => setView(v));
    else setView(v);
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
          <nav className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {navBtn('home', 'Inicio')}
            {navBtn('builder', 'Constructor')}
            {navBtn('libraries', 'Librerías')}
            {navBtn('experiment', 'Experimento')}
          </nav>
        </div>
      </header>

      {view === 'home' && <HomeView onOpen={openProject} />}
      {view === 'builder' && (
        <BuilderView
          active={active}
          onSwitchComponent={(componentId) => setActive(active ? { ...active, componentId } : null)}
          onExit={() => { setActive(null); setView('home'); }}
          navGuardRef={navGuardRef}
        />
      )}
      {view === 'libraries' && <LibrariesView />}
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
