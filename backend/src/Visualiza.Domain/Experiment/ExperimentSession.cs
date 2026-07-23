namespace Visualiza.Domain.Experiment;

public sealed class ExperimentSession
{
    public Guid Id { get; }
    public Guid ParticipantId { get; }
    public DateTime StartedAt { get; }
    public DateTime? CompletedAt { get; private set; }

    public ExperimentSession(Guid participantId)
    {
        if (participantId == Guid.Empty)
            throw new ArgumentException("ParticipantId is required.", nameof(participantId));
        Id = Guid.NewGuid();
        ParticipantId = participantId;
        StartedAt = DateTime.UtcNow;
    }

    private ExperimentSession(Guid id, Guid participantId, DateTime startedAt, DateTime? completedAt)
    {
        Id = id;
        ParticipantId = participantId;
        StartedAt = startedAt;
        CompletedAt = completedAt;
    }

    public void Complete()
    {
        if (CompletedAt is not null)
            throw new InvalidOperationException("Session is already completed.");
        CompletedAt = DateTime.UtcNow;
    }

    public static ExperimentSession Rehydrate(Guid id, Guid participantId, DateTime startedAt, DateTime? completedAt)
        => new(id, participantId, startedAt, completedAt);
}
