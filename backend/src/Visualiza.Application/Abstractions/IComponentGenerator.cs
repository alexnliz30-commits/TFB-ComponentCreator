using Visualiza.Domain.Components;

namespace Visualiza.Application.Abstractions;

public interface IComponentGenerator
{
    Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default);

    /// <summary>
    /// Generación para un framework/lenguaje concretos. La implementación por defecto
    /// ignora el objetivo y delega en la sobrecarga React+TypeScript, de modo que los
    /// dobles de test existentes siguen siendo válidos.
    /// </summary>
    Task<UiComponent> GenerateAsync(
        ComponentType type,
        string prompt,
        TargetFramework framework,
        CodeLanguage language,
        CancellationToken cancellationToken = default)
        => GenerateAsync(type, prompt, cancellationToken);

    Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default);

    /// <summary>
    /// Devuelve un parche JSON para un bloque del lienzo, en lugar de código.
    /// </summary>
    /// <param name="contextJson">Tipo del bloque, sus props y las variables de estado disponibles.</param>
    /// <param name="instruction">Petición del usuario en lenguaje natural.</param>
    /// <remarks>
    /// La implementación por defecto devuelve un parche vacío, de modo que los dobles de
    /// test existentes siguen siendo válidos sin tocarlos. Quien no sepa producir parches
    /// simplemente no modifica nada, que es el comportamiento seguro.
    /// </remarks>
    Task<string> PatchBlockAsync(string contextJson, string instruction, CancellationToken cancellationToken = default)
        => Task.FromResult("{}");

    /// <summary>
    /// Modo asistente: recibe el contexto completo de la plataforma (árbol de bloques,
    /// bloque seleccionado, variables de estado, código emitido) y devuelve un JSON
    /// <c>{ "reply": ..., "tree": ... }</c> donde <c>tree</c> es opcional.
    /// </summary>
    /// <remarks>
    /// Implementación por defecto vacía por el mismo motivo que <see cref="PatchBlockAsync"/>:
    /// los dobles de test siguen siendo válidos y el comportamiento seguro es no tocar nada.
    /// </remarks>
    Task<string> AssistAsync(string contextJson, string message, CancellationToken cancellationToken = default)
        => Task.FromResult("{}");
}
