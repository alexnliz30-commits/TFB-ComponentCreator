namespace Visualiza.Application.Components;

/// <summary>
/// Petición de modificación asistida de un bloque concreto del lienzo.
/// </summary>
/// <param name="BlockType">Tipo del bloque en la paleta (p. ej. <c>button</c>).</param>
/// <param name="CurrentPropsJson">Propiedades actuales del bloque, como objeto JSON de cadenas.</param>
/// <param name="StateVarsJson">
/// Variables de estado declaradas en el lienzo. El modelo solo puede referirse a estas:
/// inventar una variable dejaría el árbol apuntando a algo inexistente.
/// </param>
/// <param name="Instruction">Lo que el usuario quiere cambiar, en lenguaje natural.</param>
public sealed record PatchBlockRequest(
    string BlockType,
    string CurrentPropsJson,
    string StateVarsJson,
    string Instruction);
