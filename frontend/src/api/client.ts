import { clearDesignerAccess, designerToken } from './designer-access';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const BASE_URL = RAW_BASE.replace(/\/+$/, '');

export interface ApiRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /**
   * Token explícito. Lo usa el flujo del experimento, cuyo token pertenece a una
   * sesión concreta y vive en el estado de la vista, no en el almacenamiento.
   */
  token?: string | null;
}

/** Error con el código HTTP a la vista, para poder distinguir un 401 de un fallo real. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** `true` si el error viene de no tener acceso al constructor (RF11). */
export function isAccessError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * Rutas del diseñador, que viajan con el token del constructor.
 *
 * Se enumeran en vez de mandar el token en todo: los endpoints de sesión del
 * experimento llevan el suyo propio, y adjuntar dos credenciales a la misma
 * petición solo puede acabar en que gane la equivocada.
 */
const DESIGNER_PATHS = ['/api/components', '/api/libraries'];

/**
 * El motivo del fallo, tomado del cuerpo si el backend lo explica.
 *
 * El backend responde `ProblemDetails` en TODOS sus errores y pone el motivo en
 * `detail` —«La clave de la API de Claude no es válida…»—, pero aquí se tiraba el
 * cuerpo y se construía el mensaje solo con el código y la ruta. Lo que llegaba a
 * la persona era «Backend respondió 500 en POST /api/components/assist»: ni qué
 * pasa, ni qué hacer, y con pinta de programa roto cuando bastaba con corregir
 * una variable de entorno.
 *
 * Se cae al mensaje genérico si el cuerpo no es JSON o no trae explicación: hay
 * fallos —un proxy caído, un 502 de infraestructura— que no pasan por el backend
 * y no tienen `detail` que leer.
 */
async function errorMessage(response: Response, method: string, path: string): Promise<string> {
  const generico = `Backend respondió ${response.status} en ${method} ${path}`;
  try {
    const problema = await response.json();
    const detalle = typeof problema?.detail === 'string' ? problema.detail.trim() : '';
    return detalle || generico;
  } catch {
    return generico;
  }
}

export async function apiFetch<T>({ path, method = 'GET', body, token }: ApiRequest): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const bearer = token ?? (DESIGNER_PATHS.some((p) => path.startsWith(p)) ? designerToken() : null);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    // Un token del constructor rechazado ya no sirve: se descarta para que la
    // interfaz vuelva a pedir el código en lugar de reintentar con él.
    if ((response.status === 401 || response.status === 403) && !token) clearDesignerAccess();
    throw new ApiError(response.status, await errorMessage(response, method, path));
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
