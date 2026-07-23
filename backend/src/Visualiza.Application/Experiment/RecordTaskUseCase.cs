using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;
using Visualiza.Domain.Experiment;

namespace Visualiza.Application.Experiment;

public sealed record RecordTaskRequest(
    Guid SessionId,
    ComponentType ComponentType,
    Condition Condition,
    int DurationMs,
    int ErrorCount,
    bool Success);

public sealed class RecordTaskUseCase
{
    private readonly IExperimentSessionRepository _sessions;

    public RecordTaskUseCase(IExperimentSessionRepository sessions)
    {
        _sessions = sessions;
    }

    public async Task<Guid> ExecuteAsync(RecordTaskRequest request, CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        var session = await _sessions.FindAsync(request.SessionId, cancellationToken)
            ?? throw new InvalidOperationException($"Session {request.SessionId} not found.");
        if (session.CompletedAt is not null)
            throw new InvalidOperationException("Session is already completed.");

        var measurement = new TaskMeasurement(
            request.SessionId,
            request.ComponentType,
            request.Condition,
            request.DurationMs,
            request.ErrorCount,
            request.Success);

        await _sessions.AddTaskMeasurementAsync(measurement, cancellationToken);
        return measurement.Id;
    }
}
