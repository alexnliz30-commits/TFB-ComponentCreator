namespace Visualiza.Infrastructure.Persistence;

public sealed class SavedComponentRecord
{
    public Guid Id { get; set; }
    public Guid LibraryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SourceCode { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
