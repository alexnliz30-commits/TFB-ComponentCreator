namespace Visualiza.Infrastructure.Persistence;

public sealed class ParticipantRecord
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public sealed class ExperimentSessionRecord
{
    public Guid Id { get; set; }
    public Guid ParticipantId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

public sealed class TaskMeasurementRecord
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public string ComponentType { get; set; } = string.Empty;
    public string Condition { get; set; } = string.Empty;
    public int DurationMs { get; set; }
    public int ErrorCount { get; set; }
    public bool Success { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class SusResponseRecord
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    /// <summary>Nulo cuando el SUS valora el conjunto de una condición, no un componente.</summary>
    public string? ComponentType { get; set; }
    public string Condition { get; set; } = string.Empty;
    public int Item1 { get; set; }
    public int Item2 { get; set; }
    public int Item3 { get; set; }
    public int Item4 { get; set; }
    public int Item5 { get; set; }
    public int Item6 { get; set; }
    public int Item7 { get; set; }
    public int Item8 { get; set; }
    public int Item9 { get; set; }
    public int Item10 { get; set; }
    public double Score { get; set; }
    public DateTime CreatedAt { get; set; }
}
