using Microsoft.EntityFrameworkCore;
using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;
using Visualiza.Domain.Experiment;

namespace Visualiza.Infrastructure.Persistence;

public sealed class ExperimentSessionRepository : IExperimentSessionRepository
{
    private readonly VisualizaDbContext _db;

    public ExperimentSessionRepository(VisualizaDbContext db)
    {
        _db = db;
    }

    public async Task<ExperimentSession?> FindAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var record = await _db.Sessions.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == sessionId, cancellationToken);
        return record is null
            ? null
            : ExperimentSession.Rehydrate(record.Id, record.ParticipantId, record.StartedAt, record.CompletedAt);
    }

    public async Task AddAsync(ExperimentSession session, CancellationToken cancellationToken = default)
    {
        _db.Sessions.Add(new ExperimentSessionRecord
        {
            Id = session.Id,
            ParticipantId = session.ParticipantId,
            StartedAt = session.StartedAt,
            CompletedAt = session.CompletedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(ExperimentSession session, CancellationToken cancellationToken = default)
    {
        var existing = await _db.Sessions.FirstOrDefaultAsync(x => x.Id == session.Id, cancellationToken)
            ?? throw new InvalidOperationException($"Session {session.Id} not found.");
        existing.CompletedAt = session.CompletedAt;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task AddTaskMeasurementAsync(TaskMeasurement measurement, CancellationToken cancellationToken = default)
    {
        _db.TaskMeasurements.Add(new TaskMeasurementRecord
        {
            Id = measurement.Id,
            SessionId = measurement.SessionId,
            ComponentType = measurement.ComponentType.ToString(),
            Condition = measurement.Condition.ToString(),
            DurationMs = measurement.DurationMs,
            ErrorCount = measurement.ErrorCount,
            Success = measurement.Success,
            CreatedAt = measurement.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task AddSusResponseAsync(SusResponse response, CancellationToken cancellationToken = default)
    {
        _db.SusResponses.Add(new SusResponseRecord
        {
            Id = response.Id,
            SessionId = response.SessionId,
            ComponentType = response.ComponentType.ToString(),
            Condition = response.Condition.ToString(),
            Item1 = response.Items[0],
            Item2 = response.Items[1],
            Item3 = response.Items[2],
            Item4 = response.Items[3],
            Item5 = response.Items[4],
            Item6 = response.Items[5],
            Item7 = response.Items[6],
            Item8 = response.Items[7],
            Item9 = response.Items[8],
            Item10 = response.Items[9],
            Score = response.Score,
            CreatedAt = response.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }
}
