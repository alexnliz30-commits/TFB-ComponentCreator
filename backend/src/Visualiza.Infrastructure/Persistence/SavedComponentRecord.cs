namespace Visualiza.Infrastructure.Persistence;

public sealed class SavedComponentRecord
{
    public Guid Id { get; set; }
    public Guid LibraryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SourceCode { get; set; } = string.Empty;

    /// <summary>
    /// Árbol de bloques serializado; nulo en los componentes generados como código
    /// y en los guardados antes de que existiera la columna.
    /// </summary>
    public string? TreeJson { get; set; }

    public DateTime CreatedAt { get; set; }
}
