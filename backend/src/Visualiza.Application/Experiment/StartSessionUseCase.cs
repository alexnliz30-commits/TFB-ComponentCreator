using Visualiza.Application.Abstractions;
using Visualiza.Domain.Experiment;

namespace Visualiza.Application.Experiment;

public sealed record StartSessionRequest(string ParticipantCode);
public sealed record StartSessionResponse(Guid SessionId, Guid ParticipantId, string Token);

public sealed class StartSessionUseCase
{
    private readonly IParticipantRepository _participants;
    private readonly IExperimentSessionRepository _sessions;
    private readonly IJwtTokenService _tokens;

    public StartSessionUseCase(
        IParticipantRepository participants,
        IExperimentSessionRepository sessions,
        IJwtTokenService tokens)
    {
        _participants = participants;
        _sessions = sessions;
        _tokens = tokens;
    }

    public async Task<StartSessionResponse> ExecuteAsync(StartSessionRequest request, CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        if (string.IsNullOrWhiteSpace(request.ParticipantCode))
            throw new ArgumentException("Participant code is required.", nameof(request));

        var code = request.ParticipantCode.Trim().ToUpperInvariant();
        var participant = await _participants.FindByCodeAsync(code, cancellationToken);
        if (participant is null)
        {
            participant = new Participant(code);
            await _participants.AddAsync(participant, cancellationToken);
        }

        var session = new ExperimentSession(participant.Id);
        await _sessions.AddAsync(session, cancellationToken);

        var token = _tokens.Issue(participant, session);
        return new StartSessionResponse(session.Id, participant.Id, token);
    }
}
