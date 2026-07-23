import { useState } from 'react';
import { startSession } from '../api/sessions';

interface Props {
  onStarted: (sessionId: string, token: string) => void;
}

export function WelcomeView({ onStarted }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await startSession(code);
      onStarted(response.sessionId, response.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-md mx-auto bg-white p-6 rounded shadow space-y-4">
      <h1 className="text-2xl font-bold">Bienvenido a la sesión de Visualiza</h1>
      <p className="text-sm text-slate-600">
        Introduce el código que te ha facilitado el facilitador para comenzar la sesión
        experimental. Toda la información será tratada de forma anónima.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Código de participante</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full border rounded px-2 py-1"
            placeholder="P001"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading || code.trim() === ''}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-2 rounded"
        >
          {loading ? 'Iniciando…' : 'Comenzar sesión'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
