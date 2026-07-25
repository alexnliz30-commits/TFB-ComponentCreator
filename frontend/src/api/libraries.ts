import { apiFetch } from './client';

export type TargetFramework = 'React' | 'Vue2' | 'Vue3' | 'Angular';
export type CodeLanguage = 'TypeScript' | 'JavaScript';

export const FRAMEWORK_LABELS: Record<TargetFramework, string> = {
  React: 'React 18',
  Vue2: 'Vue 2',
  Vue3: 'Vue 3',
  Angular: 'Angular (última versión)',
};

/** Extensión de fichero sugerida para el código de una librería. */
export function fileExtension(framework: TargetFramework, language: CodeLanguage): string {
  if (framework === 'Vue2' || framework === 'Vue3') return 'vue';
  if (framework === 'Angular') return 'ts';
  return language === 'TypeScript' ? 'tsx' : 'jsx';
}

export interface LibrarySummary {
  id: string;
  name: string;
  description: string;
  framework: TargetFramework;
  language: CodeLanguage;
  createdAt: string;
  componentCount: number;
}

export interface SavedComponent {
  id: string;
  libraryId: string;
  name: string;
  sourceCode: string;
  createdAt: string;
  /**
   * Árbol de bloques del constructor, serializado. Null en los componentes
   * generados como código: del TSX emitido no se puede reconstruir el árbol.
   */
  treeJson: string | null;
  /** Atajo de `treeJson !== null`: si es falso, el componente solo se ve y descarga. */
  editable: boolean;
}

export interface LibraryDetail {
  library: LibrarySummary;
  components: SavedComponent[];
}

export interface CreateLibraryRequest {
  name: string;
  framework: TargetFramework;
  language: CodeLanguage;
  description?: string;
}

export function createLibrary(request: CreateLibraryRequest): Promise<LibrarySummary> {
  return apiFetch<LibrarySummary>({ path: '/api/libraries', method: 'POST', body: request });
}

export function listLibraries(): Promise<LibrarySummary[]> {
  return apiFetch<LibrarySummary[]>({ path: '/api/libraries' });
}

export function getLibrary(id: string): Promise<LibraryDetail> {
  return apiFetch<LibraryDetail>({ path: `/api/libraries/${id}` });
}

export interface SaveComponentRequest {
  name: string;
  sourceCode: string;
  /** Árbol de bloques, para que el componente se pueda reabrir en el constructor. */
  treeJson?: string;
  /**
   * Componente que se está revisando. Sin él, el backend busca por nombre dentro
   * de la librería; solo da de alta cuando tampoco hay coincidencia. Guardar es
   * un upsert porque desde el constructor se guarda muchas veces el MISMO
   * componente, y con altas puras la librería se llenaba de copias homónimas.
   */
  componentId?: string;
}

/** Crea el componente o revisa el existente. 201 al crear, 200 al revisar. */
export function saveComponent(
  libraryId: string,
  request: SaveComponentRequest,
): Promise<SavedComponent> {
  return apiFetch<SavedComponent>({
    path: `/api/libraries/${libraryId}/components`,
    method: 'POST',
    body: request,
  });
}

/** Elimina la librería con todos sus componentes. */
export function deleteLibrary(libraryId: string): Promise<void> {
  return apiFetch<void>({ path: `/api/libraries/${libraryId}`, method: 'DELETE' });
}

export function deleteComponent(libraryId: string, componentId: string): Promise<void> {
  return apiFetch<void>({
    path: `/api/libraries/${libraryId}/components/${componentId}`,
    method: 'DELETE',
  });
}
