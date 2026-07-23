namespace Visualiza.Domain.Components;

public sealed class UiComponent
{
    public Guid Id { get; }
    public ComponentType Type { get; }
    public string SourceCode { get; }
    public string Language { get; }
    public DateTime GeneratedAt { get; }

    public UiComponent(ComponentType type, string sourceCode, string language)
    {
        if (string.IsNullOrWhiteSpace(sourceCode))
            throw new ArgumentException("Source code cannot be empty.", nameof(sourceCode));
        if (string.IsNullOrWhiteSpace(language))
            throw new ArgumentException("Language cannot be empty.", nameof(language));

        Id = Guid.NewGuid();
        Type = type;
        SourceCode = sourceCode;
        Language = language;
        GeneratedAt = DateTime.UtcNow;
    }
}
