namespace Visualiza.Infrastructure.Persistence;

public sealed class GeneratedComponentRecord
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Prompt { get; set; } = string.Empty;
    public string SourceCode { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; }
    public bool Compiled { get; set; }
    public string? Diagnostics { get; set; }
}
