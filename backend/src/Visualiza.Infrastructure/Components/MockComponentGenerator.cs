using System.Text.Json.Nodes;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
using Visualiza.Domain.Components;

namespace Visualiza.Infrastructure.Components;

public sealed class MockComponentGenerator : IComponentGenerator
{
    public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
        => GenerateAsync(type, prompt, TargetFramework.React, CodeLanguage.TypeScript, cancellationToken);

    public Task<UiComponent> GenerateAsync(
        ComponentType type,
        string prompt,
        TargetFramework framework,
        CodeLanguage language,
        CancellationToken cancellationToken = default)
    {
        var source = framework == TargetFramework.React
            ? ReactSource(type)
            : MockMultiframeworkSources.For(framework, language, type);

        var component = new UiComponent(type, source, LanguageTokens.For(framework, language));
        return Task.FromResult(component);
    }

    private static string ReactSource(ComponentType type) => type switch
    {
        ComponentType.RegistrationForm => MockSources.RegistrationForm,
        ComponentType.DataTable => MockSources.DataTable,
        ComponentType.StatsPanel => MockSources.StatsPanel,
        ComponentType.NavigationMenu => MockSources.NavigationMenu,
        ComponentType.ProductCard => MockSources.ProductCard,
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unsupported component type.")
    };

    public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
    {
        var refined = $"// Refined: {instruction}\n{sourceCode}";
        return Task.FromResult(refined);
    }

    /// <summary>
    /// Parche simulado, deducido por palabras clave de la instrucción.
    ///
    /// No pretende entender lenguaje natural: existe para que el flujo completo
    /// (petición, saneado y aplicación al árbol) sea ejercitable sin clave de OpenAI,
    /// igual que <see cref="MockSources"/> hace con la generación.
    /// </summary>
    public Task<string> PatchBlockAsync(
        string contextJson,
        string instruction,
        CancellationToken cancellationToken = default)
    {
        var text = instruction.ToLowerInvariant();

        var colour = text switch
        {
            _ when text.Contains("rojo") => "bg-red-600 hover:bg-red-700 text-white",
            _ when text.Contains("verde") => "bg-green-600 hover:bg-green-700 text-white",
            _ when text.Contains("azul") => "bg-blue-600 hover:bg-blue-700 text-white",
            _ => null
        };

        if (colour is null) return Task.FromResult("{}");

        var patch = new JsonObject
        {
            ["props"] = new JsonObject
            {
                ["className"] = $"px-4 py-2 rounded-md text-sm font-medium transition-colors {colour}"
            }
        };
        return Task.FromResult(patch.ToJsonString());
    }

    /// <summary>
    /// Asistente simulado: responde texto explicando que no hay clave de Anthropic
    /// configurada, sin tocar el árbol. Mantiene el flujo completo ejercitable sin IA real.
    /// </summary>
    public Task<string> AssistAsync(string contextJson, string message, CancellationToken cancellationToken = default)
        => AssistAsync(contextJson, message, null, null, cancellationToken);

    public Task<string> AssistAsync(
        string contextJson,
        string message,
        IReadOnlyList<AssistImage>? images,
        IReadOnlyList<AssistTurn>? history,
        CancellationToken cancellationToken = default)
    {
        // Con imágenes se dice explícitamente que llegaron: si no, un fallo de subida
        // y la falta de clave darían el mismo mensaje y no se distinguirían.
        var detail = images is { Count: > 0 }
            ? $" He recibido {images.Count} imagen(es), pero sin clave no puedo interpretarlas."
            : string.Empty;

        var reply = new JsonObject
        {
            ["reply"] =
                "Modo demo: no hay clave de la API de Claude configurada (Anthropic:ApiKey), " +
                "así que no puedo modificar el componente. Configúrala para activar el asistente." + detail
        };
        return Task.FromResult(reply.ToJsonString());
    }
}
