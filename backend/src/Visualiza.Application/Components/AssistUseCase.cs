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
        var raw = await _generator.AssistAsync(
            context, request.Message, SanitizeImages(request.Images), ParseHistory(request.HistoryJson), cancellationToken);

        return Parse(raw);
    }

    /// <summary>
    /// Tipos de imagen que acepta la API de Claude. Uno fuera de la lista provocaría
    /// un 400 del proveedor a mitad de conversación; se descarta antes de salir.
    /// </summary>
    private static readonly HashSet<string> AllowedMediaTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/webp", "image/gif"
    };

    /// <summary>Número máximo de imágenes por petición.</summary>
    /// <remarks>
    /// Un diseño con muchas pantallas se sube de golpe con facilidad, y cada imagen
    /// consume presupuesto de contexto: pasado cierto punto el modelo se queda sin
    /// margen para razonar y devuelve una respuesta cortada, que es peor que decir
    /// desde el principio que se atienden las primeras.
    /// </remarks>
    private const int MaxImages = 6;

    private static IReadOnlyList<AssistImage>? SanitizeImages(IReadOnlyList<AssistImage>? images)
    {
        if (images is null || images.Count == 0) return null;

        var clean = images
            .Where(i => i is not null
                && !string.IsNullOrWhiteSpace(i.DataBase64)
                && AllowedMediaTypes.Contains(i.MediaType))
            .Take(MaxImages)
            .ToList();

        return clean.Count > 0 ? clean : null;
    }

    private static IReadOnlyList<AssistTurn>? ParseHistory(string? historyJson)
    {
        if (string.IsNullOrWhiteSpace(historyJson)) return null;
        if (ParseOrNull(historyJson) is not JsonArray array) return null;

        var turns = new List<AssistTurn>();
        foreach (var item in array)
        {
            if (item is not JsonObject obj) continue;
            var role = obj["role"]?.GetValue<string>();
            var content = obj["content"]?.GetValue<string>();
            // La API exige alternancia y roles conocidos: cualquier otra cosa la
            // rechazaría entera, así que se filtra aquí.
            if (role is not ("user" or "assistant")) continue;
            if (string.IsNullOrWhiteSpace(content)) continue;
            turns.Add(new AssistTurn(role, content));
        }
        return turns.Count > 0 ? turns : null;
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
        if (!string.IsNullOrWhiteSpace(request.LibrariesJson)
            && ParseOrNull(request.LibrariesJson) is { } libraries)
        {
            context["libraries"] = libraries;
        }
        if (!string.IsNullOrWhiteSpace(request.ProjectJson)
            && ParseOrNull(request.ProjectJson) is { } project)
        {
            context["project"] = project;
        }
        if (!string.IsNullOrWhiteSpace(request.TargetJson)
            && ParseOrNull(request.TargetJson) is { } target)
        {
            context["target"] = target;
        }
        // El modelo ve las imágenes como bloques aparte, pero necesita saber en el
        // contexto que las hay: sin esta pista puede responder al texto ignorando
        // que la petición se apoyaba en una captura.
        if (request.Images is { Count: > 0 } images)
        {
            context["attachedImages"] = images.Count;
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
        var components = ParseComponents(obj["components"]);

        // Una tanda de varios componentes no lleva árbol propio: cada uno es un
        // componente nuevo del proyecto, no un reemplazo del lienzo abierto.
        if (components is { Count: > 0 })
            return new AssistResponse(reply, null, false, options, components, ParseTarget(obj["target"]));

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

    private static readonly HashSet<string> TargetKinds = new(StringComparer.Ordinal)
    {
        "existing", "new", "none"
    };

    /// <summary>
    /// Destino de la tanda.
    /// </summary>
    /// <remarks>
    /// Un destino que no se entiende se degrada a <c>none</c> en vez de
    /// descartarse: los componentes deben crearse igual en el proyecto, y es
    /// preferible que falte la publicación en la librería —que el usuario puede
    /// rehacer— a perder el trabajo entero por una clave mal escrita.
    /// </remarks>
    private static AssistTarget? ParseTarget(JsonNode? node)
    {
        if (node is not JsonObject obj) return null;

        var kind = obj["kind"]?.GetValue<string>();
        if (kind is null || !TargetKinds.Contains(kind)) return new AssistTarget("none", null, null);

        return new AssistTarget(
            kind,
            kind == "existing" ? obj["libraryId"]?.GetValue<string>() : null,
            kind == "new" ? obj["libraryName"]?.GetValue<string>()?.Trim() : null);
    }

    /// <summary>Máximo de componentes por tanda.</summary>
    /// <remarks>
    /// El tope es el mismo criterio que el de las imágenes: un árbol completo por
    /// componente ocupa mucho, y una tanda desmedida llega cortada. Es preferible
    /// entregar los primeros bien formados a entregarlos todos rotos.
    /// </remarks>
    private const int MaxComponents = 12;

    /// <summary>
    /// Componentes de una tanda. Se exige a cada uno la misma estructura mínima que
    /// al árbol suelto; los que no la cumplen se descartan uno a uno, para que un
    /// elemento mal formado no tire la tanda entera.
    /// </summary>
    private static IReadOnlyList<AssistComponent>? ParseComponents(JsonNode? node)
    {
        if (node is not JsonArray array) return null;

        var components = new List<AssistComponent>();
        foreach (var item in array)
        {
            if (components.Count >= MaxComponents) break;
            if (item is not JsonObject obj) continue;
            if (obj["tree"] is not JsonObject tree) continue;
            if (tree["blocks"] is not JsonObject || tree["rootIds"] is not JsonArray) continue;

            var name = obj["name"]?.GetValue<string>()?.Trim();
            components.Add(new AssistComponent(
                string.IsNullOrWhiteSpace(name) ? $"Componente {components.Count + 1}" : name,
                tree.ToJsonString()));
        }

        return components.Count > 0 ? components : null;
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
