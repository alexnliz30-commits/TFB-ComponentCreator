using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Libraries;

/// <summary>
/// Elimina una librería con todos sus componentes.
/// </summary>
public sealed class DeleteLibraryUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public DeleteLibraryUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    /// <returns>false si la librería no existe.</returns>
    public Task<bool> ExecuteAsync(Guid libraryId, CancellationToken cancellationToken = default)
        => _repository.DeleteLibraryAsync(libraryId, cancellationToken);
}
