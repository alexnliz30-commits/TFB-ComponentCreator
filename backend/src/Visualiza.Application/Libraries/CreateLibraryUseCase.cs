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
        // Una librería puede nacer ya con su identidad visual: la semilla del
        // catálogo de ejemplo la trae, y así no hay un instante en que exista sin
        // tema y sus componentes se pinten con el genérico.
        library.SetGlobalStyles(request.ThemeJson, request.GlobalStyles);
        await _repository.AddLibraryAsync(library, cancellationToken);

        return new LibraryResponse(
            library.Id, library.Name, library.Description,
            library.Framework, library.Language, library.CreatedAt, 0,
            library.ThemeJson, library.GlobalStyles);
    }
}
