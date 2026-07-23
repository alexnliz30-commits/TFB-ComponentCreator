using Visualiza.Domain.Components;

namespace Visualiza.Application.Libraries;

public sealed record CreateLibraryRequest(
    string Name,
    TargetFramework Framework,
    CodeLanguage Language,
    string? Description = null);

public sealed record LibraryResponse(
    Guid Id,
    string Name,
    string Description,
    TargetFramework Framework,
    CodeLanguage Language,
    DateTime CreatedAt,
    int ComponentCount);

public sealed record SaveComponentRequest(string Name, string SourceCode);

public sealed record SavedComponentResponse(
    Guid Id,
    Guid LibraryId,
    string Name,
    string SourceCode,
    DateTime CreatedAt);

public sealed record LibraryDetailResponse(
    LibraryResponse Library,
    IReadOnlyList<SavedComponentResponse> Components);
