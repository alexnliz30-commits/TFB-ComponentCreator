using Microsoft.EntityFrameworkCore;
using Visualiza.Application.Abstractions;
using Visualiza.Domain.Projects;

namespace Visualiza.Infrastructure.Persistence;

public sealed class DesignerProjectRepository : IDesignerProjectRepository
{
    private readonly VisualizaDbContext _db;

    public DesignerProjectRepository(VisualizaDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(DesignerProject project, CancellationToken cancellationToken = default)
    {
        _db.DesignerProjects.Add(new DesignerProjectRecord
        {
            Id = project.Id,
            Name = project.Name,
            CodeHash = project.CodeHash,
            CreatedAt = project.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<DesignerProject?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var record = await _db.DesignerProjects.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return record is null
            ? null
            : new DesignerProject(record.Id, record.Name, record.CodeHash, record.CreatedAt);
    }

    public async Task<bool> ReplaceCodeHashAsync(Guid id, string codeHash, CancellationToken cancellationToken = default)
    {
        var record = await _db.DesignerProjects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (record is null) return false;

        record.CodeHash = codeHash;
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var record = await _db.DesignerProjects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (record is null) return false;

        _db.DesignerProjects.Remove(record);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
