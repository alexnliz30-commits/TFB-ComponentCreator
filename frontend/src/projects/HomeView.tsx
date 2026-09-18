/**
 * Pantalla inicial: crear un proyecto de componentes o abrir uno existente.
 *
 * El tipo de proyecto decide el destino del trabajo, y por eso se presenta con
 * sus consecuencias explícitas en vez de con una etiqueta: «sueltos» mantiene
 * los componentes dentro del proyecto, y «librería» publica además cada
 * guardado en la librería equivalente del backend, que es la que se puede
 * exportar entera y consultar desde la pestaña Librerías.
 *
 * Es además donde nace el acceso (RF11). Crear un proyecto ya no exige conocer
 * ningún código: el servidor acuña el suyo al darlo de alta y se enseña aquí,
 * una sola vez, para copiarlo. Antes era al revés —había que traer una llave que
 * el sistema no entregaba por ninguna parte— y eso dejaba a quien estrenaba el
 * sistema delante de una puerta cerrada en el primer clic.
 *
 * Sobre la composición: dos columnas en pantallas anchas —formulario a la
 * izquierda, trabajo existente a la derecha— porque son dos tareas distintas
 * (empezar algo nuevo frente a retomar algo) y apilarlas obligaba a recorrer
 * todo el formulario para llegar a lo segundo, que es lo más frecuente.
 */

import { useMemo, useState } from 'react';
import { createLibrary, deleteLibrary, saveComponent } from '../api/libraries';
import {
  createServerProject, deleteServerProject, forgetProjectAccess, regenerateProjectCode,
} from '../api/designer-access';
import { getEmitter } from '../builder/emitters';
import { SEED_LIBRARY, seedTreeJson } from '../libraries/seed-library';
import {
  createProject, deleteProject, getProject, linkedLibraryIds, listProjects, setBackendLibraryId,
  setSavedComponentId, setServerId, type Project, type ProjectKind,
} from './storage';
import {
  IconAlert, IconCheck, IconClock, IconClose, IconComponents, IconCopy, IconCube,
  IconKey, IconLibrary, IconLock, IconPlus, IconTrash,
} from './icons';

/**
 * Tecnologías con las que puede nacer un proyecto.
 *
 * Disponible = el destino sabe entregarse como carpeta, que es lo que permite
 * publicarlo en una librería y exportarlo como paquete. Es la misma distinción
 * que hace `puedePublicarse`, escrita una sola vez; hoy la cumplen los ocho
 * destinos, y la marca sigue aquí porque el siguiente que se añada nacerá otra
 * vez sin paquete.
 *
 * Cada tarjeta fija el destino POR DEFECTO de los componentes del proyecto; en
 * el constructor se puede cambiar componente a componente.
 */
const TECHNOLOGIES = [
  { id: 'react', label: 'React 18', hint: 'TypeScript', available: true },
  { id: 'react-js', label: 'React 18', hint: 'JavaScript', available: true },
  { id: 'angular22', label: 'Angular 22', hint: 'TypeScript', available: true },
  { id: 'vue3', label: 'Vue 3', hint: 'TypeScript', available: true },
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

/**
 * Código recién entregado, esperando a que alguien lo copie.
 *
 * `origin` no es decoración: el panel es el mismo en los tres casos, pero
 * encabezarlo siempre con «Proyecto creado» le contaría al usuario que acaba de
 * nacer algo cuando lo único que ha pasado es que un proyecto suyo de siempre ya
 * tiene código. `project` viene cuando hay a dónde entrar, que es todo menos
 * cambiarle el código a uno existente.
 */
interface IssuedCode {
  name: string;
  code: string;
  origin: 'created' | 'issued' | 'rotated';
  project: Project | null;
}

const ISSUE_TITLES: Record<IssuedCode['origin'], string> = {
  created: 'Proyecto creado',
  issued: 'Código generado',
  rotated: 'Código cambiado',
};

/** Etiqueta de sección: mismo tratamiento en toda la pantalla. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </span>
  );
}

export function HomeView({ onOpen, onProjectsChanged }: {
  onOpen: (project: Project, componentId: string) => void;
  /** Se avisa en cada alta o baja: quien está por encima decide si el proyecto abierto sigue existiendo. */
  onProjectsChanged: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>(() => listProjects());

  /**
   * Relee la lista y lo comunica hacia arriba.
   *
   * Las dos cosas van juntas siempre. Cuando solo se releía aquí, borrar el
   * proyecto que estaba abierto lo quitaba de esta lista pero no de la sesión:
   * las pestañas de Constructor y Librerías seguían seleccionables y abrían un
   * proyecto fantasma.
   */
  function refrescar() {
    setProjects(listProjects());
    onProjectsChanged();
  }
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('loose');
  const [tech, setTech] = useState<string>('react');
  // Por defecto NO: quien crea un proyecto suele querer el suyo, y encontrarse
  // siete componentes ajenos dentro obliga a borrarlos uno a uno.
  const [withExample, setWithExample] = useState(false);
  const [creating, setCreating] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);

  // El kit de ejemplo no es «unos componentes de prueba»: trae tema y hoja
  // global, y esos viven en la librería. En un proyecto de componentes sueltos
  // no hay dónde ponerlos, así que la opción ni se ofrece.
  const seedAvailable = kind === 'library';

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
      Primero el alta en el servidor, porque de ahí sale todo lo demás.

      El alta devuelve el código del proyecto Y un token ya emitido, así que a
      partir de esta línea hay acceso: la creación de la librería que viene
      después ya no puede fallar con un 401. Antes se comprobaba el código ANTES
      de crear nada y la puerta solo aparecía al entrar al constructor —es decir,
      DESPUÉS—, de modo que el primer proyecto de tipo «Librería» en un navegador
      limpio fallaba siempre sin que se hubiera hecho nada mal.
    */
    let registered: { projectId: string; accessCode: string };
    try {
      registered = await createServerProject(name.trim());
    } catch (error) {
      // Sin servidor el proyecto se crea igualmente —se puede diseñar en local—,
      // pero nace sin código propio. Se dice aquí y se ofrece la salida, en vez
      // de descubrirlo al chocar con la puerta más tarde.
      const motivo = error instanceof Error ? error.message : 'No se pudo contactar con el servidor.';
      createProject(name, kind, seedAvailable && withExample, tech);
      setCreating(false);
      refrescar();
      setWarning(
        `${motivo} El proyecto se ha creado en este navegador, pero sin código de acceso propio` +
        (kind === 'library' ? ' y sin su librería en el servidor' : '') +
        '. Cuando el backend esté en marcha, pulsa «Obtener código» en su tarjeta.',
      );
      return;
    }

    // `seedAvailable &&`: la marca ya se cae al cambiar de tipo, pero sembrar
    // el kit en un proyecto suelto dejaría su tema sin dueño, y eso no debe
    // depender de que un único `onClick` se acuerde de limpiarla.
    const project = createProject(name, kind, seedAvailable && withExample, tech);
    setServerId(project.id, registered.projectId);
    project.serverId = registered.projectId;

    if (kind === 'library') {
      try {
        // Con ejemplo, la librería nace ya con la identidad visual del kit: si
        // el tema y la hoja global se quedaran solo en el proyecto local, el
        // catálogo del servidor pintaría los mismos componentes con los colores
        // por defecto, y los roles que usan los bloques no significarían nada.
        const emisor = getEmitter(tech);
        const lib = await createLibrary({
          name: name.trim(),
          framework: emisor.frameworkName,
          language: emisor.lang === 'js' ? 'JavaScript' : 'TypeScript',
          ...(withExample && {
            description: SEED_LIBRARY.description,
            themeJson: JSON.stringify(SEED_LIBRARY.theme),
            globalStyles: SEED_LIBRARY.globalStyles,
          }),
        });
        // El proyecto nace con la librería de su destino por defecto. Si más
        // adelante alguno de sus componentes se pasa a JavaScript, el guardado
        // creará la suya: el idioma es del catálogo, no del proyecto.
        setBackendLibraryId(project.id, tech, lib.id);
        project.backendLibraryIds = { [tech]: lib.id };

        // Se publican con el emisor de la aplicación, no con un TSX guardado
        // aparte: así lo que se ve en el constructor y lo que queda en el
        // catálogo son lo mismo por construcción, incluso si el emisor cambia.
        if (withExample) {
          for (const component of project.components) {
            const saved = await saveComponent(lib.id, {
              name: component.name,
              // Con el emisor del destino elegido, no con el de React: el kit de
              // ejemplo son árboles de bloques, así que existe en cualquiera de
              // los destinos, y publicarlo siempre como TSX metería React dentro
              // de una librería que se anuncia como Angular.
              sourceCode: emisor.emit({
                blocks: component.blocks,
                rootIds: component.rootIds,
                vars: component.stateVars,
                name: component.name,
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
        setWarning(
          withExample
            ? 'El proyecto se ha creado con el kit de ejemplo, pero el servidor falló mientras se ' +
              'publicaba: su librería puede haber quedado a medias. Los componentes están completos ' +
              'en local y se republican al guardarlos desde el constructor.'
            : 'El proyecto se ha creado, pero no se pudo contactar con el servidor para dar de alta su ' +
              'librería. Seguirá funcionando en local y se conectará sola en el primer guardado con el ' +
              'backend disponible.',
        );
      }
    }

    setCreating(false);
    setName('');
    refrescar();
    // NO se navega: el código se enseña una sola vez, y entrar al constructor a
    // continuación lo haría desaparecer en el mismo instante en que se escribe.
    setIssued({ name: project.name, code: registered.accessCode, origin: 'created', project });
  }

  /**
   * Da de alta en el servidor un proyecto que nació sin él.
   *
   * Es la vía de los proyectos anteriores a los códigos por proyecto y la de los
   * que se crearon con el backend caído: sin esto se quedarían para siempre
   * dependiendo de la llave maestra.
   */
  async function issueCode(project: Project) {
    setWarning(null);
    try {
      const registered = await createServerProject(project.name);
      setServerId(project.id, registered.projectId);
      refrescar();
      setIssued({ name: project.name, code: registered.accessCode, origin: 'issued', project: getProject(project.id) });
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'No se pudo dar de alta el proyecto en el servidor.');
    }
  }

  /** Cambia el código de un proyecto ya registrado. Exige estar dentro. */
  async function rotateCode(project: Project) {
    if (!project.serverId) return;
    setWarning(null);
    try {
      const code = await regenerateProjectCode(project.serverId);
      setIssued({ name: project.name, code, origin: 'rotated', project: null });
    } catch {
      setWarning(
        `Para cambiar el código de «${project.name}» hay que tener acceso a él: ábrelo primero ` +
        'con el código actual o con el maestro, y vuelve aquí.',
      );
    }
  }

  async function confirmDelete(project: Project, alsoLibrary: boolean) {
    // Se borran TODAS las librerías del proyecto, no la primera: un proyecto
    // puede tener una de TypeScript y otra de JavaScript, y dejar una huérfana
    // en el catálogo es peor que no borrar ninguna, porque nadie la reclama.
    for (const id of alsoLibrary ? linkedLibraryIds(project) : []) {
      try {
        await deleteLibrary(id);
      } catch {
        setWarning(`No se pudo eliminar la librería «${project.name}» del servidor; el proyecto sí se ha borrado.`);
      }
    }
    // El registro de acceso se va con el proyecto: si no, la tabla acumularía
    // filas de proyectos que ya no existen en ninguna parte.
    if (project.serverId) {
      await deleteServerProject(project.serverId);
      forgetProjectAccess(project.serverId);
    }

    deleteProject(project.id);
    refrescar();
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
          {/* ── Nuevo proyecto, o el código del que se acaba de crear ── */}
          {issued ? (
            <IssuedCodePanel
              issued={issued}
              onEnter={() => {
                const project = issued.project;
                setIssued(null);
                if (project) onOpen(project, project.components[0]?.id ?? '');
              }}
              onDismiss={() => setIssued(null)}
            />
          ) : (
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
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {TECHNOLOGIES.map((t) => {
                    const elegida = t.id === tech;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!t.available}
                        onClick={() => setTech(t.id)}
                        aria-pressed={elegida}
                        title={t.available ? undefined : 'El constructor todavía no entrega esta tecnología como paquete'}
                        className={`relative rounded-lg border px-3 py-2.5 text-center transition-colors
                          ${!t.available
                            ? 'border-slate-200 bg-slate-50/80 cursor-not-allowed'
                            : elegida
                              ? 'border-blue-500 bg-blue-50/70 shadow-[0_0_0_1px_theme(colors.blue.500)]'
                              : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        {!t.available ? (
                          <IconLock className="w-3 h-3 absolute top-2.5 right-2.5 text-slate-300" />
                        ) : elegida ? (
                          <IconCheck className="w-3.5 h-3.5 absolute top-2 right-2 text-blue-600" />
                        ) : null}
                        <span className={`block text-[13px] font-medium ${!t.available ? 'text-slate-400' : elegida ? 'text-blue-700' : 'text-slate-600'}`}>
                          {t.label}
                        </span>
                        <span className={`block text-[10px] mt-0.5 ${!t.available ? 'text-slate-400' : elegida ? 'text-blue-600/70' : 'text-slate-400'}`}>
                          {t.hint}
                        </span>
                      </button>
                    );
                  })}
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
                        onClick={() => {
                          setKind(value);
                          // El kit de ejemplo ES una librería: al volver a
                          // «Componentes sueltos» la marca se cae con la opción,
                          // porque si no el proyecto nacería con siete
                          // componentes que ya no se pueden publicar.
                          if (value !== 'library') setWithExample(false);
                        }}
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
                  disabled={!seedAvailable}
                  title={seedAvailable ? undefined : 'El kit de ejemplo es una librería: elige «Librería» para poder incluirlo'}
                  onClick={() => setWithExample((v) => !v)}
                  className={`mt-2 w-full text-left rounded-xl border p-4 transition-all
                    ${!seedAvailable
                      ? 'border-slate-200 bg-slate-50/80 cursor-not-allowed'
                      : withExample
                        ? 'border-blue-500 bg-blue-50/50 shadow-[0_0_0_1px_theme(colors.blue.500)]'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors
                      ${withExample && seedAvailable ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <IconLibrary className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium
                          ${!seedAvailable ? 'text-slate-400' : withExample ? 'text-blue-900' : 'text-slate-800'}`}>
                          Incluir la librería de ejemplo
                        </span>
                        <span className={`text-[11px]
                          ${!seedAvailable ? 'text-slate-400' : withExample ? 'text-blue-600' : 'text-slate-400'}`}>
                          · «{SEED_LIBRARY.name}», {SEED_LIBRARY.components.length} componentes
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {!seedAvailable
                          ? 'Solo disponible en proyectos de tipo «Librería»: el kit trae su propio tema y hoja global, ' +
                            'que viven en la librería.'
                          : withExample
                            ? 'El proyecto nace con el kit y su tema, y se publica entero en la librería del servidor.'
                            : 'Sin marcar, el proyecto nace vacío: los componentes los creas a mano o con IA.'}
                      </p>
                    </div>
                    {!seedAvailable ? (
                      <IconLock className="w-3.5 h-3.5 shrink-0 mt-1 text-slate-300" />
                    ) : (
                      <span className={`w-4 h-4 rounded shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors
                        ${withExample ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                        {withExample && <IconCheck className="w-3 h-3" />}
                      </span>
                    )}
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
                Al crearlo se generará su código de acceso.
                {kind === 'library' && ' Se dará de alta además una librería con el mismo nombre en el servidor.'}
              </p>
            </div>
          </section>
          )}

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
                    onIssueCode={() => issueCode(project)}
                    onRotateCode={() => rotateCode(project)}
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

/**
 * El código recién acuñado, para copiarlo.
 *
 * Ocupa el sitio del formulario en vez de aparecer como un aviso más: es la
 * respuesta a lo que se acaba de enviar, y es además la única vez que este código
 * existe fuera de quien lo recibe. Un banner discreto arriba del todo se pierde,
 * y aquí perderlo cuesta el proyecto.
 */
function IssuedCodePanel({ issued, onEnter, onDismiss }: {
  issued: IssuedCode;
  onEnter: () => void;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<'no' | 'si' | 'falla'>('no');

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied('si');
    } catch {
      // `navigator.clipboard` no existe fuera de contextos seguros: servido por
      // http desde otra máquina, copiar no es una opción y hay que decirlo en vez
      // de dejar un botón que no hace nada.
      setCopied('falla');
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-emerald-100 bg-emerald-50/60 flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <IconKey className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold text-emerald-900">{ISSUE_TITLES[issued.origin]}</h2>
      </div>

      <div className="px-6 py-6">
        <p className="text-sm text-slate-600 leading-relaxed">
          Este es el código de acceso de <strong className="font-medium text-slate-800">«{issued.name}»</strong>.
          Hace falta para abrirlo desde otro navegador, o desde este cuando caduque la sesión.
        </p>

        <div className="mt-4 flex items-stretch gap-2">
          <code className="flex-1 bg-slate-900 text-emerald-300 rounded-lg px-4 py-3.5 text-lg font-mono
            tracking-[0.15em] text-center select-all break-all">
            {issued.code}
          </code>
          <button
            onClick={copy}
            title="Copiar al portapapeles"
            className="shrink-0 w-14 rounded-lg border border-slate-300 text-slate-500
              hover:border-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            {copied === 'si' ? <IconCheck className="w-5 h-5 text-emerald-600" /> : <IconCopy className="w-5 h-5" />}
          </button>
        </div>

        {copied === 'si' && <p className="text-xs text-emerald-600 mt-2">Copiado.</p>}
        {copied === 'falla' && (
          <p className="text-xs text-amber-600 mt-2">
            El navegador no deja copiar automáticamente aquí: selecciónalo a mano.
          </p>
        )}

        <div className="mt-5 flex gap-3 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3.5">
          <IconAlert className="w-[18px] h-[18px] shrink-0 text-amber-500 mt-px" />
          <p className="text-[13px] text-amber-900 leading-relaxed">
            Apúntalo ahora: <strong className="font-medium">no se vuelve a mostrar</strong>. El servidor
            solo guarda su huella, no el código, así que no hay ninguna pantalla donde consultarlo
            después. Si lo pierdes, puedes generar otro desde la tarjeta del proyecto —o entrar con el
            código maestro del despliegue.
          </p>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-3">
        {issued.project ? (
          <>
            <button
              onClick={onEnter}
              className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-sm
                hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              Ya lo tengo, entrar al proyecto
            </button>
            <button
              onClick={onDismiss}
              className="text-sm font-medium text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-200/70 transition-colors"
            >
              Crear otro
            </button>
          </>
        ) : (
          <button
            onClick={onDismiss}
            className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-sm
              hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            Ya lo tengo
          </button>
        )}
      </div>
    </section>
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

function ProjectCard({
  project, confirming, onOpen, onIssueCode, onRotateCode, onAskDelete, onCancelDelete, onConfirmDelete,
}: {
  project: Project;
  confirming: boolean;
  onOpen: () => void;
  onIssueCode: () => void;
  onRotateCode: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: (alsoLibrary: boolean) => void;
}) {
  // Por defecto NO se arrastra la librería: el proyecto vive en este navegador,
  // pero la librería está en el servidor y puede tener otros consumidores.
  const [alsoLibrary, setAlsoLibrary] = useState(false);
  const isLibrary = project.kind === 'library';
  const count = project.components.length;
  const registered = !!project.serverId;

  if (confirming) {
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-[0_0_0_1px_theme(colors.red.100)] p-4">
        <p className="text-sm font-medium text-slate-800">¿Eliminar «{project.name}»?</p>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Se borrarán sus {count} componente{count === 1 ? '' : 's'} de este navegador y su código de
          acceso dejará de valer. No se puede deshacer.
        </p>

        {isLibrary && linkedLibraryIds(project).length > 0 && (
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
              {isLibrary && linkedLibraryIds(project).length === 0 && (
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

      {/*
        La llave y la papelera. La llave cambia de significado según el proyecto
        tenga código propio o no, y esa es exactamente la distinción que le
        importa a quien mira: sin código, el proyecto solo se abre con el maestro.
      */}
      <div className="absolute top-3 right-3 flex gap-0.5">
        <button
          onClick={registered ? onRotateCode : onIssueCode}
          title={registered
            ? 'Generar un código de acceso nuevo (invalida el actual)'
            : 'Este proyecto no tiene código propio: darlo de alta en el servidor y generar el suyo'}
          aria-label={`${registered ? 'Cambiar' : 'Obtener'} el código de ${project.name}`}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all
            ${registered
              ? 'text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
              : 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'}`}
        >
          <IconKey className="w-[15px] h-[15px]" />
        </button>
        <button
          onClick={onAskDelete}
          title="Eliminar proyecto"
          aria-label={`Eliminar ${project.name}`}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300
            hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
        >
          <IconTrash className="w-[15px] h-[15px]" />
        </button>
      </div>
    </div>
  );
}
