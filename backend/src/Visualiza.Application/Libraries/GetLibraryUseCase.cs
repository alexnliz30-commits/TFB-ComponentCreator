using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Libraries;

public sealed class GetLibraryUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public GetLibraryUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    public async Task<LibraryDetailResponse?> ExecuteAsync(Guid libraryId, CancellationToken cancellationToken = default)
    {
        var library = await _repository.GetLibraryAsync(libraryId, cancellationToken);
        if (library is null) return null;

        var components = await _repository.ListComponentsAsync(libraryId, cancellationToken);
        return new LibraryDetailResponse(
            new LibraryResponse(
                library.Id, library.Name, library.Description,
                library.Framework, library.Language, library.CreatedAt, components.Count),
            components.Select(SaveComponentToLibraryUseCase.ToResponse).ToList());
    }
}
