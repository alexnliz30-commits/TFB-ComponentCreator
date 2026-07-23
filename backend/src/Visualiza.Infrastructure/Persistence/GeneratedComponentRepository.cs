using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;

namespace Visualiza.Infrastructure.Persistence;

public sealed class GeneratedComponentRepository : IGeneratedComponentRepository
{
    private readonly VisualizaDbContext _db;

    public GeneratedComponentRepository(VisualizaDbContext db)
    {
        _db = db;
    }

    public async Task SaveAsync(UiComponent component, string prompt, bool compiled, string? diagnostics, CancellationToken cancellationToken = default)
    {
        _db.GeneratedComponents.Add(new GeneratedComponentRecord
        {
            Id = component.Id,
            Type = component.Type.ToString(),
            Prompt = prompt,
            SourceCode = component.SourceCode,
            Language = component.Language,
            GeneratedAt = component.GeneratedAt,
            Compiled = compiled,
            Diagnostics = diagnostics
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public Task<int> CountAsync(CancellationToken cancellationToken = default)
        => Task.FromResult(_db.GeneratedComponents.Count());
}
