using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Visualiza.Application.Experiment;

namespace Visualiza.Api.Controllers;

[ApiController]
[Route("api/sessions")]
public sealed class SessionsController : ControllerBase
{
    // El token emitido en /start pertenece a una única sesión (claim "sid");
    // sin esta comprobación cualquier participante podría escribir en sesiones ajenas.
    private bool TokenMatchesSession(Guid sessionId)
        => Guid.TryParse(User.FindFirst("sid")?.Value, out var sid) && sid == sessionId;

    [HttpPost("start")]
    [AllowAnonymous]
    public async Task<ActionResult<StartSessionResponse>> Start(
        [FromBody] StartSessionRequest request,
        [FromServices] StartSessionUseCase useCase,
        CancellationToken cancellationToken)
    {
        var response = await useCase.ExecuteAsync(request, cancellationToken);
        return Ok(response);
    }

    [HttpPost("{sessionId:guid}/tasks")]
    [Authorize]
    public async Task<IActionResult> RecordTask(
        Guid sessionId,
        [FromBody] RecordTaskInput input,
        [FromServices] RecordTaskUseCase useCase,
        CancellationToken cancellationToken)
    {
        if (!TokenMatchesSession(sessionId)) return Forbid();
        var measurementId = await useCase.ExecuteAsync(
            new RecordTaskRequest(sessionId, input.ComponentType, input.Condition, input.DurationMs, input.ErrorCount, input.Success),
            cancellationToken);
        return CreatedAtAction(null, new { id = measurementId });
    }

    [HttpPost("{sessionId:guid}/sus")]
    [Authorize]
    public async Task<ActionResult<RecordSusResponse>> RecordSus(
        Guid sessionId,
        [FromBody] RecordSusInput input,
        [FromServices] RecordSusUseCase useCase,
        CancellationToken cancellationToken)
    {
        if (!TokenMatchesSession(sessionId)) return Forbid();
        var response = await useCase.ExecuteAsync(
            new RecordSusRequest(sessionId, input.ComponentType, input.Condition, input.Items),
            cancellationToken);
        return Ok(response);
    }

    [HttpPost("{sessionId:guid}/complete")]
    [Authorize]
    public async Task<IActionResult> Complete(
        Guid sessionId,
        [FromServices] CompleteSessionUseCase useCase,
        CancellationToken cancellationToken)
    {
        if (!TokenMatchesSession(sessionId)) return Forbid();
        await useCase.ExecuteAsync(sessionId, cancellationToken);
        return NoContent();
    }
}

public sealed record RecordTaskInput(
    Visualiza.Domain.Components.ComponentType ComponentType,
    Visualiza.Domain.Experiment.Condition Condition,
    int DurationMs,
    int ErrorCount,
    bool Success);

public sealed record RecordSusInput(
    Visualiza.Domain.Components.ComponentType ComponentType,
    Visualiza.Domain.Experiment.Condition Condition,
    IReadOnlyList<int> Items);
