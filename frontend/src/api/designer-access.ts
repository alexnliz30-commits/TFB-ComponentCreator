/**
 * Acceso al constructor (RF11).
 *
 * El código de acceso se canjea una vez por un token, y es el token —no el
 * código— lo que queda guardado: así el secreto compartido no vive indefinidamente
 * en el navegador, y lo que sí vive caduca solo.
 *
 * Este módulo no importa `client.ts`: es al revés, el cliente HTTP lee de aquí el
 * token para adjuntarlo. Al canje se llama con `fetch` directo por ese motivo, y
 * porque es la única petición del diseñador que no lleva token.
 */

const TOKEN_KEY = 'visualiza.designerToken';

interface StoredToken {
  token: string;
  /** Marca de caducidad en milisegundos, para no enviar un token ya vencido. */
  expiresAt: number;
}

function read(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    // Un token caducado se descarta aquí en vez de esperar al 401: así la
    // interfaz pide el código antes de intentar la acción, no después de que
    // falle a medias.
    if (!parsed?.token || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Token vigente, o `null` si no hay o ya caducó. */
export function designerToken(): string | null {
  return read()?.token ?? null;
}

export function hasDesignerAccess(): boolean {
  return designerToken() !== null;
}

export function clearDesignerAccess(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Canjea el código por un token y lo guarda.
 *
 * Devuelve `false` con un código incorrecto, en vez de lanzar: no es un error
 * del sistema, es la respuesta esperada a un código que no vale.
 */
export async function exchangeAccessCode(accessCode: string): Promise<boolean> {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  const response = await fetch(`${base}/api/access/designer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  });

  if (!response.ok) return false;

  const body = (await response.json()) as { token: string; expiresInMinutes: number };
  // Se descuenta un minuto del margen para no enviar un token que caduque
  // justo mientras la petición viaja.
  const expiresAt = Date.now() + Math.max(1, body.expiresInMinutes - 1) * 60_000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: body.token, expiresAt }));
  return true;
}
