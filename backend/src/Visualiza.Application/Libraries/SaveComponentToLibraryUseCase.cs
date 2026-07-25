using Visualiza.Application.Abstractions;
using Visualiza.Domain.Libraries;

namespace Visualiza.Application.Libraries;

/// <summary>
/// Guarda un componente en una librería, insertando o revisando el existente.
/// </summary>
/// <remarks>
/// Es un upsert y no un alta porque guardar desde el constructor ocurre muchas veces
/// sobre el MISMO componente: con un alta pura, la librería se llenaba de copias con
/// el mismo nombre, que es justo lo que impide leerla como catálogo. La identidad se
/// resuelve por <c>ComponentId</c> cuando el cliente ya la conoce y, si no, por nombre
/// dentro de la librería —el caso de un proyecto local que publica por primera vez en
/// una librería que ya tenía ese componente.
/// </remarks>
public sealed class SaveComponentToLibraryUseCase
{
    private readonly IComponentLibraryRepository _repository;

    public SaveComponentToLibraryUseCase(IComponentLibraryRepository repository)
    {
        _repository = repository;
    }

    /// <returns>null si la librería no existe.</returns>
    public async Task<SaveComponentResult?> ExecuteAsync(
        Guid libraryId,
        SaveComponentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));

        var library = await _repository.GetLibraryAsync(libraryId, cancellationToken);
        if (library is null) return null;

        var existing = request.ComponentId is { } id
            ? await _repository.GetComponentAsync(library.Id, id, cancellationToken)
            : await _repository.FindComponentByNameAsync(library.Id, request.Name, cancellationToken);

        if (existing is null)
        {
            var created = new SavedComponent(library.Id, request.Name, request.SourceCode, request.TreeJson);
            await _repository.AddComponentAsync(created, cancellationToken);
            return new SaveComponentResult(ToResponse(created), Created: true);
        }

        var revised = existing.WithContent(request.Name, request.SourceCode, request.TreeJson);
        await _repository.UpdateComponentAsync(revised, cancellationToken);
        return new SaveComponentResult(ToResponse(revised), Created: false);
    }

    internal static SavedComponentResponse ToResponse(SavedComponent component) => new(
        component.Id,
        component.LibraryId,
        component.Name,
        component.SourceCode,
        component.CreatedAt,
        component.TreeJson,
        Editable: component.TreeJson is not null);
}
