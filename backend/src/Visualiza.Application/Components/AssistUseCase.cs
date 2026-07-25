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

        // El árbol solo se acepta con la estructura mínima; la validación fina
        // (tipos de bloque, hijos existentes) la hace el frontend, que es quien
        // conoce el esquema de la paleta.
        if (obj["tree"] is JsonObject tree
            && tree["blocks"] is JsonObject
            && tree["rootIds"] is JsonArray)
        {
            return new AssistResponse(reply, tree.ToJsonString(), true);
        }

        return new AssistResponse(reply, null, false);
    }
}
