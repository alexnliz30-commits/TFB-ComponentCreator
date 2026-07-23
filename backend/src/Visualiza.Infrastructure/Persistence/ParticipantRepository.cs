using Microsoft.EntityFrameworkCore;
using Visualiza.Application.Abstractions;
using Visualiza.Domain.Experiment;

namespace Visualiza.Infrastructure.Persistence;

public sealed class ParticipantRepository : IParticipantRepository
{
    private readonly VisualizaDbContext _db;

    public ParticipantRepository(VisualizaDbContext db)
    {
        _db = db;
    }

    public async Task<Participant?> FindByCodeAsync(string code, CancellationToken cancellationToken = default)
    {
        var record = await _db.Participants.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Code == code, cancellationToken);
        return record is null ? null : Participant.Rehydrate(record.Id, record.Code, record.CreatedAt);
    }

    public async Task AddAsync(Participant participant, CancellationToken cancellationToken = default)
    {
        _db.Participants.Add(new ParticipantRecord
        {
            Id = participant.Id,
            Code = participant.Code,
            CreatedAt = participant.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }
}
