using Visualiza.Domain.Components;

namespace Visualiza.Domain.Experiment;

public sealed class SusResponse
{
    public Guid Id { get; }
    public Guid SessionId { get; }
    /// <summary>
    /// Tipo del componente valorado, o <c>null</c> cuando el cuestionario se
    /// refiere al CONJUNTO de componentes de una condición.
    ///
    /// El SUS se concibió para valorar un sistema completo, no una pieza suelta:
    /// varios de sus ítems resultan forzados aplicados a un componente aislado.
    /// Desde el rediseño del protocolo se administra una vez por condición, y
    /// entonces no hay un tipo al que referirlo. Guardar aquí uno cualquiera
    /// sería inventarse un dato que el análisis leería como verdadero.
    /// </summary>
    public ComponentType? ComponentType { get; }
    public Condition Condition { get; }
    public IReadOnlyList<int> Items { get; }
    public double Score { get; }
    public DateTime CreatedAt { get; }

    public SusResponse(
        Guid sessionId,
        ComponentType? componentType,
        Condition condition,
        IReadOnlyList<int> items)
    {
        if (sessionId == Guid.Empty) throw new ArgumentException("SessionId is required.", nameof(sessionId));
        if (items is null || items.Count != 10)
            throw new ArgumentException("SUS requires exactly 10 items.", nameof(items));
        foreach (var v in items)
        {
            if (v is < 1 or > 5)
                throw new ArgumentOutOfRangeException(nameof(items), "Each item must be a 1-5 Likert value.");
        }

        Id = Guid.NewGuid();
        SessionId = sessionId;
        ComponentType = componentType;
        Condition = condition;
        Items = items;
        Score = ComputeScore(items);
        CreatedAt = DateTime.UtcNow;
    }

    private static double ComputeScore(IReadOnlyList<int> items)
    {
        double sum = 0;
        for (var i = 0; i < items.Count; i++)
        {
            sum += (i % 2 == 0) ? items[i] - 1 : 5 - items[i];
        }
        return sum * 2.5;
    }
}
