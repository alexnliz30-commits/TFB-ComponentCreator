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
import type { StateVar } from '../builder/actions';
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
   */
  savedComponentId?: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  /** Tecnología del proyecto. Por ahora solo React (el constructor emite TSX). */
  tech: 'react';
  createdAt: string;
  /** Librería del backend enlazada (solo proyectos «librería» con backend vivo). */
  backendLibraryId?: string;
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
  // preguntarse si hay tema o no.
  return { ...project, theme: normalizeTheme(project.theme) };
}

/**
 * El kit de ejemplo «Atenea» como componentes editables de un proyecto.
 *
 * Se copian del módulo de la semilla en vez de referenciarlos: son constantes
 * a nivel de módulo, y el constructor edita los árboles en sitio. Sin la copia,
 * diseñar sobre un proyecto de ejemplo mutaría la plantilla y el siguiente
 * proyecto nacería con los cambios del anterior.
 */
function exampleComponents(): ProjectComponent[] {
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
export function createProject(name: string, kind: ProjectKind, withExample = false): Project {
  const project: Project = {
    id: genId('proj'),
    name: name.trim() || 'Proyecto sin nombre',
    kind,
    tech: 'react',
    createdAt: new Date().toISOString(),
    theme: withExample ? SEED_LIBRARY.theme : DEFAULT_THEME,
    components: withExample ? exampleComponents() : [emptyComponent('Componente 1')],
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

export function setBackendLibraryId(projectId: string, backendLibraryId: string): void {
  update(projectId, (p) => ({ ...p, backendLibraryId }));
}

export function addComponent(projectId: string, name: string): ProjectComponent | null {
  const component = emptyComponent(name);
  const updated = update(projectId, (p) => ({ ...p, components: [...p.components, component] }));
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
    if (p.backendLibraryId !== libraryId) return p;
    changed = true;
    const { backendLibraryId: _discard, ...rest } = p;
    return {
      ...rest,
      components: p.components.map(({ savedComponentId: _drop, ...c }) => c),
    } as Project;
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
  saved: { id: string; name: string; tree: Pick<ProjectComponent, 'blocks' | 'rootIds' | 'stateVars' | 'customStyles' | 'stylesLanguage'> },
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
