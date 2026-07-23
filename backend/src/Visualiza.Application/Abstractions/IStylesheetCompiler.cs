namespace Visualiza.Application.Abstractions;

/// <summary>
/// Genera la hoja de estilos autocontenida de un componente exportado.
///
/// El marcado que produce el constructor usa clases de utilidad de Tailwind, que solo
/// existen si el proyecto anfitrión tiene Tailwind configurado. Para que el componente
/// sea reutilizable en cualquier web se compila aquí una hoja con exactamente las
/// utilidades empleadas, más el SASS o CSS propio que haya escrito el usuario.
/// </summary>
public interface IStylesheetCompiler
{
    /// <param name="markup">Código del componente, del que se extraen las clases usadas.</param>
    /// <param name="customStyles">CSS o SASS propio del usuario; puede ir vacío.</param>
    /// <param name="stylesAreSass">Cierto si <paramref name="customStyles"/> es SASS y hay que compilarlo.</param>
    Task<StylesheetResult> CompileAsync(
        string markup,
        string? customStyles,
        bool stylesAreSass,
        CancellationToken cancellationToken = default);
}

/// <param name="Css">Hoja resultante, o <c>null</c> si no pudo generarse.</param>
/// <param name="Diagnostics">Detalle del fallo o de la degradación.</param>
/// <param name="ToolchainAvailable">
/// Falso cuando no hay Node en el entorno y por tanto no se pudo ejecutar Tailwind.
/// Misma semántica que <see cref="TsxCompilationResult.ToolchainAvailable"/>: distingue
/// «no generado» de «generado vacío». Sin esta distinción, el paquete se entregaría con
/// una hoja vacía aparentando que el componente no necesita estilos.
/// </param>
public sealed record StylesheetResult(string? Css, string? Diagnostics, bool ToolchainAvailable = true)
{
    public static StylesheetResult ToolchainMissing(string detail) =>
        new(null, detail, ToolchainAvailable: false);

    public static StylesheetResult Failed(string detail) => new(null, detail);
}
