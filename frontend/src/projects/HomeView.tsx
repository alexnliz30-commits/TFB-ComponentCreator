import { useState } from 'react';
import { createLibrary } from '../api/libraries';
import {
  createProject, deleteProject, listProjects, setBackendLibraryId,
  type Project, type ProjectKind,
} from './storage';

/**
 * Sección inicial: crear un proyecto de componentes o abrir uno existente.
 *
 * El tipo decide el destino del trabajo: «componentes sueltos» se quedan en el
 * proyecto; «librería consolidada» además publica cada componente guardado en
 * la librería equivalente del backend (si está disponible).
 */
export function HomeView({ onOpen }: { onOpen: (project: Project, componentId: string) => void }) {
  const [projects, setProjects] = useState<Project[]>(() => listProjects());
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('loose');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim() || creating) return;
    setCreating(true);
    const project = createProject(name, kind);
    if (kind === 'library') {
      // Mejor esfuerzo: sin backend, el proyecto funciona igual en local.
      try {
        const lib = await createLibrary({ name: name.trim(), framework: 'React', language: 'TypeScript' });
        setBackendLibraryId(project.id, lib.id);
        project.backendLibraryId = lib.id;
      } catch {
        /* backend no disponible: se consolidará cuando lo esté */
      }
    }
    setCreating(false);
    onOpen(project, project.components[0].id);
  }

  function handleDelete(id: string) {
    deleteProject(id);
    setProjects(listProjects());
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900">Tus proyectos de componentes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Crea un proyecto nuevo o continúa donde lo dejaste.
        </p>

        <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700">Nuevo proyecto</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Nombre del proyecto</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Mi kit de interfaz"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Tecnología</span>
              <select
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                defaultValue="react"
              >
                <option value="react">React (TypeScript)</option>
                <option value="vue" disabled>Vue — próximamente</option>
                <option value="angular" disabled>Angular — próximamente</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([
              ['loose', 'Componentes sueltos', 'Componentes independientes dentro del proyecto, para copiar o descargar uno a uno.'],
              ['library', 'Librería consolidada', 'Además de editarse aquí, cada componente guardado se publica en una librería reutilizable.'],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={`text-left rounded-lg border p-3.5 transition-colors
                  ${kind === value ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className={`text-sm font-medium ${kind === value ? 'text-blue-700' : 'text-slate-700'}`}>{label}</span>
                <span className="block text-xs text-slate-500 mt-1 leading-snug">{hint}</span>
              </button>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="mt-5 bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {creating ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>

        {projects.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-slate-700">Proyectos existentes</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div key={p.id} className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                  <button
                    onClick={() => onOpen(p, p.components[0]?.id ?? '')}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 truncate">{p.name}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0
                        ${p.kind === 'library' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                        {p.kind === 'library' ? 'Librería' : 'Sueltos'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      {p.components.length} componente{p.components.length === 1 ? '' : 's'} · React
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Creado el {new Date(p.createdAt).toLocaleDateString('es-ES')}
                    </p>
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    title="Eliminar proyecto"
                    className="absolute top-2 right-2 w-6 h-6 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
