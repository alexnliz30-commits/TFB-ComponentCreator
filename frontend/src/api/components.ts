import { apiFetch } from './client';

export type ComponentType =
  | 'RegistrationForm'
  | 'DataTable'
  | 'StatsPanel'
  | 'NavigationMenu'
  | 'ProductCard';

export interface GenerateComponentRequest {
  type: ComponentType;
  prompt: string;
  /** Tecnología objetivo; por defecto el backend genera React + TypeScript. */
  framework?: 'React' | 'Vue2' | 'Vue3' | 'Angular';
  language?: 'TypeScript' | 'JavaScript';
}

export interface GenerateComponentResponse {
  id: string;
  type: ComponentType;
  sourceCode: string;
  language: string;
  generatedAt: string;
  compiled: boolean;
  diagnostics: string | null;
  /**
   * false cuando el harness tsc no llegó a ejecutarse: la tecnología no es React+TS,
   * o el entorno no tiene Node. No equivale a un fallo de compilación.
   */
  verified: boolean;
}

export function generateComponent(
  request: GenerateComponentRequest,
): Promise<GenerateComponentResponse> {
  return apiFetch<GenerateComponentResponse>({
    path: '/api/components/generate',
    method: 'POST',
    body: request,
  });
}

export interface RefineComponentRequest {
  sourceCode: string;
  instruction: string;
}

export interface RefineComponentResponse {
  sourceCode: string;
  compiled: boolean;
  diagnostics: string | null;
  /** false cuando el harness tsc no pudo ejecutarse (sin Node en el entorno). */
  verified: boolean;
}

export function refineComponent(
  request: RefineComponentRequest,
): Promise<RefineComponentResponse> {
  return apiFetch<RefineComponentResponse>({
    path: '/api/components/refine',
    method: 'POST',
    body: request,
  });
}

export interface PatchBlockRequest {
  blockType: string;
  /** Props actuales del bloque, serializadas. */
  currentPropsJson: string;
  /** Variables de estado del lienzo: el modelo solo puede referirse a estas. */
  stateVarsJson: string;
  instruction: string;
  /**
   * Contrato de datos del componente, si declara uno. Es lo que permite pedir
   * una regla de negocio («píntalo en rojo si el stock está a cero») en lugar de
   * solo una condición sobre el estado de la interfaz.
   */
  modelJson?: string;
  /** Props de función declaradas: el modelo puede llamarlas, no inventarlas. */
  callbacksJson?: string;
}

export interface PatchBlockResponse {
  /** Objeto JSON ya saneado por el backend. `{}` si no hay nada aplicable. */
  patchJson: string;
  /** false cuando el parche se descartó; el bloque queda intacto. */
  applied: boolean;
  diagnostics: string | null;
}

/**
 * Modifica el bloque seleccionado con IA devolviendo un parche estructurado.
 *
 * Frente a `refineComponent`, que devuelve código y congela el componente (el árbol
 * deja de gobernarlo), esto mantiene el bloque editable visualmente y deshacible.
 */
export function patchBlock(request: PatchBlockRequest): Promise<PatchBlockResponse> {
  return apiFetch<PatchBlockResponse>({
    path: '/api/components/patch-block',
    method: 'POST',
    body: request,
  });
}

export interface AssistRequest {
  /** Petición del usuario en lenguaje natural. */
  message: string;
  /** Árbol completo del lienzo ({ blocks, rootIds, stateVars }) serializado. */
  treeJson: string;
  selectedBlockId?: string | null;
  currentCode?: string | null;
  /** Catálogo de la paleta (tipos + props por defecto) para que la IA no se desincronice. */
  paletteJson?: string | null;
  /** Estilos globales de la librería, para que lo generado los respete. */
  themeJson?: string | null;
  /**
   * Utilidades Tailwind que el lienzo sabe pintar. Sin esto la IA escribe
   * Tailwind válido pero fuera del CSS compilado del editor, y el bloque se
   * renderiza sin espaciado ni rejilla aunque el código exportado sea correcto.
   */
  styleVocabularyJson?: string | null;
  /** Capturas o bocetos de los que deducir qué componentes construir. */
  images?: AssistImage[] | null;
  /**
   * Turnos anteriores del chat. Sin ellos el asistente no puede preguntar y
   * después construir con la respuesta: cada petición nacería sin memoria.
   */
  historyJson?: string | null;
  /** Librerías existentes, para que la pregunta de destino ofrezca las de verdad. */
  librariesJson?: string | null;
  /** Proyecto abierto y los componentes que ya contiene. */
  projectJson?: string | null;
}

export interface AssistImage {
  /** image/png, image/jpeg, image/webp o image/gif. */
  mediaType: string;
  /** Base64 sin el prefijo `data:`; el backend lo pasa tal cual a la API. */
  dataBase64: string;
}

/** Un componente de una tanda devuelta por el asistente. */
export interface AssistComponent {
  name: string;
  treeJson: string;
}

/**
 * Destino de una tanda: dónde deben acabar los componentes.
 *
 * Llega estructurado porque el cliente tiene que actuar —crear la librería o
 * publicar en la que ya existe—, no solo contarlo en el chat.
 */
export interface AssistTarget {
  kind: 'existing' | 'new' | 'none';
  libraryId?: string | null;
  libraryName?: string | null;
}

export interface AssistResponse {
  /** Respuesta conversacional para el chat. */
  reply: string;
  /** Árbol modificado completo, o null si la petición no implicaba cambios. */
  treeJson: string | null;
  applied: boolean;
  /**
   * Respuestas rápidas cuando el asistente pregunta en vez de construir. Null
   * cuando la respuesta no es una pregunta.
   */
  options: string[] | null;
  /**
   * Varios componentes de una vez, cuando de una imagen sale más de uno. Van
   * aparte de `treeJson` porque no sustituyen el lienzo: crean componentes.
   */
  components: AssistComponent[] | null;
  /** Destino de la tanda; null si la respuesta no crea componentes. */
  target: AssistTarget | null;
}

/**
 * Asistente de la plataforma (Claude): recibe el árbol de bloques completo, el bloque
 * seleccionado y el código emitido, y puede responder texto y/o devolver el árbol
 * modificado. El árbol se valida en el cliente (`sanitize-tree.ts`) antes de aplicarse.
 */
export function assist(request: AssistRequest): Promise<AssistResponse> {
  return apiFetch<AssistResponse>({
    path: '/api/components/assist',
    method: 'POST',
    body: request,
  });
}

export interface CompileStylesheetRequest {
  /** Código del componente; de él se extraen las clases usadas. */
  markup: string;
  customStyles?: string;
  stylesLanguage?: 'css' | 'scss';
}

export interface CompileStylesheetResponse {
  css: string | null;
  /** true si hay hoja utilizable; si no, el paquete depende de Tailwind en destino. */
  generated: boolean;
  /** false cuando el backend no tiene Node y Tailwind no pudo ejecutarse. */
  toolchainAvailable: boolean;
  diagnostics: string | null;
}

/**
 * Genera la hoja de estilos autocontenida del componente exportado.
 *
 * Resuelve las utilidades Tailwind a CSS real para que el paquete funcione en
 * proyectos que no usan Tailwind. Requiere Node en la máquina del backend; sin él
 * responde con `generated: false` en vez de fallar.
 */
export function compileStylesheet(
  request: CompileStylesheetRequest,
): Promise<CompileStylesheetResponse> {
  return apiFetch<CompileStylesheetResponse>({
    path: '/api/components/stylesheet',
    method: 'POST',
    body: request,
  });
}
