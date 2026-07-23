using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Experiment;

public sealed class CompleteSessionUseCase
{
    private readonly IExperimentSessionRepository _sessions;

    public CompleteSessionUseCase(IExperimentSessionRepository sessions)
    {
        _sessions = sessions;
    }

    public async Task ExecuteAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await _sessions.FindAsync(sessionId, cancellationToken)
            ?? throw new InvalidOperationException($"Session {sessionId} not found.");
        session.Complete();
        await _sessions.UpdateAsync(session, cancellationToken);
    }
}
