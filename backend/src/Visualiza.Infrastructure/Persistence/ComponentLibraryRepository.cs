using Microsoft.EntityFrameworkCore;
using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;
using Visualiza.Domain.Libraries;

namespace Visualiza.Infrastructure.Persistence;

public sealed class ComponentLibraryRepository : IComponentLibraryRepository
{
    private readonly VisualizaDbContext _db;

    public ComponentLibraryRepository(VisualizaDbContext db)
    {
        _db = db;
    }

    public async Task AddLibraryAsync(ComponentLibrary library, CancellationToken cancellationToken = default)
    {
        _db.Libraries.Add(new ComponentLibraryRecord
        {
            Id = library.Id,
            Name = library.Name,
            Description = library.Description,
            Framework = library.Framework.ToString(),
            Language = library.Language.ToString(),
            CreatedAt = library.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ComponentLibrary?> GetLibraryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var record = await _db.Libraries.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return record is null ? null : ToDomain(record);
    }

    public async Task<IReadOnlyList<LibraryWithCount>> ListLibrariesAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _db.Libraries.AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .Select(lib => new
            {
                Library = lib,
                Count = _db.SavedComponents.Count(c => c.LibraryId == lib.Id)
            })
            .ToListAsync(cancellationToken);

        return rows.Select(x => new LibraryWithCount(ToDomain(x.Library), x.Count)).ToList();
    }

    public async Task AddComponentAsync(SavedComponent component, CancellationToken cancellationToken = default)
    {
        _db.SavedComponents.Add(new SavedComponentRecord
        {
            Id = component.Id,
            LibraryId = component.LibraryId,
            Name = component.Name,
            SourceCode = component.SourceCode,
            CreatedAt = component.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<SavedComponent>> ListComponentsAsync(Guid libraryId, CancellationToken cancellationToken = default)
    {
        var records = await _db.SavedComponents.AsNoTracking()
            .Where(x => x.LibraryId == libraryId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        return records
            .Select(r => new SavedComponent(r.Id, r.LibraryId, r.Name, r.SourceCode, r.CreatedAt))
            .ToList();
    }

    public async Task<bool> DeleteComponentAsync(Guid libraryId, Guid componentId, CancellationToken cancellationToken = default)
    {
        var record = await _db.SavedComponents
            .FirstOrDefaultAsync(x => x.Id == componentId && x.LibraryId == libraryId, cancellationToken);
        if (record is null) return false;

        _db.SavedComponents.Remove(record);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static ComponentLibrary ToDomain(ComponentLibraryRecord record) => new(
        record.Id,
        record.Name,
        Enum.Parse<TargetFramework>(record.Framework),
        Enum.Parse<CodeLanguage>(record.Language),
        record.Description,
        record.CreatedAt);
}
