namespace Visualiza.Domain.Libraries;

public sealed class SavedComponent
{
    public Guid Id { get; }
    public Guid LibraryId { get; }
    public string Name { get; }
    public string SourceCode { get; }

    /// <summary>
    /// Árbol de bloques del constructor que produjo este componente, serializado.
    /// </summary>
    /// <remarks>
    /// El <see cref="SourceCode"/> es el artefacto de salida y la transformación no
    /// tiene vuelta: del TSX emitido no se puede reconstruir el árbol. Sin guardarlo,
    /// un componente de la librería solo se podía ver y descargar, nunca reabrir para
    /// seguir editándolo visualmente. Es nulo en los componentes generados
    /// directamente como código y en todos los anteriores a este campo: esos se
    /// siguen viendo y descargando, pero no se pueden editar en el constructor.
    /// </remarks>
    public string? TreeJson { get; }

    public DateTime CreatedAt { get; }

    public SavedComponent(Guid libraryId, string name, string sourceCode, string? treeJson = null)
        : this(Guid.NewGuid(), libraryId, name, sourceCode, DateTime.UtcNow, treeJson)
    {
    }

    public SavedComponent(
        Guid id,
        Guid libraryId,
        string name,
        string sourceCode,
        DateTime createdAt,
        string? treeJson = null)
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
        TreeJson = string.IsNullOrWhiteSpace(treeJson) ? null : treeJson;
        CreatedAt = createdAt;
    }

    /// <summary>
    /// Devuelve el componente con contenido nuevo, conservando identidad y fecha.
    /// </summary>
    /// <remarks>
    /// Volver a guardar desde el constructor es una revisión del MISMO componente,
    /// no uno distinto. Antes cada guardado insertaba una fila nueva y la librería se
    /// llenaba de copias con el mismo nombre, lo que hacía inservible verla como
    /// catálogo.
    /// </remarks>
    public SavedComponent WithContent(string name, string sourceCode, string? treeJson)
        => new(Id, LibraryId, name, sourceCode, CreatedAt, treeJson);
}
