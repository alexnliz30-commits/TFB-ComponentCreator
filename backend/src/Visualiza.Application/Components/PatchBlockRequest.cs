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
/// <param name="ModelJson">
/// Contrato de datos del componente: el elemento que recibe y sus campos tipados.
/// Con él, el asistente puede escribir reglas de negocio —«píntalo en rojo si el stock
/// está a cero»— en vez de tener que adivinar qué datos existen. Opcional, porque la
/// mayoría de los componentes no reciben ninguno.
/// </param>
/// <param name="CallbacksJson">
/// Props de función declaradas en el lienzo. Misma regla que las variables: el modelo
/// puede llamarlas, no inventarlas.
/// </param>
public sealed record PatchBlockRequest(
    string BlockType,
    string CurrentPropsJson,
    string StateVarsJson,
    string Instruction,
    string? ModelJson = null,
    string? CallbacksJson = null);
