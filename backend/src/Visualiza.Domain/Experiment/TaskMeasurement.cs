using Visualiza.Domain.Components;

namespace Visualiza.Domain.Experiment;

public sealed class TaskMeasurement
{
    public Guid Id { get; }
    public Guid SessionId { get; }
    public ComponentType ComponentType { get; }
    public Condition Condition { get; }
    public int DurationMs { get; }
    public int ErrorCount { get; }
    public bool Success { get; }
    public DateTime CreatedAt { get; }

    public TaskMeasurement(
        Guid sessionId,
        ComponentType componentType,
        Condition condition,
        int durationMs,
        int errorCount,
        bool success)
    {
        if (sessionId == Guid.Empty) throw new ArgumentException("SessionId is required.", nameof(sessionId));
        if (durationMs < 0) throw new ArgumentOutOfRangeException(nameof(durationMs));
        if (errorCount < 0) throw new ArgumentOutOfRangeException(nameof(errorCount));
        Id = Guid.NewGuid();
        SessionId = sessionId;
        ComponentType = componentType;
        Condition = condition;
        DurationMs = durationMs;
        ErrorCount = errorCount;
        Success = success;
        CreatedAt = DateTime.UtcNow;
    }
}
