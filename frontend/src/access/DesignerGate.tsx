/**
 * Puerta de acceso al constructor (RF11).
 *
 * Cubre las vistas del diseñador —constructor y librerías—, no el experimento:
 * los participantes siguen entrando de forma anónima con su código de sesión, y
 * pedirles nada más invalidaría el protocolo del estudio.
 */

import { useState, type ReactNode } from 'react';
import { exchangeAccessCode, hasDesignerAccess } from '../api/designer-access';

interface Props {
  children: ReactNode;
  /** Se invoca al conseguir acceso, para que la vista de arriba se entere. */
  onUnlocked?: () => void;
}

export function DesignerGate({ children, onUnlocked }: Props) {
  // El estado arranca leyendo el almacenamiento: un token vigente de una sesión
  // anterior no debe obligar a teclear el código otra vez.
  const [unlocked, setUnlocked] = useState(hasDesignerAccess);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'wrong' | 'error'>('idle');

  if (unlocked) return <>{children}</>;

  async function submit() {
    if (!code.trim() || status === 'checking') return;
    setStatus('checking');
    try {
      const ok = await exchangeAccessCode(code.trim());
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
        <h2 className="text-base font-semibold text-slate-900">Acceso al constructor</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Generar componentes con IA y editar las librerías requiere el código de acceso.
          El flujo del experimento no lo necesita.
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
