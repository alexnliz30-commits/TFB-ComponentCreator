/**
 * Pantalla inicial: crear un proyecto de componentes o abrir uno existente.
 *
 * El tipo de proyecto decide el destino del trabajo, y por eso se presenta con
 * sus consecuencias explícitas en vez de con una etiqueta: «sueltos» mantiene
 * los componentes dentro del proyecto, y «librería» publica además cada
 * guardado en la librería equivalente del backend, que es la que se puede
 * exportar entera y consultar desde la pestaña Librerías.
 *
 * Sobre la composición: dos columnas en pantallas anchas —formulario a la
 * izquierda, trabajo existente a la derecha— porque son dos tareas distintas
 * (empezar algo nuevo frente a retomar algo) y apilarlas obligaba a recorrer
 * todo el formulario para llegar a lo segundo, que es lo más frecuente.
 */

import { useMemo, useState } from 'react';
import { createLibrary, deleteLibrary, saveComponent } from '../api/libraries';
import { hasDesignerAccess } from '../api/designer-access';
import { reactEmitter } from '../builder/emit-react';
import { SEED_LIBRARY, seedTreeJson } from '../libraries/seed-library';
import {
  createProject, deleteProject, listProjects, setBackendLibraryId, setSavedComponentId,
  type Project, type ProjectKind,
} from './storage';
import {
  IconAlert, IconCheck, IconClock, IconClose, IconComponents, IconCube,
  IconLibrary, IconLock, IconPlus, IconTrash,
} from './icons';

/**
 * Tecnologías del constructor.
 *
 * Solo React está implementado: el registro de emisores es abierto, pero hoy
 * únicamente hay emisor de React. Se muestran las tres para que el alcance sea
 * legible, con las no disponibles marcadas como tales — antes había un
 * desplegable que ni siquiera estaba conectado a un estado, de modo que
 * aparentaba una elección que no existía.
 */
const TECHNOLOGIES = [
  { id: 'react', label: 'React 18', hint: 'TypeScript', available: true },
  { id: 'vue', label: 'Vue 3', hint: 'Próximamente', available: false },
  { id: 'angular', label: 'Angular', hint: 'Próximamente', available: false },
] as const;

const KINDS: {
  value: ProjectKind;
  Icon: typeof IconComponents;
  label: string;
  summary: string;
  detail: string;
}[] = [
  {
    value: 'loose',
    Icon: IconComponents,
    label: 'Componentes sueltos',
    summary: 'Se quedan en este proyecto',
    detail: 'Cada componente se edita, se copia o se descarga por separado. Todo vive en este navegador.',
  },
  {
    value: 'library',
    Icon: IconLibrary,
    label: 'Librería',
    summary: 'Además se publican en el servidor',
    detail: 'Cada guardado publica el componente en una librería consultable y exportable entera como paquete.',
  },
];

/** Etiqueta de sección: mismo tratamiento en toda la pantalla. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </span>
  );
}

export function HomeView({ onOpen }: { onOpen: (project: Project, componentId: string) => void }) {
  const [projects, setProjects] = useState<Project[]>(() => listProjects());
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('loose');
  // Por defecto NO: quien crea un proyecto suele querer el suyo, y encontrarse
  // siete componentes ajenos dentro obliga a borrarlos uno a uno.
  const [withExample, setWithExample] = useState(false);
  const [creating, setCreating] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // El más trabajado recientemente primero: es el que se quiere retomar.
  const ordered = useMemo(
    () => [...projects].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))),
    [projects],
  );

  async function handleCreate() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setWarning(null);
    /*
      El código de acceso se comprueba ANTES de crear nada.

      Dar de alta una librería es una operación de diseñador, y la puerta de
      acceso solo aparecía al entrar al constructor —es decir, DESPUÉS—. El
      resultado era que crear el primer proyecto de tipo «Librería» en un
      navegador limpio fallaba siempre con un 401, y el proyecto nacía marcado
      «sin conectar» sin que se hubiera hecho nada mal.
    */
    if (kind === 'library' && !hasDesignerAccess()) {
      setCreating(false);
      setWarning(
        'Publicar una librería en el servidor requiere el código de acceso. Entra con él desde ' +
        'Constructor o Librerías y vuelve a crear el proyecto; si prefieres empezar ya, elige ' +
        '«Componentes sueltos».',
      );
      return;
    }

    const project = createProject(name, kind, withExample);

    if (kind === 'library') {
      try {
        // Con ejemplo, la librería nace ya con la identidad visual del kit: si
        // el tema y la hoja global se quedaran solo en el proyecto local, el
        // catálogo del servidor pintaría los mismos componentes con los colores
        // por defecto, y los roles que usan los bloques no significarían nada.
        const lib = await createLibrary({
          name: name.trim(),
          framework: 'React',
          language: 'TypeScript',
          ...(withExample && {
            description: SEED_LIBRARY.description,
            themeJson: JSON.stringify(SEED_LIBRARY.theme),
            globalStyles: SEED_LIBRARY.globalStyles,
          }),
        });
        setBackendLibraryId(project.id, lib.id);
        project.backendLibraryId = lib.id;

        // Se publican con el emisor de la aplicación, no con un TSX guardado
        // aparte: así lo que se ve en el constructor y lo que queda en el
        // catálogo son lo mismo por construcción, incluso si el emisor cambia.
        if (withExample) {
          for (const component of project.components) {
            const saved = await saveComponent(lib.id, {
              name: component.name,
              sourceCode: reactEmitter.emit({
                blocks: component.blocks,
                rootIds: component.rootIds,
                vars: component.stateVars,
              }),
              treeJson: seedTreeJson(component),
            });
            setSavedComponentId(project.id, component.id, saved.id);
          }
        }
      } catch {
        // El proyecto sigue siendo usable en local y se reconecta en el primer
        // guardado con backend disponible; pero callarlo dejaba al usuario con
        // un proyecto marcado «sin conectar» y ninguna explicación.
        //
        // Y NO se navega: el aviso se pinta en esta pantalla, así que abrir el
        // constructor a continuación lo hacía desaparecer en el mismo instante
        // en que se escribía. Quedándose aquí, se lee.
        setCreating(false);
        setWarning(
          withExample
            ? 'El proyecto se ha creado con el kit de ejemplo, pero el servidor falló mientras se ' +
              'publicaba: su librería puede haber quedado a medias. Los componentes están completos ' +
              'en local y se republican al guardarlos desde el constructor. Ábrelo desde la lista ' +
              'de la derecha.'
            : 'El proyecto se ha creado, pero no se pudo contactar con el servidor para dar de alta su ' +
              'librería. Seguirá funcionando en local y se conectará sola en el primer guardado con el ' +
              'backend disponible. Ábrelo cuando quieras desde la lista de la derecha.',
        );
        setProjects(listProjects());
        return;
      }
    }

    setCreating(false);
    onOpen(project, project.components[0].id);
  }

  async function confirmDelete(project: Project, alsoLibrary: boolean) {
    if (alsoLibrary && project.backendLibraryId) {
      try {
        await deleteLibrary(project.backendLibraryId);
      } catch {
        setWarning(`No se pudo eliminar la librería «${project.name}» del servidor; el proyecto sí se ha borrado.`);
      }
    }
    deleteProject(project.id);
    setProjects(listProjects());
    setPendingDelete(null);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-12">
        <header className="max-w-2xl">
          <h1 className="text-[26px] leading-tight font-semibold text-slate-900 tracking-tight">
            Proyectos de componentes
          </h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Un proyecto agrupa los componentes que diseñas en el constructor.
            Empieza uno nuevo o retoma el trabajo donde lo dejaste.
          </p>
        </header>

        {warning && (
          <div className="mt-8 flex gap-3 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3.5">
            <IconAlert className="w-[18px] h-[18px] shrink-0 text-amber-500 mt-px" />
            <p className="text-[13px] text-amber-900 leading-relaxed">{warning}</p>
            <button
              onClick={() => setWarning(null)}
              aria-label="Descartar aviso"
              className="ml-auto shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
            >
              <IconClose className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          {/* ── Nuevo proyecto ── */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <IconPlus className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-semibold text-slate-800">Nuevo proyecto</h2>
            </div>

            <div className="px-6 py-6 space-y-7">
              <label className="block">
                <FieldLabel>Nombre</FieldLabel>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="Mi kit de interfaz"
                  className="mt-2 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800
                    placeholder:text-slate-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500
                    outline-none transition-all"
                />
              </label>

              <div>
                <FieldLabel>Tecnología</FieldLabel>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {TECHNOLOGIES.map((tech) => (
                    <div
                      key={tech.id}
                      title={tech.available ? undefined : 'El constructor todavía no emite código para esta tecnología'}
                      className={`relative rounded-lg border px-3 py-2.5 text-center transition-colors
                        ${tech.available
                          ? 'border-blue-500 bg-blue-50/70 shadow-[0_0_0_1px_theme(colors.blue.500)]'
                          : 'border-slate-200 bg-slate-50/80'}`}
                    >
                      {tech.available ? (
                        <IconCheck className="w-3.5 h-3.5 absolute top-2 right-2 text-blue-600" />
                      ) : (
                        <IconLock className="w-3 h-3 absolute top-2.5 right-2.5 text-slate-300" />
                      )}
                      <span className={`block text-[13px] font-medium ${tech.available ? 'text-blue-700' : 'text-slate-400'}`}>
                        {tech.label}
                      </span>
                      <span className={`block text-[10px] mt-0.5 ${tech.available ? 'text-blue-600/70' : 'text-slate-400'}`}>
                        {tech.hint}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel>Dónde acaban los componentes</FieldLabel>
                <div className="mt-2 space-y-2.5">
                  {KINDS.map(({ value, Icon, label, summary, detail }) => {
                    const selected = kind === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setKind(value)}
                        className={`w-full text-left rounded-xl border p-4 transition-all
                          ${selected
                            ? 'border-blue-500 bg-blue-50/50 shadow-[0_0_0_1px_theme(colors.blue.500)]'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors
                            ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <Icon className="w-[18px] h-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${selected ? 'text-blue-900' : 'text-slate-800'}`}>
                                {label}
                              </span>
                              <span className={`text-[11px] ${selected ? 'text-blue-600' : 'text-slate-400'}`}>
                                · {summary}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{detail}</p>
                          </div>
                          <span className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-colors
                            ${selected ? 'border-blue-600 bg-blue-600 ring-2 ring-inset ring-white' : 'border-slate-300'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel>Punto de partida</FieldLabel>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={withExample}
                  onClick={() => setWithExample((v) => !v)}
                  className={`mt-2 w-full text-left rounded-xl border p-4 transition-all
                    ${withExample
                      ? 'border-blue-500 bg-blue-50/50 shadow-[0_0_0_1px_theme(colors.blue.500)]'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors
                      ${withExample ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <IconLibrary className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${withExample ? 'text-blue-900' : 'text-slate-800'}`}>
                          Incluir la librería de ejemplo
                        </span>
                        <span className={`text-[11px] ${withExample ? 'text-blue-600' : 'text-slate-400'}`}>
                          · «{SEED_LIBRARY.name}», {SEED_LIBRARY.components.length} componentes
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {withExample
                          ? kind === 'library'
                            ? 'El proyecto nace con el kit y su tema, y se publica entero en la librería del servidor.'
                            : 'El proyecto nace con el kit y su tema, listos para abrir y modificar.'
                          : 'Sin marcar, el proyecto nace vacío: los componentes los creas a mano o con IA.'}
                      </p>
                    </div>
                    <span className={`w-4 h-4 rounded shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors
                      ${withExample ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                      {withExample && <IconCheck className="w-3 h-3" />}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-sm
                  hover:bg-blue-700 active:bg-blue-800
                  disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed
                  transition-colors"
              >
                {creating ? 'Creando…' : 'Crear proyecto'}
              </button>
              <p className="text-xs text-slate-500">
                {kind === 'library'
                  ? 'Se dará de alta una librería con el mismo nombre en el servidor.'
                  : 'Los componentes se quedarán en este navegador.'}
              </p>
            </div>
          </section>

          {/* ── Proyectos existentes ── */}
          <section>
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold text-slate-800">Tus proyectos</h2>
              {ordered.length > 0 && (
                <span className="text-xs text-slate-400 tabular-nums">{ordered.length}</span>
              )}
            </div>

            {ordered.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-12 text-center">
                <span className="w-11 h-11 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center mx-auto">
                  <IconCube className="w-5 h-5" />
                </span>
                <p className="text-sm font-medium text-slate-600 mt-3">Todavía no hay ningún proyecto</p>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Crea el primero para empezar<br />a diseñar componentes.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {ordered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    confirming={pendingDelete === project.id}
                    onOpen={() => onOpen(project, project.components[0]?.id ?? '')}
                    onAskDelete={() => setPendingDelete(project.id)}
                    onCancelDelete={() => setPendingDelete(null)}
                    onConfirmDelete={(alsoLibrary) => confirmDelete(project, alsoLibrary)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Fecha de la última edición de cualquiera de sus componentes. */
function lastActivity(project: Project): string {
  return project.components.reduce(
    (latest, component) => (component.updatedAt > latest ? component.updatedAt : latest),
    project.createdAt,
  );
}

/** «hace 5 min», «ayer», «12 jul» — más legible que una fecha absoluta para lo reciente. */
function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function ProjectCard({ project, confirming, onOpen, onAskDelete, onCancelDelete, onConfirmDelete }: {
  project: Project;
  confirming: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: (alsoLibrary: boolean) => void;
}) {
  // Por defecto NO se arrastra la librería: el proyecto vive en este navegador,
  // pero la librería está en el servidor y puede tener otros consumidores.
  const [alsoLibrary, setAlsoLibrary] = useState(false);
  const isLibrary = project.kind === 'library';
  const count = project.components.length;

  if (confirming) {
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-[0_0_0_1px_theme(colors.red.100)] p-4">
        <p className="text-sm font-medium text-slate-800">¿Eliminar «{project.name}»?</p>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Se borrarán sus {count} componente{count === 1 ? '' : 's'} de este navegador. No se puede deshacer.
        </p>

        {isLibrary && project.backendLibraryId && (
          <label className="mt-3 flex items-start gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 cursor-pointer hover:border-slate-300 transition-colors">
            <input
              type="checkbox"
              checked={alsoLibrary}
              onChange={(e) => setAlsoLibrary(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-red-600"
            />
            <span className="text-xs text-slate-600 leading-snug">
              Eliminar también su <strong className="font-medium text-slate-700">librería del servidor</strong>.
              Si no lo marcas, seguirá disponible en la pestaña Librerías.
            </span>
          </label>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onConfirmDelete(alsoLibrary)}
            className="flex-1 bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Eliminar
          </button>
          <button
            onClick={onCancelDelete}
            className="text-xs font-medium text-slate-600 px-3.5 py-2 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative bg-white rounded-xl border border-slate-200/80 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
      <button onClick={onOpen} className="w-full text-left p-4 pr-11">
        <div className="flex items-start gap-3">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
            ${isLibrary ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
            {isLibrary ? <IconLibrary className="w-[18px] h-[18px]" /> : <IconComponents className="w-[18px] h-[18px]" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800 truncate">{project.name}</span>
              {isLibrary && !project.backendLibraryId && (
                <span
                  title="No se pudo dar de alta la librería en el servidor; se conectará en el primer guardado con el backend disponible"
                  className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0"
                >
                  Sin conectar
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <IconCube className="w-3 h-3" />
                {count} componente{count === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1">
                <IconClock className="w-3 h-3" />
                {relativeDate(lastActivity(project))}
              </span>
            </div>
          </div>
        </div>
      </button>

      <button
        onClick={onAskDelete}
        title="Eliminar proyecto"
        aria-label={`Eliminar ${project.name}`}
        className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300
          hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
      >
        <IconTrash className="w-[15px] h-[15px]" />
      </button>
    </div>
  );
}
