using Visualiza.Domain.Experiment;

namespace Visualiza.Application.Abstractions;

public interface IJwtTokenService
{
    string Issue(Participant participant, ExperimentSession session);
}
