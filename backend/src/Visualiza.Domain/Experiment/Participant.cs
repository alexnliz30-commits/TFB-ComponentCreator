namespace Visualiza.Domain.Experiment;

public sealed class Participant
{
    public Guid Id { get; }
    public string Code { get; }
    public DateTime CreatedAt { get; }

    public Participant(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new ArgumentException("Code is required.", nameof(code));
        Id = Guid.NewGuid();
        Code = code.Trim().ToUpperInvariant();
        CreatedAt = DateTime.UtcNow;
    }

    private Participant(Guid id, string code, DateTime createdAt)
    {
        Id = id;
        Code = code;
        CreatedAt = createdAt;
    }

    public static Participant Rehydrate(Guid id, string code, DateTime createdAt)
        => new(id, code, createdAt);
}
