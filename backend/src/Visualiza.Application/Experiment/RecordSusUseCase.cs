using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;
using Visualiza.Domain.Experiment;

namespace Visualiza.Application.Experiment;

public sealed record RecordSusRequest(
    Guid SessionId,
    ComponentType ComponentType,
    Condition Condition,
    IReadOnlyList<int> Items);

public sealed record RecordSusResponse(Guid Id, double Score);

public sealed class RecordSusUseCase
{
    private readonly IExperimentSessionRepository _sessions;

    public RecordSusUseCase(IExperimentSessionRepository sessions)
    {
        _sessions = sessions;
    }

    public async Task<RecordSusResponse> ExecuteAsync(RecordSusRequest request, CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        var session = await _sessions.FindAsync(request.SessionId, cancellationToken)
            ?? throw new InvalidOperationException($"Session {request.SessionId} not found.");
        if (session.CompletedAt is not null)
            throw new InvalidOperationException("Session is already completed.");

        var sus = new SusResponse(request.SessionId, request.ComponentType, request.Condition, request.Items);
        await _sessions.AddSusResponseAsync(sus, cancellationToken);
        return new RecordSusResponse(sus.Id, sus.Score);
    }
}
