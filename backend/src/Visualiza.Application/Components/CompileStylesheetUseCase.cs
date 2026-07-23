using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Components;

/// <summary>
/// Genera la hoja de estilos autocontenida que acompaña al componente exportado.
///
/// Sin ella, el componente solo se ve correctamente en proyectos que ya tengan Tailwind
/// configurado, lo que contradice el objetivo de que sea reutilizable en cualquier web.
/// </summary>
public sealed class CompileStylesheetUseCase
{
    private readonly IStylesheetCompiler _compiler;

    public CompileStylesheetUseCase(IStylesheetCompiler compiler)
    {
        _compiler = compiler;
    }

    public async Task<CompileStylesheetResponse> ExecuteAsync(
        CompileStylesheetRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        if (string.IsNullOrWhiteSpace(request.Markup))
            throw new ArgumentException("Markup is required.", nameof(request));

        var isSass = string.Equals(request.StylesLanguage, "scss", StringComparison.OrdinalIgnoreCase);

        var result = await _compiler.CompileAsync(
            request.Markup, request.CustomStyles, isSass, cancellationToken);

        return new CompileStylesheetResponse(
            result.Css,
            Generated: !string.IsNullOrWhiteSpace(result.Css),
            result.ToolchainAvailable,
            result.Diagnostics);
    }
}
