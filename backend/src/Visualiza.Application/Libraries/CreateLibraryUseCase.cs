using Visualiza.Application.Abstractions;
using Visualiza.Domain.Libraries;

namespace Visualiza.Application.Libraries;

public sealed class CreateLibraryUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public CreateLibraryUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    public async Task<LibraryResponse> ExecuteAsync(CreateLibraryRequest request, CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));

        var library = new ComponentLibrary(request.Name, request.Framework, request.Language, request.Description);
        await _repository.AddLibraryAsync(library, cancellationToken);

        return new LibraryResponse(
            library.Id, library.Name, library.Description,
            library.Framework, library.Language, library.CreatedAt, 0);
    }
}
