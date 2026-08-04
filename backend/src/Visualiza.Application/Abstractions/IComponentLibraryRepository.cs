using Visualiza.Domain.Libraries;

namespace Visualiza.Application.Abstractions;

public sealed record LibraryWithCount(ComponentLibrary Library, int ComponentCount);

public interface IComponentLibraryRepository
{
    Task AddLibraryAsync(ComponentLibrary library, CancellationToken cancellationToken = default);
    Task<ComponentLibrary?> GetLibraryAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<LibraryWithCount>> ListLibrariesAsync(CancellationToken cancellationToken = default);

    /// <summary>Elimina la librería y todos sus componentes.</summary>
    Task<bool> DeleteLibraryAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sustituye los estilos globales de la librería. Devuelve false si no existe.
    /// </summary>
    /// <remarks>
    /// Un argumento nulo significa «no toques ese estilo», y una cadena vacía
    /// «déjalo sin nada»: el panel guarda el tema y la hoja global por separado y
    /// guardar uno no puede borrar el otro.
    /// </remarks>
    Task<bool> UpdateLibraryStylesAsync(
        Guid id,
        string? themeJson,
        string? globalStyles,
        CancellationToken cancellationToken = default);
    Task AddComponentAsync(SavedComponent component, CancellationToken cancellationToken = default);
    Task<SavedComponent?> GetComponentAsync(Guid libraryId, Guid componentId, CancellationToken cancellationToken = default);

    /// <summary>Busca por nombre dentro de la librería (comparación exacta, sin distinguir mayúsculas).</summary>
    /// <remarks>
    /// Es lo que permite que volver a guardar un componente sea una revisión y no una
    /// copia cuando el cliente todavía no conoce su identificador: la primera vez que
    /// un proyecto local publica en una librería que ya tenía ese componente.
    /// </remarks>
    Task<SavedComponent?> FindComponentByNameAsync(Guid libraryId, string name, CancellationToken cancellationToken = default);

    Task UpdateComponentAsync(SavedComponent component, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SavedComponent>> ListComponentsAsync(Guid libraryId, CancellationToken cancellationToken = default);
    Task<bool> DeleteComponentAsync(Guid libraryId, Guid componentId, CancellationToken cancellationToken = default);
}
