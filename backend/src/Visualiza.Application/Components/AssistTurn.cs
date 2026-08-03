namespace Visualiza.Application.Components;

/// <summary>
/// Turno anterior de la conversación con el asistente.
/// </summary>
/// <param name="Role"><c>user</c> o <c>assistant</c>.</param>
/// <param name="Content">Texto del turno. Las imágenes no se reenvían: solo van en el turno actual.</param>
public sealed record AssistTurn(string Role, string Content);
