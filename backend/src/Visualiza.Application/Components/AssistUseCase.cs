using System.Text.Json;
using System.Text.Json.Nodes;
using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Components;

/// <summary>
/// Asistente de la plataforma: entrega a la IA el contexto completo del constructor
/// (árbol de bloques con sus propiedades, bloque seleccionado, variables de estado y
/// código emitido) y recibe una respuesta conversacional que puede incluir el árbol
/// modificado.
///
/// El árbol devuelto es <em>datos, no código</em>: el frontend lo valida contra su
/// esquema de bloques (tipos conocidos, props como cadenas, hijos existentes) antes de
/// aplicarlo, igual que hace <see cref="PatchBlockUseCase"/> con los parches. Aquí se
/// garantiza la estructura mínima: objeto JSON con <c>blocks</c> y <c>rootIds</c>.
/// </summary>
public sealed class AssistUseCase
{
    private readonly IComponentGenerator _generator;

    public AssistUseCase(IComponentGenerator generator)
    {
        _generator = generator;
    }

    public async Task<AssistResponse> ExecuteAsync(
        AssistRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        if (string.IsNullOrWhiteSpace(request.Message))
            throw new ArgumentException("Message is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.TreeJson))
            throw new ArgumentException("TreeJson is required.", nameof(request));

        var context = BuildContext(request);
        var raw = await _generator.AssistAsync(context, request.Message, cancellationToken);

        return Parse(raw);
    }

    private static string BuildContext(AssistRequest request)
    {
        var context = new JsonObject
        {
            ["tree"] = ParseOrNull(request.TreeJson) ?? new JsonObject(),
        };
        if (!string.IsNullOrWhiteSpace(request.SelectedBlockId))
            context["selectedBlockId"] = request.SelectedBlockId;
        if (!string.IsNullOrWhiteSpace(request.CurrentCode))
            context["currentCode"] = request.CurrentCode;
        if (!string.IsNullOrWhiteSpace(request.PaletteJson)
            && ParseOrNull(request.PaletteJson) is { } palette)
        {
            context["palette"] = palette;
        }
        if (!string.IsNullOrWhiteSpace(request.ThemeJson)
            && ParseOrNull(request.ThemeJson) is { } theme)
        {
            context["theme"] = theme;
        }
        if (!string.IsNullOrWhiteSpace(request.StyleVocabularyJson)
            && ParseOrNull(request.StyleVocabularyJson) is { } vocabulary)
        {
            context["styleVocabulary"] = vocabulary;
        }
        return context.ToJsonString();
    }

    private static JsonNode? ParseOrNull(string json)
    {
        try
        {
            return JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static AssistResponse Parse(string raw)
    {
        // Respuesta vacía: el modelo no llegó a producir texto. No es «no había
        // nada que hacer», y decir «Hecho.» sería afirmar que se hizo algo.
        if (string.IsNullOrWhiteSpace(raw) || raw.Trim() == "{}")
        {
            return new AssistResponse(
                "No he podido completar la respuesta. Vuelve a intentarlo, y si se repite, "
                + "concreta un poco más la petición.",
                null, false);
        }

        JsonNode? node;
        try
        {
            node = JsonNode.Parse(raw);
        }
        catch (JsonException)
        {
            return new AssistResponse(
                "La IA no devolvió una respuesta utilizable.", null, false);
        }

        if (node is not JsonObject obj)
            return new AssistResponse("La IA no devolvió una respuesta utilizable.", null, false);

        var reply = obj["reply"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(reply))
            reply = "Hecho.";

        var options = ParseOptions(obj["options"]);

        // El árbol solo se acepta con la estructura mínima; la validación fina
        // (tipos de bloque, hijos existentes) la hace el frontend, que es quien
        // conoce el esquema de la paleta.
        if (obj["tree"] is JsonObject tree
            && tree["blocks"] is JsonObject
            && tree["rootIds"] is JsonArray)
        {
            return new AssistResponse(reply, tree.ToJsonString(), true, options);
        }

        return new AssistResponse(reply, null, false, options);
    }

    /// <summary>
    /// Respuestas rápidas de una pregunta del asistente.
    /// </summary>
    /// <remarks>
    /// Se acotan a seis y se descartan las vacías: son botones, y una lista larga
    /// deja de ser un atajo para convertirse en otra decisión que tomar.
    /// </remarks>
    private static IReadOnlyList<string>? ParseOptions(JsonNode? node)
    {
        if (node is not JsonArray array) return null;

        var options = array
            .OfType<JsonValue>()
            .Select(v => v.TryGetValue<string>(out var text) ? text?.Trim() : null)
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Select(text => text!)
            .Take(6)
            .ToList();

        return options.Count > 0 ? options : null;
    }
}
