namespace Visualiza.Domain.Libraries;

public sealed class SavedComponent
{
    public Guid Id { get; }
    public Guid LibraryId { get; }
    public string Name { get; }
    public string SourceCode { get; }
    public DateTime CreatedAt { get; }

    public SavedComponent(Guid libraryId, string name, string sourceCode)
        : this(Guid.NewGuid(), libraryId, name, sourceCode, DateTime.UtcNow)
    {
    }

    public SavedComponent(Guid id, Guid libraryId, string name, string sourceCode, DateTime createdAt)
    {
        if (libraryId == Guid.Empty)
            throw new ArgumentException("Library id is required.", nameof(libraryId));
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Component name cannot be empty.", nameof(name));
        if (string.IsNullOrWhiteSpace(sourceCode))
            throw new ArgumentException("Source code cannot be empty.", nameof(sourceCode));

        Id = id;
        LibraryId = libraryId;
        Name = name.Trim();
        SourceCode = sourceCode;
        CreatedAt = createdAt;
    }
}
