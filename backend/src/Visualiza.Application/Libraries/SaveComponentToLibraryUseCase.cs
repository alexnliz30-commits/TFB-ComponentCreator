using Visualiza.Application.Abstractions;
using Visualiza.Domain.Libraries;

namespace Visualiza.Application.Libraries;

public sealed class SaveComponentToLibraryUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public SaveComponentToLibraryUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    /// <returns>null si la librería no existe.</returns>
    public async Task<SavedComponentResponse?> ExecuteAsync(
        Guid libraryId,
        SaveComponentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));

        var library = await _repository.GetLibraryAsync(libraryId, cancellationToken);
        if (library is null) return null;

        var component = new SavedComponent(library.Id, request.Name, request.SourceCode);
        await _repository.AddComponentAsync(component, cancellationToken);

        return new SavedComponentResponse(
            component.Id, component.LibraryId, component.Name, component.SourceCode, component.CreatedAt);
    }
}
