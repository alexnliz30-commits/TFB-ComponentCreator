/**
 * Proyectos de componentes, persistidos en localStorage.
 *
 * Un proyecto agrupa componentes editables del constructor. A diferencia de las
 * librerías del backend (que guardan el TSX ya emitido, listo para consumir),
 * aquí se guarda el **árbol de bloques** completo: es lo que permite reabrir un
 * componente y seguir editándolo visualmente. Si el proyecto se creó como
 * «librería consolidada», cada guardado intenta además publicar el TSX emitido
 * en la librería equivalente del backend (mejor esfuerzo: sin backend, el
 * proyecto sigue funcionando en local).
 */

import type { BuilderBlock, StylesLanguage } from '../builder/types';
import type { CallbackProp, StateVar } from '../builder/actions';
import type { DataModel } from '../builder/data-model';
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../builder/theme';
import { SEED_LIBRARY } from '../libraries/seed-library';

export type ProjectKind = 'loose' | 'library';

export interface ProjectComponent {
  id: string;
  name: string;
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  stateVars: StateVar[];
  /**
   * Contrato de datos del componente.
   *
   * Opcional porque los componentes guardados antes de existir el modelo
   * deben seguir abriéndose: sin él, el constructor arranca con uno vacío.
   */
  model?: DataModel;
  /**
   * Props de función que el componente ofrece a la aplicación anfitriona.
   *
   * Opcional por el mismo motivo que el modelo: los componentes guardados antes
   * de que existieran deben seguir abriéndose, sin ninguna.
   */
  callbacks?: CallbackProp[];
  /**
   * Destino del componente: la clave del emisor (`react`, `react-js`, `vue3`…).
   *
   * Se guarda con el componente y no con el proyecto porque es una decisión
   * suya: en el mismo kit puede haber una tabla en TypeScript y un botón en
   * JavaScript, y cada uno se publica en la librería de su idioma. Ausente en
   * los componentes guardados antes de existir esta elección, que son todos
   * React + TypeScript por construcción.
   */
  target?: string;
  /**
   * CSS/SASS propio de ESTE componente, además del tema de la librería.
   *
   * Se guarda aquí, junto al árbol: antes vivía solo en el estado del
   * constructor y se perdía en cuanto se cambiaba de componente o se recargaba
   * la página.
   */
  customStyles?: string;
  stylesLanguage?: StylesLanguage;
  /**
   * Componente equivalente en la librería del backend, una vez publicado.
   *
   * Es lo que convierte cada guardado en una revisión del mismo elemento del
   * catálogo en vez de en una copia nueva, y lo que permite volver a abrir desde
   * Librerías el componente que ya se estaba editando aquí.
   *
   * Pertenece a UNA librería: el backend busca ese id dentro de la librería a la
   * que se publica, así que reutilizarlo contra otra da de alta una entrada
   * nueva. Por eso `setComponentLibrary` lo descarta al cambiar de destino, en
   * vez de arrastrar un id que allí no significa nada.
   */
  savedComponentId?: string;
  /**
   * Librería del catálogo donde se publica ESTE componente, por destino.
   *
   * Sobrescribe la del proyecto. Antes el destino lo fijaba el proyecto entero y
   * no había forma de decir «este botón va al kit de formularios y ese otro al
   * de navegación»: el único modo era crear un proyecto por librería.
   *
   * Va indexada por clave de emisor —`react`, `vue3`, `angular22`…— por la misma
   * razón que la del proyecto: el idioma y el framework los declara el catálogo,
   * así que elegir destino para React no puede decidir dónde acaba el día que
   * ese componente se emita como Angular. Vacío = se hereda la del proyecto.
   */
  libraryIds?: Record<string, string>;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  /**
   * Clave del emisor con el que nace el proyecto; cada componente puede cambiarla.
   *
   * Estaba fijada al literal `'react'` de cuando solo había un emisor: elegir
   * Angular en la pantalla de inicio no tenía dónde guardarse, así que el
   * proyecto abría el constructor en React igualmente.
   */
  tech: string;
  /**
   * Identidad del proyecto en el servidor, que es quien custodia su código de
   * acceso (RF11).
   *
   * El contenido sigue viviendo aquí, en el navegador; lo único que sube es la
   * decisión sobre quién puede abrirlo, porque un candado guardado junto a lo que
   * protege no es un candado. Ausente en los proyectos creados antes de los
   * códigos por proyecto y en los que nacieron sin backend a mano: esos solo se
   * abren con la llave maestra hasta que se les da de alta con «Obtener código»
   * desde su tarjeta en la pantalla de inicio.
   */
  serverId?: string;
  createdAt: string;
  /**
   * Librería del backend enlazada, de cuando un proyecto solo podía tener una.
   *
   * Se conserva para poder leer los proyectos ya guardados: `getProject` la
   * traslada a `backendLibraryIds` bajo la clave `react`, que es el único
   * destino que existía cuando se escribió.
   *
   * @deprecated Usa `backendLibraryIds`.
   */
  backendLibraryId?: string;
  /**
   * Librería del backend **por destino**, con la clave del emisor
   * (`react`, `react-js`, `vue3`, `vue3-js`).
   *
   * Un proyecto puede tener una librería de TypeScript y otra de JavaScript a
   * la vez, porque el idioma es del catálogo y no del proyecto: publicar un
   * componente JSX en una librería que se anuncia como TypeScript dejaría el
   * catálogo mintiendo sobre lo que contiene, y quien se descargara el paquete
   * se encontraría con dos cadenas de compilación en vez de una.
   */
  backendLibraryIds?: Record<string, string>;
  /**
   * Estilos globales de la librería: color, tipografía y forma que comparten
   * todos sus componentes. Opcional porque los proyectos creados antes de
   * existir el tema deben seguir abriéndose; `getProject` los normaliza.
   */
  theme?: Theme;
  components: ProjectComponent[];
}

const KEY = 'visualiza.projects';

function readAll(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listProjects(): Project[] {
  return readAll();
}

export function getProject(id: string): Project | null {
  const project = readAll().find((p) => p.id === id);
  if (!project) return null;
  // Los proyectos guardados antes de existir el tema no lo llevan; se completa
  // con los valores por defecto para que el resto del código no tenga que
  // preguntarse si hay tema o no. Lo mismo con la librería única de antes.
  return {
    ...project,
    theme: normalizeTheme(project.theme),
    backendLibraryIds: normalizeLibraryIds(project),
  };
}

/**
 * Clave del destino por defecto: React + TypeScript.
 *
 * Es el único que existía cuando la librería del proyecto era una sola, así que
 * es también la clave bajo la que se recolocan las de los proyectos antiguos.
 */
const DESTINO_HISTORICO = 'react';

function normalizeLibraryIds(project: Project): Record<string, string> {
  if (project.backendLibraryIds) return project.backendLibraryIds;
  return project.backendLibraryId ? { [DESTINO_HISTORICO]: project.backendLibraryId } : {};
}

/** Librería del backend para un destino, si el proyecto ya tiene una. */
export function libraryIdFor(project: Project, target: string): string | undefined {
  return normalizeLibraryIds(project)[target];
}

/** Todas las librerías del backend enlazadas por el proyecto. */
export function linkedLibraryIds(project: Project): string[] {
  return [...new Set(Object.values(normalizeLibraryIds(project)))];
}

/**
 * Librería donde acaba un componente concreto para un destino.
 *
 * La elección del componente manda sobre la del proyecto; sin elección se hereda
 * la del proyecto, que es el comportamiento de siempre. `null` significa algo
 * distinto de «no hay»: es «no publicar», y por eso se distingue de `undefined`
 * —no se ha elegido nada— en lugar de tratar los dos como falta de dato.
 */
export function componentLibraryId(
  project: Project,
  component: ProjectComponent,
  target: string,
): string | null | undefined {
  const propia = component.libraryIds?.[target];
  if (propia === NO_PUBLICAR) return null;
  return propia ?? libraryIdFor(project, target);
}

/**
 * Marca de «este componente no se publica», guardada en el mismo sitio que un id.
 *
 * Se guarda un centinela en vez de borrar la entrada porque borrarla significa
 * «no he elegido», y entonces el componente volvería a heredar la librería del
 * proyecto en el guardado siguiente: la decisión de NO publicar se desharía sola.
 */
const NO_PUBLICAR = '';

/** Fija —o quita— la librería de destino de un componente para un destino. */
export function setComponentLibrary(
  projectId: string,
  componentId: string,
  target: string,
  libraryId: string | null,
): void {
  update(projectId, (p) => ({
    ...p,
    components: p.components.map((c) => {
      if (c.id !== componentId) return c;
      const libraryIds = { ...(c.libraryIds ?? {}), [target]: libraryId ?? NO_PUBLICAR };
      // El `savedComponentId` identifica una entrada DENTRO de una librería:
      // conservarlo al mudarse haría que el backend no lo encontrara allí y
      // diera de alta una copia, dejando el componente duplicado en dos sitios.
      const { savedComponentId: _descartado, ...resto } = c;
      return { ...resto, libraryIds };
    }),
  }));
}

/**
 * El kit de ejemplo «Atenea» como componentes editables de un proyecto.
 *
 * Se copian del módulo de la semilla en vez de referenciarlos: son constantes
 * a nivel de módulo, y el constructor edita los árboles en sitio. Sin la copia,
 * diseñar sobre un proyecto de ejemplo mutaría la plantilla y el siguiente
 * proyecto nacería con los cambios del anterior.
 */
function exampleComponents(tech: string): ProjectComponent[] {
  const now = new Date().toISOString();
  return SEED_LIBRARY.components.map((component) => ({
    id: genId('comp'),
    name: component.name,
    ...(JSON.parse(JSON.stringify({
      blocks: component.blocks,
      rootIds: component.rootIds,
      stateVars: component.stateVars,
    })) as Pick<ProjectComponent, 'blocks' | 'rootIds' | 'stateVars'>),
    customStyles: component.customStyles ?? '',
    stylesLanguage: 'css' as StylesLanguage,
    // El kit son árboles de bloques, así que existe en cualquier destino; sin
    // esto un proyecto de JavaScript abría sus siete componentes en TypeScript.
    target: tech,
    updatedAt: now,
  }));
}

/**
 * Crea un proyecto, vacío o partiendo del kit de ejemplo.
 *
 * `withExample` no es solo «méteme unos componentes»: arrastra también el tema
 * de la semilla, porque los bloques del kit se estilan por ROL
 * (`bg-[var(--vz-primario)]`) y con el tema por defecto se verían con colores
 * que no son los suyos. Kit y tema van juntos o no van.
 */
export function createProject(
  name: string,
  kind: ProjectKind,
  withExample = false,
  tech = 'react',
): Project {
  const project: Project = {
    id: genId('proj'),
    name: name.trim() || 'Proyecto sin nombre',
    kind,
    tech,
    createdAt: new Date().toISOString(),
    theme: withExample ? SEED_LIBRARY.theme : DEFAULT_THEME,
    // El kit de ejemplo está escrito en React; pedirlo con otro destino sería
    // prometer unos componentes que no existen en esa tecnología.
    components: withExample ? exampleComponents(tech) : [{ ...emptyComponent('Componente 1'), target: tech }],
  };
  writeAll([...readAll(), project]);
  return project;
}

/** Guarda los estilos globales de la librería. */
export function saveProjectTheme(projectId: string, theme: Theme): void {
  update(projectId, (p) => ({ ...p, theme }));
}

export function emptyComponent(name: string): ProjectComponent {
  return {
    id: genId('comp'),
    name,
    blocks: {},
    rootIds: [],
    stateVars: [],
    updatedAt: new Date().toISOString(),
  };
}

function update(projectId: string, fn: (p: Project) => Project): Project | null {
  const projects = readAll();
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  const next = fn(projects[idx]);
  projects[idx] = next;
  writeAll(projects);
  return next;
}

/** Enlaza el proyecto con su registro en el servidor, que guarda su código. */
export function setServerId(projectId: string, serverId: string): void {
  update(projectId, (p) => ({ ...p, serverId }));
}

/** Enlaza la librería del backend que le corresponde a un destino concreto. */
export function setBackendLibraryId(projectId: string, target: string, libraryId: string): void {
  update(projectId, (p) => ({
    ...p,
    backendLibraryIds: { ...normalizeLibraryIds(p), [target]: libraryId },
  }));
}

export function addComponent(projectId: string, name: string): ProjectComponent | null {
  // El componente nuevo nace en el destino del proyecto: en un proyecto de
  // Angular, abrir uno en React obligaría a cambiarlo a mano cada vez, y el
  // primero que se olvidara publicaría un TSX en una librería de Angular.
  let component = emptyComponent(name);
  const updated = update(projectId, (p) => {
    component = { ...component, target: p.tech };
    return { ...p, components: [...p.components, component] };
  });
  return updated ? component : null;
}

export function saveComponentTree(
  projectId: string,
  componentId: string,
  tree: {
    blocks: Record<string, BuilderBlock>;
    rootIds: string[];
    stateVars: StateVar[];
    customStyles?: string;
    stylesLanguage?: StylesLanguage;
    model?: DataModel;
    callbacks?: CallbackProp[];
    target?: string;
  },
  name?: string,
): void {
  update(projectId, (p) => ({
    ...p,
    components: p.components.map((c) =>
      c.id === componentId
        ? { ...c, ...tree, name: name?.trim() || c.name, updatedAt: new Date().toISOString() }
        : c,
    ),
  }));
}

/**
 * Rompe el enlace con una librería que ya no existe en el backend.
 *
 * Sin esto, el proyecto seguiría apuntando a un id borrado y al guardar
 * fallaría con un 404 silencioso; el reintento de `saveProject` crea una
 * librería nueva, que es el comportamiento correcto una vez desenlazado.
 */
export function unlinkBackendLibrary(libraryId: string): void {
  const projects = readAll();
  let changed = false;
  const next = projects.map((p) => {
    const enlaces = normalizeLibraryIds(p);
    // Se desenlaza SOLO el destino que apuntaba a esa librería: un proyecto con
    // una librería de TypeScript y otra de JavaScript no puede perder las dos
    // porque una de ellas haya desaparecido del servidor.
    const restantes = Object.fromEntries(
      Object.entries(enlaces).filter(([, id]) => id !== libraryId),
    );
    if (Object.keys(restantes).length === Object.keys(enlaces).length) return p;

    changed = true;
    const { backendLibraryId: _discard, ...rest } = p;
    return {
      ...rest,
      backendLibraryIds: restantes,
      components: p.components.map(({ savedComponentId: _drop, ...c }) => c),
    } as Project;
  });
  if (changed) writeAll(next);
}

/**
 * Rompe el enlace con una entrada del catálogo que ya no existe.
 *
 * Gemela de `unlinkBackendLibrary`, para cuando lo que se borra es UN componente
 * y no la librería entera. Sin esto el proyecto seguiría apuntando a un id
 * muerto: el backend no lo encontraría dentro de la librería y daría de alta una
 * entrada nueva, que es el comportamiento correcto —pero solo si el enlace se ha
 * soltado antes. Conservándolo, el componente local quedaría marcado como
 * «publicado» señalando a algo que no está.
 */
export function unlinkSavedComponent(savedComponentId: string): void {
  const projects = readAll();
  let changed = false;
  const next = projects.map((p) => {
    if (!p.components.some((c) => c.savedComponentId === savedComponentId)) return p;
    changed = true;
    return {
      ...p,
      components: p.components.map((c) => {
        if (c.savedComponentId !== savedComponentId) return c;
        const { savedComponentId: _muerto, ...resto } = c;
        return resto;
      }),
    };
  });
  if (changed) writeAll(next);
}

/** Enlaza el componente local con el que le corresponde en la librería del backend. */
export function setSavedComponentId(projectId: string, componentId: string, savedComponentId: string): void {
  update(projectId, (p) => ({
    ...p,
    components: p.components.map((c) => (c.id === componentId ? { ...c, savedComponentId } : c)),
  }));
}

/**
 * Trae un componente de la librería del backend a un proyecto para editarlo.
 *
 * El catálogo es la fuente de verdad de la librería, pero el constructor trabaja
 * sobre un proyecto local, así que abrir un componente para editarlo significa
 * traerse su árbol. Si ese componente ya estaba en el proyecto (mismo
 * `savedComponentId`) se actualiza en su sitio en lugar de duplicarlo: si no,
 * abrir dos veces desde el catálogo dejaría dos copias divergentes que al guardar
 * se pisarían la una a la otra en el backend.
 */
export function importSavedComponent(
  projectId: string,
  /*
    El árbol traído incluye el CONTRATO, no solo el marcado.

    `model` y `callbacks` faltaban en este tipo, así que traerse un componente
    del catálogo para editarlo lo abría sin su modelo de datos y sin sus props
    de función: el repetidor se apagaba y los avisos desaparecían. Guardarlo
    después escribía esa versión mutilada encima de la buena.
  */
  saved: { id: string; name: string; tree: Pick<ProjectComponent, 'blocks' | 'rootIds' | 'stateVars' | 'customStyles' | 'stylesLanguage' | 'model' | 'callbacks'> },
): ProjectComponent | null {
  let result: ProjectComponent | null = null;

  update(projectId, (project) => {
    const existing = project.components.find((c) => c.savedComponentId === saved.id);
    const component: ProjectComponent = {
      ...(existing ?? emptyComponent(saved.name)),
      ...saved.tree,
      name: saved.name,
      savedComponentId: saved.id,
      updatedAt: new Date().toISOString(),
    };
    result = component;
    return {
      ...project,
      components: existing
        ? project.components.map((c) => (c.id === component.id ? component : c))
        : [...project.components, component],
    };
  });

  return result;
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

/**
 * Quita un componente del proyecto.
 *
 * No deja el proyecto sin ninguno: el constructor edita SIEMPRE un componente
 * —su estado, su lienzo y su panel de propiedades cuelgan de él— y un proyecto
 * vacío lo abriría sin nada que editar y sin forma de salir de ahí salvo
 * volviendo a Inicio. Para deshacerse del último está el borrado del proyecto,
 * que es lo que en realidad se está pidiendo en ese caso.
 *
 * Devuelve el componente que conviene abrir a continuación, o `null` si no se
 * borró nada: quien llama necesita saberlo porque el borrado puede ser el que
 * estaba abierto.
 */
export function removeComponent(projectId: string, componentId: string): ProjectComponent | null {
  let siguiente: ProjectComponent | null = null;

  update(projectId, (p) => {
    const idx = p.components.findIndex((c) => c.id === componentId);
    if (idx === -1 || p.components.length <= 1) return p;

    const restantes = p.components.filter((c) => c.id !== componentId);
    // El vecino de al lado, no el primero: al ir borrando en cadena, saltar cada
    // vez al principio de la lista obliga a volver a buscar dónde estabas.
    siguiente = restantes[Math.min(idx, restantes.length - 1)];
    return { ...p, components: restantes };
  });

  return siguiente;
}
