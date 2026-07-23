namespace Visualiza.Application.Abstractions;

public interface ITsxCompilationChecker
{
    Task<TsxCompilationResult> CheckAsync(string sourceCode, CancellationToken cancellationToken = default);
}

/// <param name="Success">Cierto si tsc terminó con código 0.</param>
/// <param name="Diagnostics">Salida de tsc cuando la compilación falla.</param>
/// <param name="ToolchainAvailable">
/// Falso cuando el harness no ha podido ejecutarse (no hay Node/npx en el entorno).
/// Distingue «no verificado» de «verificación fallida»: sin esta distinción, un
/// entorno sin Node haría que el KR1 midiera 0 % de compilación en vez de reflejar
/// la ausencia de medición.
/// </param>
public sealed record TsxCompilationResult(bool Success, string? Diagnostics, bool ToolchainAvailable = true)
{
    /// <summary>Resultado para tecnologías que el harness tsc no puede validar (Vue, Angular).</summary>
    public static TsxCompilationResult NotApplicable { get; } = new(false, null, ToolchainAvailable: false);

    /// <summary>Resultado cuando no hay Node/npx disponible para ejecutar tsc.</summary>
    public static TsxCompilationResult ToolchainMissing(string detail) =>
        new(false, detail, ToolchainAvailable: false);
}
