using System.Text.Json;
using System.Text.Json.Nodes;
using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Components;

/// <summary>
/// Modificación asistida de un bloque del lienzo.
///
/// A diferencia de <see cref="RefineComponentUseCase"/>, que devuelve código y por tanto
/// congela el componente (el árbol de bloques deja de gobernarlo y se pierde la edición
/// visual), este caso de uso devuelve un <em>parche estructurado</em>: el bloque sigue
/// siendo editable, el cambio entra en el historial de deshacer y nunca puede romper la
/// compilación, porque no hay código generado por el modelo.
///
/// Todo lo que devuelve el modelo se valida contra una lista blanca antes de salir de
/// aquí. Un parche malformado se descarta entero en vez de aplicarse a medias.
/// </summary>
public sealed class PatchBlockUseCase
{
    private static readonly HashSet<string> AllowedKeys = new(StringComparer.Ordinal)
    {
        "props", "events", "visibleIf", "validations"
    };

    private static readonly HashSet<string> AllowedEvents = new(StringComparer.Ordinal)
    {
        "click", "change", "submit", "blur", "focus", "mouseenter", "mouseleave", "dblclick"
    };

    private static readonly HashSet<string> AllowedActionKinds = new(StringComparer.Ordinal)
    {
        "toggle", "set", "increment", "reset"
    };

    private static readonly HashSet<string> AllowedValidationKinds = new(StringComparer.Ordinal)
    {
        "required", "minLength", "maxLength", "pattern", "email", "min", "max"
    };

    private static readonly HashSet<string> AllowedOps = new(StringComparer.Ordinal) { "is", "not" };

    private readonly IComponentGenerator _generator;

    public PatchBlockUseCase(IComponentGenerator generator)
    {
        _generator = generator;
    }

    public async Task<PatchBlockResponse> ExecuteAsync(
        PatchBlockRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null) throw new ArgumentNullException(nameof(request));
        if (string.IsNullOrWhiteSpace(request.BlockType))
            throw new ArgumentException("BlockType is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Instruction))
            throw new ArgumentException("Instruction is required.", nameof(request));

        var knownVars = ParseVarNames(request.StateVarsJson);

        var context = BuildContext(request, knownVars);
        var raw = await _generator.PatchBlockAsync(context, request.Instruction, cancellationToken);

        return Sanitize(raw, knownVars);
    }

    private static string BuildContext(PatchBlockRequest request, IReadOnlyCollection<string> vars)
    {
        var payload = new JsonObject
        {
            ["blockType"] = request.BlockType,
            ["props"] = SafeParse(request.CurrentPropsJson) ?? new JsonObject(),
            ["stateVars"] = SafeParse(request.StateVarsJson) ?? new JsonArray(),
            ["allowedVariableNames"] = new JsonArray(vars.Select(v => JsonValue.Create(v)).ToArray<JsonNode?>())
        };
        return payload.ToJsonString();
    }

    private static JsonNode? SafeParse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonNode.Parse(json); }
        catch (JsonException) { return null; }
    }

    private static HashSet<string> ParseVarNames(string? stateVarsJson)
    {
        var names = new HashSet<string>(StringComparer.Ordinal);
        if (SafeParse(stateVarsJson) is not JsonArray array) return names;

        foreach (var item in array)
        {
            if (item?["name"]?.GetValue<string>() is { Length: > 0 } name) names.Add(name);
        }
        return names;
    }

    /// <summary>
    /// Filtra el parche del modelo dejando solo lo que el builder sabe aplicar.
    /// </summary>
    private static PatchBlockResponse Sanitize(string? raw, HashSet<string> knownVars)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new PatchBlockResponse("{}", false, "El modelo no devolvió ningún parche.");

        JsonNode? parsed;
        try
        {
            parsed = JsonNode.Parse(raw);
        }
        catch (JsonException ex)
        {
            return new PatchBlockResponse("{}", false, $"Respuesta no es JSON válido: {ex.Message}");
        }

        if (parsed is not JsonObject source)
            return new PatchBlockResponse("{}", false, "El parche debe ser un objeto JSON.");

        var result = new JsonObject();
        var rejected = new List<string>();

        foreach (var (key, value) in source)
        {
            if (!AllowedKeys.Contains(key))
            {
                rejected.Add($"clave '{key}' no permitida");
                continue;
            }

            switch (key)
            {
                case "props" when value is JsonObject props:
                    var cleanProps = SanitizeProps(props, rejected);
                    if (cleanProps.Count > 0) result["props"] = cleanProps;
                    break;

                case "events" when value is JsonArray events:
                    var cleanEvents = SanitizeEvents(events, knownVars, rejected);
                    if (cleanEvents.Count > 0) result["events"] = cleanEvents;
                    break;

                case "visibleIf":
                    if (value is null)
                    {
                        result["visibleIf"] = null; // petición explícita de quitar la condición
                    }
                    else if (SanitizeVisibility(value, knownVars, rejected) is { } rule)
                    {
                        result["visibleIf"] = rule;
                    }
                    break;

                case "validations" when value is JsonArray validations:
                    var cleanValidations = SanitizeValidations(validations, rejected);
                    if (cleanValidations.Count > 0) result["validations"] = cleanValidations;
                    break;

                default:
                    rejected.Add($"'{key}' tiene un tipo inesperado");
                    break;
            }
        }

        var diagnostics = rejected.Count > 0 ? string.Join("; ", rejected) : null;

        return result.Count == 0
            ? new PatchBlockResponse("{}", false, diagnostics ?? "El parche no contenía cambios aplicables.")
            : new PatchBlockResponse(result.ToJsonString(), true, diagnostics);
    }

    private static JsonObject SanitizeProps(JsonObject props, List<string> rejected)
    {
        var clean = new JsonObject();
        foreach (var (name, value) in props)
        {
            // Las props del builder son siempre cadenas; cualquier otra cosa se descarta.
            if (value is JsonValue v && v.TryGetValue<string>(out var text))
            {
                clean[name] = text;
            }
            else if (value is JsonValue num && num.TryGetValue<double>(out var number))
            {
                clean[name] = number.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
            else
            {
                rejected.Add($"prop '{name}' no es una cadena");
            }
        }
        return clean;
    }

    private static JsonArray SanitizeEvents(JsonArray events, HashSet<string> knownVars, List<string> rejected)
    {
        var clean = new JsonArray();

        foreach (var entry in events)
        {
            if (entry is not JsonObject obj) continue;

            var name = obj["event"]?.GetValue<string>();
            if (name is null || !AllowedEvents.Contains(name))
            {
                rejected.Add($"evento '{name ?? "?"}' no soportado");
                continue;
            }

            if (obj["actions"] is not JsonArray actions) continue;

            var cleanActions = new JsonArray();
            foreach (var action in actions)
            {
                if (action is not JsonObject a) continue;

                var kind = a["kind"]?.GetValue<string>();
                if (kind is null || !AllowedActionKinds.Contains(kind))
                {
                    rejected.Add($"acción '{kind ?? "?"}' no soportada");
                    continue;
                }

                var node = new JsonObject { ["kind"] = kind };

                if (kind != "reset")
                {
                    var target = a["target"]?.GetValue<string>();
                    // Una variable inventada dejaría el bloque apuntando a la nada.
                    if (target is null || !knownVars.Contains(target))
                    {
                        rejected.Add($"variable '{target ?? "?"}' no existe");
                        continue;
                    }
                    node["target"] = target;

                    if (kind == "set") node["value"] = a["value"]?.ToString() ?? "";
                    if (kind == "increment") node["by"] = a["by"]?.ToString() ?? "1";
                }

                cleanActions.Add(node);
            }

            if (cleanActions.Count > 0)
            {
                clean.Add(new JsonObject { ["event"] = name, ["actions"] = cleanActions });
            }
        }

        return clean;
    }

    /// <summary>
    /// Reglas de validación de un campo. El frontend vuelve a sanearlas contra
    /// el tipo de bloque (solo los campos las admiten) y descarta patrones que
    /// no compilan; aquí se garantiza la forma y la lista blanca de tipos.
    /// </summary>
    private static JsonArray SanitizeValidations(JsonArray validations, List<string> rejected)
    {
        var clean = new JsonArray();
        foreach (var entry in validations)
        {
            if (entry is not JsonObject obj) continue;

            var kind = obj["kind"]?.GetValue<string>();
            if (kind is null || !AllowedValidationKinds.Contains(kind))
            {
                rejected.Add($"validación '{kind ?? "?"}' no soportada");
                continue;
            }

            var node = new JsonObject { ["kind"] = kind };
            if (obj["value"] is JsonValue v) node["value"] = v.ToString();
            if (obj["message"] is JsonValue m) node["message"] = m.ToString();
            clean.Add(node);
        }
        return clean;
    }

    private static JsonObject? SanitizeVisibility(JsonNode value, HashSet<string> knownVars, List<string> rejected)
    {
        if (value is not JsonObject obj) return null;

        var name = obj["var"]?.GetValue<string>();
        if (name is null || !knownVars.Contains(name))
        {
            rejected.Add($"variable '{name ?? "?"}' no existe");
            return null;
        }

        var op = obj["op"]?.GetValue<string>() ?? "is";
        if (!AllowedOps.Contains(op)) op = "is";

        return new JsonObject
        {
            ["var"] = name,
            ["op"] = op,
            ["value"] = obj["value"]?.ToString() ?? "true"
        };
    }
}
