using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Libraries;

public sealed class DeleteSavedComponentUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public DeleteSavedComponentUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    /// <returns>false si la librería o el componente no existen.</returns>
    public Task<bool> ExecuteAsync(Guid libraryId, Guid componentId, CancellationToken cancellationToken = default)
        => _repository.DeleteComponentAsync(libraryId, componentId, cancellationToken);
}
