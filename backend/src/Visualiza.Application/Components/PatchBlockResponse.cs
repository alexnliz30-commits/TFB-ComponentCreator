namespace Visualiza.Application.Components;

/// <summary>
/// Parche estructurado a aplicar sobre un bloque del lienzo.
/// </summary>
/// <param name="PatchJson">
/// Objeto JSON ya saneado, con solo las claves permitidas (<c>props</c>, <c>events</c>,
/// <c>visibleIf</c>). Devuelve <c>{}</c> cuando no hay nada aplicable.
/// </param>
/// <param name="Applied">
/// <c>false</c> cuando el modelo no devolvió un parche utilizable. El bloque queda intacto:
/// se prefiere no tocar nada antes que aplicar algo que el usuario no pidió.
/// </param>
/// <param name="Diagnostics">Motivo del descarte, para poder mostrarlo en el chat.</param>
public sealed record PatchBlockResponse(string PatchJson, bool Applied, string? Diagnostics);
