interface Props {
  totalScores: number[];
}

export function DoneView({ totalScores }: Props) {
  const average = totalScores.length === 0
    ? 0
    : totalScores.reduce((acc, v) => acc + v, 0) / totalScores.length;

  return (
    <section className="max-w-md mx-auto bg-white p-6 rounded shadow space-y-3 text-center">
      <h2 className="text-2xl font-bold">¡Gracias por participar!</h2>
      <p className="text-sm text-slate-600">
        Sus respuestas se han registrado correctamente. El facilitador
        continuará con la entrevista post-sesión.
      </p>
      <div className="bg-slate-100 rounded p-3 text-sm text-slate-700">
        SUS medio de esta sesión: <strong>{average.toFixed(1)}</strong> / 100
        <br />
        ({totalScores.length} componentes evaluados)
      </div>
    </section>
  );
}
