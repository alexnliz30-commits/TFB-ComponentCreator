using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Components;

public sealed class RefineComponentUseCase
{
    private readonly IComponentGenerator _generator;
    private readonly ITsxCompilationChecker _checker;

    public RefineComponentUseCase(IComponentGenerator generator, ITsxCompilationChecker checker)
    {
        _generator = generator;
        _checker = checker;
    }

    public async Task<RefineComponentResponse> ExecuteAsync(
        RefineComponentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        if (string.IsNullOrWhiteSpace(request.SourceCode))
            throw new ArgumentException("SourceCode is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Instruction))
            throw new ArgumentException("Instruction is required.", nameof(request));

        var refined = await _generator.RefineAsync(request.SourceCode, request.Instruction, cancellationToken);
        var check = await _checker.CheckAsync(refined, cancellationToken);

        return new RefineComponentResponse(
            refined,
            check.ToolchainAvailable && check.Success,
            check.Diagnostics,
            Verified: check.ToolchainAvailable);
    }
}
