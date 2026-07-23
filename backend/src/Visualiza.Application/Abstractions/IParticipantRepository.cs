using Visualiza.Domain.Experiment;

namespace Visualiza.Application.Abstractions;

public interface IParticipantRepository
{
    Task<Participant?> FindByCodeAsync(string code, CancellationToken cancellationToken = default);
    Task AddAsync(Participant participant, CancellationToken cancellationToken = default);
}
