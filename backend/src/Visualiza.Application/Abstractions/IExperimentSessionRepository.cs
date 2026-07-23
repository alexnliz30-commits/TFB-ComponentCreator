using Visualiza.Domain.Experiment;

namespace Visualiza.Application.Abstractions;

public interface IExperimentSessionRepository
{
    Task<ExperimentSession?> FindAsync(Guid sessionId, CancellationToken cancellationToken = default);
    Task AddAsync(ExperimentSession session, CancellationToken cancellationToken = default);
    Task UpdateAsync(ExperimentSession session, CancellationToken cancellationToken = default);
    Task AddTaskMeasurementAsync(TaskMeasurement measurement, CancellationToken cancellationToken = default);
    Task AddSusResponseAsync(SusResponse response, CancellationToken cancellationToken = default);
}
