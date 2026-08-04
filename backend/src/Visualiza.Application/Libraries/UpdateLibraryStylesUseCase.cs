using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Libraries;

/// <summary>
/// Guarda los estilos GLOBALES de una librería: su tema y su hoja compartida.
/// </summary>
/// <remarks>
/// Es lo que convierte a una librería en un kit. Antes de existir esto, el tema
/// vivía en el proyecto local del navegador y la librería del servidor no sabía
/// nada de él: abrirla desde otro equipo la pintaba con el tema por defecto, de
/// modo que los «estilos globales de la librería» no eran realmente de la
/// librería. Aquí viajan con ella.
/// </remarks>
public sealed class UpdateLibraryStylesUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public UpdateLibraryStylesUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    /// <returns>La librería ya actualizada, o null si no existe.</returns>
    public async Task<LibraryResponse?> ExecuteAsync(
        Guid libraryId,
        UpdateLibraryStylesRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));

        var updated = await _repository.UpdateLibraryStylesAsync(
            libraryId, request.ThemeJson, request.GlobalStyles, cancellationToken);
        if (!updated) return null;

        // Se relee en vez de devolver lo enviado: el cliente tiene que quedarse
        // con lo que de verdad se guardó, no con lo que creía estar guardando.
        // Con campos opcionales por separado esas dos cosas difieren siempre que
        // se envía solo uno de los dos.
        var library = await _repository.GetLibraryAsync(libraryId, cancellationToken);
        if (library is null) return null;

        var components = await _repository.ListComponentsAsync(libraryId, cancellationToken);
        return new LibraryResponse(
            library.Id, library.Name, library.Description,
            library.Framework, library.Language, library.CreatedAt, components.Count,
            library.ThemeJson, library.GlobalStyles);
    }
}
