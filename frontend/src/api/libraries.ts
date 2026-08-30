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

/**
 * Clave del emisor que corresponde a lo que el catálogo declara.
 *
 * El catálogo guarda familia + lenguaje (`Angular` + `TypeScript`) mientras que
 * los emisores se registran por destino concreto (`angular22`). De Angular se
 * elige la versión vigente: es la que produce el código más limpio de las dos, y
 * la anterior existe para quien todavía no ha migrado, no como formato de
 * archivo.
 */
export function targetDe(framework: TargetFramework, language: CodeLanguage): string {
  if (framework === 'Angular') return 'angular22';
  if (framework === 'Vue3') return language === 'JavaScript' ? 'vue3-js' : 'vue3';
  if (framework === 'Vue2') return language === 'JavaScript' ? 'vue2-js' : 'vue2';
  return language === 'JavaScript' ? 'react-js' : 'react';
}

export interface LibrarySummary {
  id: string;
  name: string;
  description: string;
  framework: TargetFramework;
  language: CodeLanguage;
  createdAt: string;
  componentCount: number;
  /**
   * Estilos GLOBALES de la librería: el tema serializado y su hoja compartida.
   *
   * Viven en la librería y no en el proyecto local del navegador. Con aquello,
   * abrir la misma librería desde otro equipo la pintaba con el tema por
   * defecto: sus «estilos globales» no eran realmente suyos.
   *
   * Nulos en las creadas antes del campo, y ausentes en el LISTADO —que solo
   * pinta tarjetas y no los necesita—; llegan al abrir una.
   */
  themeJson?: string | null;
  globalStyles?: string | null;
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
  /** Una librería puede nacer ya con su identidad visual. */
  themeJson?: string;
  globalStyles?: string;
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

/**
 * Sustituye los estilos globales de la librería.
 *
 * Los dos campos son opcionales por separado: el panel edita el tema y la hoja
 * global como dos gestos distintos, y guardar uno no puede borrar el otro.
 * Omitido = no lo toques; cadena vacía = déjalo sin nada.
 */
export function updateLibraryStyles(
  libraryId: string,
  styles: { themeJson?: string; globalStyles?: string },
): Promise<LibrarySummary> {
  return apiFetch<LibrarySummary>({
    path: `/api/libraries/${libraryId}/styles`,
    method: 'PUT',
    body: styles,
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
