namespace Visualiza.Application.Components;

/// <param name="Markup">Código del componente exportado; de él se extraen las clases usadas.</param>
/// <param name="CustomStyles">CSS o SASS propio del usuario. Opcional.</param>
/// <param name="StylesLanguage">"css" o "scss". Determina si hay que compilar antes de anexar.</param>
public sealed record CompileStylesheetRequest(
    string Markup,
    string? CustomStyles,
    string? StylesLanguage);
