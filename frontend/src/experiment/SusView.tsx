import { useState } from 'react';
import { recordSus } from '../api/sessions';
import { SUS_ITEMS } from './types';
import type { CorpusBlock } from './types';

interface Props {
  /** El bloque que se acaba de completar: el SUS valora el conjunto entero. */
  block: CorpusBlock;
  sessionId: string;
  token: string;
  onCompleted: (score: number) => void;
}

const LIKERT_LABELS = [
  '1 — Totalmente en desacuerdo',
  '2',
  '3 — Neutro',
  '4',
  '5 — Totalmente de acuerdo',
];

export function SusView({ block, sessionId, token, onCompleted }: Props) {
  const [items, setItems] = useState<(number | null)[]>(Array(10).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = items.every((v) => v !== null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await recordSus(token, sessionId, {
        // Sin tipo de componente: el cuestionario se refiere al conjunto de la
        // condición, no a una pieza concreta. Mandar uno cualquiera guardaría en
        // la base un dato que el análisis leería como verdadero.
        componentType: null,
        condition: block.condition,
        items: items as number[],
      });
      onCompleted(response.score);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el SUS');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-2xl mx-auto bg-white p-6 rounded shadow space-y-4">
      <header>
        <h2 className="text-xl font-semibold">
          Cuestionario SUS — conjunto {block.set}
        </h2>
        <p className="text-sm text-slate-600">
          Piensa en los {block.items.length} componentes del conjunto {block.set} que acabas de
          usar, en su conjunto y no de uno en uno. Indica tu grado de acuerdo con cada
          afirmación (escala 1-5).
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-3">
        {SUS_ITEMS.map((statement, idx) => (
          <fieldset key={idx} className="border rounded p-3">
            <legend className="text-sm font-medium px-1">
              {idx + 1}. {statement}
            </legend>
            <div className="flex flex-wrap gap-3 mt-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="text-sm flex items-center gap-1">
                  <input
                    type="radio"
                    name={`sus-${block.set}-${idx}`}
                    value={value}
                    checked={items[idx] === value}
                    onChange={() => {
                      const next = [...items];
                      next[idx] = value;
                      setItems(next);
                    }}
                  />
                  <span>{LIKERT_LABELS[value - 1]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {items.filter((v) => v !== null).length}/10 respondidos
          </span>
          <button
            type="submit"
            disabled={!allAnswered || submitting}
            className="bg-blue-600 disabled:bg-slate-300 text-white px-4 py-2 rounded"
          >
            {submitting ? 'Enviando…' : 'Enviar respuestas'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
