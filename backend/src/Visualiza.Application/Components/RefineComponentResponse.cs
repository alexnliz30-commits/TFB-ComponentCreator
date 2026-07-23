namespace Visualiza.Application.Components;

public sealed record RefineComponentResponse(
    string SourceCode,
    bool Compiled,
    string? Diagnostics,
    bool Verified = true);
