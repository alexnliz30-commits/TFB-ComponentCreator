using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Libraries;

public sealed class ListLibrariesUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public ListLibrariesUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    public async Task<IReadOnlyList<LibraryResponse>> ExecuteAsync(CancellationToken cancellationToken = default)
    {
        // El listado NO devuelve los estilos globales a propósito: son la parte
        // pesada de una librería y ahí solo se pintan tarjetas con su nombre y su
        // recuento. Se cargan al abrir una, en `GetLibraryUseCase`.
        var libraries = await _repository.ListLibrariesAsync(cancellationToken);
        return libraries
            .Select(x => new LibraryResponse(
                x.Library.Id, x.Library.Name, x.Library.Description,
                x.Library.Framework, x.Library.Language, x.Library.CreatedAt, x.ComponentCount))
            .ToList();
    }
}
