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

import type { BuilderBlock } from '../builder/types';
import type { StateVar } from '../builder/actions';

export type ProjectKind = 'loose' | 'library';

export interface ProjectComponent {
  id: string;
  name: string;
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  stateVars: StateVar[];
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
  return readAll().find((p) => p.id === id) ?? null;
}

export function createProject(name: string, kind: ProjectKind): Project {
  const project: Project = {
    id: genId('proj'),
    name: name.trim() || 'Proyecto sin nombre',
    kind,
    tech: 'react',
    createdAt: new Date().toISOString(),
    components: [emptyComponent('Componente 1')],
  };
  writeAll([...readAll(), project]);
  return project;
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
  tree: { blocks: Record<string, BuilderBlock>; rootIds: string[]; stateVars: StateVar[] },
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
