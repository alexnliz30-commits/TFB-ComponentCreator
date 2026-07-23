import { useEffect, useMemo, useState } from 'react';
import { recordTask } from '../api/sessions';
import { ComponentSandbox } from '../components/ComponentSandbox';
import type { CorpusItem } from './types';

interface Props {
  item: CorpusItem;
  sessionId: string;
  token: string;
  onCompleted: () => void;
}

export function TaskView({ item, sessionId, token, onCompleted }: Props) {
  const [startedAt] = useState(() => Date.now());
  const [errorCount, setErrorCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elapsedSeconds = useElapsedSeconds(startedAt);

  async function handleComplete(success: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await recordTask(token, sessionId, {
        componentType: item.type,
        condition: item.condition,
        durationMs: Date.now() - startedAt,
        errorCount,
        success,
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando la tarea');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-2xl mx-auto bg-white p-6 rounded shadow space-y-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{item.label}</h2>
        <span className="text-sm text-slate-500" aria-live="polite">⏱ {elapsedSeconds} s</span>
      </header>
      <p className="text-sm text-slate-600">
        Realiza la tarea correspondiente al componente. Marca «Registrar error» si te equivocas
        durante la interacción. Al finalizar, pulsa «Completada» o «No conseguí completarla».
      </p>
      <ComponentSandbox sourceCode={item.sourceCode} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setErrorCount((c) => c + 1)}
          className="px-3 py-1 border border-amber-500 text-amber-700 rounded"
        >
          Registrar error ({errorCount})
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleComplete(true)}
          className="px-3 py-1 bg-emerald-600 text-white rounded disabled:bg-slate-300"
        >
          Completada
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleComplete(false)}
          className="px-3 py-1 bg-slate-500 text-white rounded disabled:bg-slate-300"
        >
          No conseguí completarla
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => Math.floor((now - startedAt) / 1000), [now, startedAt]);
}
