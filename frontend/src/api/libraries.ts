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

export function saveComponent(
  libraryId: string,
  request: { name: string; sourceCode: string },
): Promise<SavedComponent> {
  return apiFetch<SavedComponent>({
    path: `/api/libraries/${libraryId}/components`,
    method: 'POST',
    body: request,
  });
}

export function deleteComponent(libraryId: string, componentId: string): Promise<void> {
  return apiFetch<void>({
    path: `/api/libraries/${libraryId}/components/${componentId}`,
    method: 'DELETE',
  });
}
