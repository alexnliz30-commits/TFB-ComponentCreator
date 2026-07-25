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

    public async Task<bool> DeleteLibraryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var record = await _db.Libraries.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (record is null) return false;

        // Los componentes se borran explícitamente porque el `ON DELETE CASCADE`
        // es de PostgreSQL y el proveedor InMemory de los tests no lo aplica: sin
        // esto la suite pasaría y la BD real quedaría con filas huérfanas.
        //
        // Y va en su PROPIO `SaveChanges`, antes que la librería. No hay
        // navegación entre ambas entidades —la clave ajena solo existe en la
        // base de datos—, así que EF no conoce la dependencia y puede emitir el
        // DELETE de la librería primero; PostgreSQL cascadea y borra los
        // componentes, y el DELETE de cada componente afecta entonces a 0 filas:
        // `DbUpdateConcurrencyException` y 500. Este orden explícito es lo único
        // que lo hace determinista con los dos proveedores.
        var components = await _db.SavedComponents
            .Where(x => x.LibraryId == id)
            .ToListAsync(cancellationToken);
        if (components.Count > 0)
        {
            _db.SavedComponents.RemoveRange(components);
            await _db.SaveChangesAsync(cancellationToken);
        }

        _db.Libraries.Remove(record);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task AddComponentAsync(SavedComponent component, CancellationToken cancellationToken = default)
    {
        _db.SavedComponents.Add(new SavedComponentRecord
        {
            Id = component.Id,
            LibraryId = component.LibraryId,
            Name = component.Name,
            SourceCode = component.SourceCode,
            TreeJson = component.TreeJson,
            CreatedAt = component.CreatedAt
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<SavedComponent?> GetComponentAsync(Guid libraryId, Guid componentId, CancellationToken cancellationToken = default)
    {
        var record = await _db.SavedComponents.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == componentId && x.LibraryId == libraryId, cancellationToken);
        return record is null ? null : ToDomain(record);
    }

    public async Task<SavedComponent?> FindComponentByNameAsync(Guid libraryId, string name, CancellationToken cancellationToken = default)
    {
        var trimmed = name.Trim();
        var record = await _db.SavedComponents.AsNoTracking()
            .Where(x => x.LibraryId == libraryId)
            .FirstOrDefaultAsync(x => x.Name.ToLower() == trimmed.ToLower(), cancellationToken);
        return record is null ? null : ToDomain(record);
    }

    public async Task UpdateComponentAsync(SavedComponent component, CancellationToken cancellationToken = default)
    {
        var record = await _db.SavedComponents
            .FirstOrDefaultAsync(x => x.Id == component.Id, cancellationToken);
        if (record is null) return;

        record.Name = component.Name;
        record.SourceCode = component.SourceCode;
        record.TreeJson = component.TreeJson;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<SavedComponent>> ListComponentsAsync(Guid libraryId, CancellationToken cancellationToken = default)
    {
        var records = await _db.SavedComponents.AsNoTracking()
            .Where(x => x.LibraryId == libraryId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        return records.Select(ToDomain).ToList();
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

    private static SavedComponent ToDomain(SavedComponentRecord record) => new(
        record.Id,
        record.LibraryId,
        record.Name,
        record.SourceCode,
        record.CreatedAt,
        record.TreeJson);

    private static ComponentLibrary ToDomain(ComponentLibraryRecord record) => new(
        record.Id,
        record.Name,
        Enum.Parse<TargetFramework>(record.Framework),
        Enum.Parse<CodeLanguage>(record.Language),
        record.Description,
        record.CreatedAt);
}
