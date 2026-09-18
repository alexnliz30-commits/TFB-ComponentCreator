/**
 * Puerta de acceso al constructor (RF11).
 *
 * Pide el código **del proyecto que se está abriendo**, no uno global: cada
 * proyecto nace con el suyo y el servidor lo entrega al crearlo. Antes era un
 * único código de configuración, y eso dejaba la promesa de la pantalla de inicio
 * —«crea un proyecto»— sin cumplir: había que conocer de antemano una llave que el
 * sistema no daba por ninguna parte.
 *
 * Cubre las vistas del diseñador —constructor y librerías—, no el experimento:
 * los participantes siguen entrando de forma anónima con su código de sesión, y
 * pedirles nada más invalidaría el protocolo del estudio.
 */

import { useState, type ReactNode } from 'react';
import {
  exchangeAccessCode, hasAccessToProject, hasDesignerAccess, openProject,
} from '../api/designer-access';

/** Lo que la puerta necesita saber del proyecto: su nombre y su identidad en el servidor. */
export interface GatedProject {
  name: string;
  serverId?: string;
}

interface Props {
  children: ReactNode;
  /**
   * Proyecto cuyo código se pide. Sin `serverId` —proyecto anterior a los códigos
   * por proyecto, o creado sin backend a mano— no hay código que pedir: se cae a
   * la llave maestra, que es la única que puede abrirlo.
   */
  project: GatedProject | null;
  /** Se invoca al conseguir acceso, para que la vista de arriba se entere. */
  onUnlocked?: () => void;
}

export function DesignerGate({ children, project, onUnlocked }: Props) {
  const serverId = project?.serverId;

  // El estado arranca leyendo el almacenamiento: un token vigente de una sesión
  // anterior no debe obligar a teclear el código otra vez.
  const [unlocked, setUnlocked] = useState(() =>
    serverId ? hasAccessToProject(serverId) : hasDesignerAccess());
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'wrong' | 'error'>('idle');

  if (unlocked) return <>{children}</>;

  async function submit() {
    if (!code.trim() || status === 'checking') return;
    setStatus('checking');
    try {
      // Con proyecto registrado se prueba su código y, si no es, la maestra: eso
      // lo resuelve `openProject`. Sin él solo cabe la maestra.
      const ok = serverId
        ? await openProject(serverId, code.trim())
        : await exchangeAccessCode(code.trim());
      if (ok) {
        setUnlocked(true);
        onUnlocked?.();
        return;
      }
      setStatus('wrong');
    } catch {
      // Un backend caído no es un código incorrecto, y decir lo segundo mandaría
      // al usuario a buscar un código que sí tenía bien.
      setStatus('error');
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900">
          {project ? `Abrir «${project.name}»` : 'Acceso al constructor'}
        </h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          {!project
            ? 'Generar componentes con IA y editar las librerías requiere el código de acceso. El flujo del experimento no lo necesita.'
            : serverId
              ? 'Teclea el código que se generó al crear este proyecto. Si lo perdiste, el código maestro del despliegue también lo abre.'
              : 'Este proyecto no llegó a registrarse en el servidor, así que no tiene código propio: se abre con el código maestro del despliegue.'}
        </p>

        <input
          type="password"
          value={code}
          onChange={(e) => { setCode(e.target.value); setStatus('idle'); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Código de acceso"
          autoFocus
          className="mt-4 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
            focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
        />

        {status === 'wrong' && (
          <p className="text-xs text-red-600 mt-2">Ese código no es válido.</p>
        )}
        {status === 'error' && (
          <p className="text-xs text-amber-600 mt-2">
            No se pudo contactar con el servidor. Comprueba que el backend está en marcha.
          </p>
        )}

        <button
          onClick={submit}
          disabled={!code.trim() || status === 'checking'}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
            text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          {status === 'checking' ? 'Comprobando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
