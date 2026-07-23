namespace Visualiza.Application.Components;

/// <param name="Css">Hoja autocontenida, o <c>null</c> si no pudo generarse.</param>
/// <param name="Generated">
/// Cierto solo si hay hoja utilizable. Cuando es falso el paquete sigue siendo válido,
/// pero depende de que el proyecto anfitrión tenga Tailwind configurado.
/// </param>
/// <param name="ToolchainAvailable">
/// Falso cuando el entorno no tiene Node y Tailwind no pudo ejecutarse. Igual que el
/// campo <c>Verified</c> de la generación, distingue «no se pudo generar» de «falló».
/// </param>
/// <param name="Diagnostics">Detalle del fallo o de la degradación.</param>
public sealed record CompileStylesheetResponse(
    string? Css,
    bool Generated,
    bool ToolchainAvailable,
    string? Diagnostics);
