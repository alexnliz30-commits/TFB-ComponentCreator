using Microsoft.AspNetCore.Mvc;
using Visualiza.Application.Components;

namespace Visualiza.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class ComponentsController : ControllerBase
{
    private readonly GenerateComponentUseCase _useCase;

    public ComponentsController(GenerateComponentUseCase useCase)
    {
        _useCase = useCase;
    }

    [HttpPost("generate")]
    [ProducesResponseType(typeof(GenerateComponentResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GenerateComponentResponse>> Generate(
        [FromBody] GenerateComponentRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _useCase.ExecuteAsync(request, cancellationToken);
        return Ok(response);
    }

    [HttpPost("refine")]
    [ProducesResponseType(typeof(RefineComponentResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RefineComponentResponse>> Refine(
        [FromBody] RefineComponentRequest request,
        [FromServices] RefineComponentUseCase refineUseCase,
        CancellationToken cancellationToken)
    {
        var response = await refineUseCase.ExecuteAsync(request, cancellationToken);
        return Ok(response);
    }

    /// <summary>
    /// Modifica un bloque del lienzo devolviendo un parche estructurado.
    /// </summary>
    /// <remarks>
    /// A diferencia de <c>refine</c>, no devuelve código: el bloque sigue siendo editable
    /// visualmente después de que la IA lo toque.
    /// </remarks>
    [HttpPost("patch-block")]
    [ProducesResponseType(typeof(PatchBlockResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PatchBlockResponse>> PatchBlock(
        [FromBody] PatchBlockRequest request,
        [FromServices] PatchBlockUseCase patchUseCase,
        CancellationToken cancellationToken)
    {
        var response = await patchUseCase.ExecuteAsync(request, cancellationToken);
        return Ok(response);
    }

    /// <summary>
    /// Asistente de la plataforma: la IA recibe el árbol de bloques completo, el bloque
    /// seleccionado y el código emitido, y responde texto y/o el árbol modificado.
    /// </summary>
    [HttpPost("assist")]
    [ProducesResponseType(typeof(AssistResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AssistResponse>> Assist(
        [FromBody] AssistRequest request,
        [FromServices] AssistUseCase assistUseCase,
        CancellationToken cancellationToken)
    {
        var response = await assistUseCase.ExecuteAsync(request, cancellationToken);
        return Ok(response);
    }

    /// <summary>
    /// Genera la hoja de estilos autocontenida del componente exportado.
    /// </summary>
    /// <remarks>
    /// Requiere Node en la máquina del backend. Sin él responde 200 con
    /// <c>generated: false</c>: el paquete sigue siendo válido, pero necesita Tailwind
    /// en el proyecto anfitrión.
    /// </remarks>
    [HttpPost("stylesheet")]
    [ProducesResponseType(typeof(CompileStylesheetResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CompileStylesheetResponse>> Stylesheet(
        [FromBody] CompileStylesheetRequest request,
        [FromServices] CompileStylesheetUseCase stylesheetUseCase,
        CancellationToken cancellationToken)
    {
        var response = await stylesheetUseCase.ExecuteAsync(request, cancellationToken);
        return Ok(response);
    }
}
