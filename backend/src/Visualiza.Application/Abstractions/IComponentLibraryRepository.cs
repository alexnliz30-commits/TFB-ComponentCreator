using Visualiza.Domain.Libraries;

namespace Visualiza.Application.Abstractions;

public sealed record LibraryWithCount(ComponentLibrary Library, int ComponentCount);

public interface IComponentLibraryRepository
{
    Task AddLibraryAsync(ComponentLibrary library, CancellationToken cancellationToken = default);
    Task<ComponentLibrary?> GetLibraryAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<LibraryWithCount>> ListLibrariesAsync(CancellationToken cancellationToken = default);
    Task AddComponentAsync(SavedComponent component, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SavedComponent>> ListComponentsAsync(Guid libraryId, CancellationToken cancellationToken = default);
    Task<bool> DeleteComponentAsync(Guid libraryId, Guid componentId, CancellationToken cancellationToken = default);
}
