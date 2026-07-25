using Microsoft.AspNetCore.Mvc;
using Visualiza.Application.Libraries;

namespace Visualiza.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class LibrariesController : ControllerBase
{
    private readonly CreateLibraryUseCase _createLibrary;
    private readonly ListLibrariesUseCase _listLibraries;
    private readonly GetLibraryUseCase _getLibrary;
    private readonly SaveComponentToLibraryUseCase _saveComponent;
    private readonly DeleteSavedComponentUseCase _deleteComponent;
    private readonly DeleteLibraryUseCase _deleteLibrary;

    public LibrariesController(
        CreateLibraryUseCase createLibrary,
        ListLibrariesUseCase listLibraries,
        GetLibraryUseCase getLibrary,
        SaveComponentToLibraryUseCase saveComponent,
        DeleteSavedComponentUseCase deleteComponent,
        DeleteLibraryUseCase deleteLibrary)
    {
        _createLibrary = createLibrary;
        _listLibraries = listLibraries;
        _getLibrary = getLibrary;
        _saveComponent = saveComponent;
        _deleteComponent = deleteComponent;
        _deleteLibrary = deleteLibrary;
    }

    [HttpPost]
    [ProducesResponseType(typeof(LibraryResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<LibraryResponse>> Create(
        [FromBody] CreateLibraryRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _createLibrary.ExecuteAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = response.Id }, response);
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<LibraryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LibraryResponse>>> List(CancellationToken cancellationToken)
        => Ok(await _listLibraries.ExecuteAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(LibraryDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LibraryDetailResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var response = await _getLibrary.ExecuteAsync(id, cancellationToken);
        return response is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, title: "Library not found")
            : Ok(response);
    }

    /// <summary>
    /// Guarda un componente en la librería: lo crea o revisa el que ya existe.
    /// </summary>
    /// <remarks>
    /// Responde 201 al crear y 200 al revisar. Es un upsert porque guardar desde el
    /// constructor ocurre repetidamente sobre el mismo componente; dando siempre de
    /// alta, la librería acumulaba copias homónimas.
    /// </remarks>
    [HttpPost("{id:guid}/components")]
    [ProducesResponseType(typeof(SavedComponentResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(SavedComponentResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SavedComponentResponse>> SaveComponent(
        Guid id,
        [FromBody] SaveComponentRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _saveComponent.ExecuteAsync(id, request, cancellationToken);
        if (result is null)
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Library not found");

        return result.Created
            ? CreatedAtAction(nameof(Get), new { id }, result.Component)
            : Ok(result.Component);
    }

    /// <summary>Elimina la librería y todos sus componentes.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await _deleteLibrary.ExecuteAsync(id, cancellationToken);
        return deleted
            ? NoContent()
            : Problem(statusCode: StatusCodes.Status404NotFound, title: "Library not found");
    }

    [HttpDelete("{id:guid}/components/{componentId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteComponent(Guid id, Guid componentId, CancellationToken cancellationToken)
    {
        var deleted = await _deleteComponent.ExecuteAsync(id, componentId, cancellationToken);
        return deleted
            ? NoContent()
            : Problem(statusCode: StatusCodes.Status404NotFound, title: "Component not found");
    }
}
