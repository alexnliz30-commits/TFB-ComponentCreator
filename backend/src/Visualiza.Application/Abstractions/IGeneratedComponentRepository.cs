using Visualiza.Domain.Components;

namespace Visualiza.Application.Abstractions;

public interface IGeneratedComponentRepository
{
    Task SaveAsync(UiComponent component, string prompt, bool compiled, string? diagnostics, CancellationToken cancellationToken = default);
    Task<int> CountAsync(CancellationToken cancellationToken = default);
}
