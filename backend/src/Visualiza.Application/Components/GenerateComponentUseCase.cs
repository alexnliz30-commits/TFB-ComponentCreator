using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;

namespace Visualiza.Application.Components;

public sealed class GenerateComponentUseCase
{
    private readonly IComponentGenerator _generator;
    private readonly ITsxCompilationChecker _checker;
    private readonly IGeneratedComponentRepository _repository;

    public GenerateComponentUseCase(
        IComponentGenerator generator,
        ITsxCompilationChecker checker,
        IGeneratedComponentRepository repository)
    {
        _generator = generator;
        _checker = checker;
        _repository = repository;
    }

    public async Task<GenerateComponentResponse> ExecuteAsync(
        GenerateComponentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        if (string.IsNullOrWhiteSpace(request.Prompt))
            throw new ArgumentException("Prompt is required.", nameof(request));

        var component = await _generator.GenerateAsync(
            request.Type, request.Prompt, request.Framework, request.Language, cancellationToken);

        // El harness tsc solo valida TSX; para el resto de tecnologías la generación
        // se entrega sin verificación estática. El propio harness puede además
        // declararse no disponible si el entorno no trae Node.
        var isTsx = request.Framework == TargetFramework.React && request.Language == CodeLanguage.TypeScript;
        var check = isTsx
            ? await _checker.CheckAsync(component.SourceCode, cancellationToken)
            : TsxCompilationResult.NotApplicable;

        var verified = isTsx && check.ToolchainAvailable;

        await _repository.SaveAsync(component, request.Prompt, verified && check.Success, check.Diagnostics, cancellationToken);

        return new GenerateComponentResponse(
            component.Id,
            component.Type,
            component.SourceCode,
            component.Language,
            component.GeneratedAt,
            verified && check.Success,
            check.Diagnostics,
            Verified: verified);
    }
}
