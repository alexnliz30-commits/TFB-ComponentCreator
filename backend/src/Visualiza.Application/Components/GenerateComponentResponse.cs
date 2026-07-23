using Visualiza.Domain.Components;

namespace Visualiza.Application.Components;

public sealed record GenerateComponentResponse(
    Guid Id,
    ComponentType Type,
    string SourceCode,
    string Language,
    DateTime GeneratedAt,
    bool Compiled,
    string? Diagnostics,
    bool Verified = true);
