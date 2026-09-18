/**
 * Acceso al constructor (RF11).
 *
 * Hay dos llaves y una sola cerradura. La de **proyecto** nace con el proyecto:
 * el servidor la acuña al darlo de alta, se enseña una vez para copiarla, y es la
 * que se teclea para volver a entrar. La **maestra** viene de la configuración del
 * despliegue y abre cualquier proyecto; es la red de seguridad cuando se pierde un
 * código.
 *
 * En los dos casos lo que queda guardado es el **token**, no el código: así el
 * secreto no vive indefinidamente en el navegador, y lo que sí vive caduca solo.
 *
 * Este módulo no importa `client.ts`: es al revés, el cliente HTTP lee de aquí el
 * token para adjuntarlo. Por eso aquí se llama con `fetch` directo.
 */

const TOKEN_KEY = 'visualiza.designerToken';

interface StoredToken {
  token: string;
  /** Marca de caducidad en milisegundos, para no enviar un token ya vencido. */
  expiresAt: number;
  /**
   * Proyecto que este token abre; `null` = llave maestra, los abre todos.
   *
   * Los tokens guardados antes de existir los códigos por proyecto no lo llevan,
   * y eran maestros por construcción: se leen como `null`, que es lo que eran.
   */
  projectId: string | null;
}

const base = (): string => (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function read(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    // Un token caducado se descarta aquí en vez de esperar al 401: así la
    // interfaz pide el código antes de intentar la acción, no después de que
    // falle a medias.
    if (!parsed?.token || !parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    return { token: parsed.token, expiresAt: parsed.expiresAt, projectId: parsed.projectId ?? null };
  } catch {
    return null;
  }
}

function store(token: string, expiresInMinutes: number, projectId: string | null): void {
  // Se descuenta un minuto del margen para no enviar un token que caduque
  // justo mientras la petición viaja.
  const expiresAt = Date.now() + Math.max(1, expiresInMinutes - 1) * 60_000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt, projectId } satisfies StoredToken));
}

/** Token vigente, o `null` si no hay o ya caducó. */
export function designerToken(): string | null {
  return read()?.token ?? null;
}

export function hasDesignerAccess(): boolean {
  return designerToken() !== null;
}

/**
 * ¿Hay acceso a ESTE proyecto?
 *
 * Un token maestro vale para cualquiera; uno de proyecto, solo para el suyo. La
 * distinción es lo que impide que abrir un proyecto deje abiertos los demás en el
 * mismo navegador, que es justo lo que un código por proyecto promete que no pasa.
 */
export function hasAccessToProject(serverId: string | undefined | null): boolean {
  const stored = read();
  if (!stored) return false;
  if (stored.projectId === null) return true;
  return !!serverId && stored.projectId === serverId;
}

export function clearDesignerAccess(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Olvida el acceso si el token guardado era el de ESTE proyecto.
 *
 * Se llama al borrar un proyecto: su código deja de existir en el servidor, así
 * que conservar el token que canjeó solo sirve para que la cabecera siga
 * ofreciendo «Salir» de una sesión que ya no abre nada. La llave maestra no se
 * toca —es del despliegue, no del proyecto— y por eso se comprueba de quién es
 * el token antes de borrarlo.
 */
export function forgetProjectAccess(serverId: string): void {
  const stored = read();
  if (stored?.projectId === serverId) clearDesignerAccess();
}

/**
 * Canjea la llave maestra por un token y lo guarda.
 *
 * Devuelve `false` con un código incorrecto, en vez de lanzar: no es un error
 * del sistema, es la respuesta esperada a un código que no vale.
 */
export async function exchangeAccessCode(accessCode: string): Promise<boolean> {
  const response = await fetch(`${base()}/api/access/designer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  });

  if (!response.ok) return false;

  const body = (await response.json()) as { token: string; expiresInMinutes: number };
  store(body.token, body.expiresInMinutes, null);
  return true;
}

export interface CreatedProject {
  projectId: string;
  accessCode: string;
}

/**
 * Da de alta el proyecto en el servidor y devuelve su código recién acuñado.
 *
 * Guarda además el token que viene con él, así que quien acaba de crear el
 * proyecto entra sin teclear lo que el sistema le acaba de enseñar. El código es
 * para la próxima vez, para otro navegador y para compartirlo.
 *
 * Lanza si el servidor no responde: a diferencia de un código incorrecto, eso sí
 * es un fallo, y la pantalla de inicio necesita distinguirlos para no acusar a un
 * código que estaba bien.
 */
export async function createServerProject(name: string): Promise<CreatedProject> {
  const stored = read();
  const response = await fetch(`${base()}/api/access/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Solo hace falta si el despliegue tiene el alta cerrada
      // (`Designer:OpenProjectCreation`); si está abierta, sobra y no estorba.
      ...(stored ? { Authorization: `Bearer ${stored.token}` } : {}),
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'Este despliegue no permite crear proyectos sin acceso previo: entra antes con el código maestro.'
        : `El servidor respondió ${response.status} al dar de alta el proyecto.`,
    );
  }

  const body = (await response.json()) as {
    projectId: string; accessCode: string; token: string; expiresInMinutes: number;
  };
  store(body.token, body.expiresInMinutes, body.projectId);
  return { projectId: body.projectId, accessCode: body.accessCode };
}

/**
 * Canjea un código por el acceso a un proyecto.
 *
 * Prueba primero como código del proyecto y después como llave maestra: los dos
 * se teclean en el mismo sitio porque quien los usa no tiene por qué saber cuál
 * de los dos tiene en la mano, y la maestra debe abrir cualquier proyecto.
 */
export async function openProject(serverId: string, accessCode: string): Promise<boolean> {
  const response = await fetch(`${base()}/api/access/projects/${serverId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  });

  if (response.ok) {
    const body = (await response.json()) as { token: string; expiresInMinutes: number };
    store(body.token, body.expiresInMinutes, serverId);
    return true;
  }

  // Un 401 aquí solo dice «no es el código de ESTE proyecto»; todavía puede ser
  // la maestra. Cualquier otro estado es un fallo del servidor y se propaga.
  if (response.status !== 401) {
    throw new Error(`El servidor respondió ${response.status} al comprobar el código.`);
  }
  return exchangeAccessCode(accessCode);
}

/**
 * Cambia el código del proyecto y devuelve el nuevo.
 *
 * Solo funciona estando ya dentro: es un cambio de cerradura desde dentro, no una
 * forma de recuperar lo que se perdió.
 */
export async function regenerateProjectCode(serverId: string): Promise<string> {
  const stored = read();
  if (!stored) throw new Error('Hace falta acceso al proyecto para cambiar su código.');

  const response = await fetch(`${base()}/api/access/projects/${serverId}/code`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stored.token}` },
  });
  if (!response.ok) throw new Error(`El servidor respondió ${response.status} al cambiar el código.`);

  const body = (await response.json()) as { accessCode: string };
  return body.accessCode;
}

/**
 * Da de baja el proyecto en el servidor.
 *
 * Mejor esfuerzo: el proyecto se borra del navegador igualmente. Dejar una fila
 * huérfana en el servidor es molesto, pero impedir borrar el proyecto porque el
 * backend no está sería peor.
 */
export async function deleteServerProject(serverId: string): Promise<void> {
  const stored = read();
  if (!stored) return;

  await fetch(`${base()}/api/access/projects/${serverId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${stored.token}` },
  });
}
