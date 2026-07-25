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

export function createProject(name: string, kind: ProjectKind): Project {
  const project: Project = {
    id: genId('proj'),
    name: name.trim() || 'Proyecto sin nombre',
    kind,
    tech: 'react',
    createdAt: new Date().toISOString(),
    theme: DEFAULT_THEME,
    components: [emptyComponent('Componente 1')],
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

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}
