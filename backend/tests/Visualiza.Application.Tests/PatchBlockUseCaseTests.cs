using System.Text.Json;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
using Visualiza.Domain.Components;

namespace Visualiza.Application.Tests;

/// <summary>
/// El saneado del parche es la única barrera entre la salida del modelo y el árbol de
/// bloques del usuario. Todo lo que pase de aquí se aplica al lienzo, así que estos tests
/// cubren sobre todo lo que debe rechazarse.
/// </summary>
public class PatchBlockUseCaseTests
{
    private const string StateVars =
        """[{"name":"abierto","type":"boolean","initial":"false"}]""";

    private static PatchBlockRequest Request(string instruction = "haz algo") =>
        new("button", """{"text":"Aceptar"}""", StateVars, instruction);

    [Fact]
    public async Task ExecuteAsync_KeepsValidPatch()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"props":{"className":"bg-red-600"},"visibleIf":{"var":"abierto","op":"is","value":"true"}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.True(response.Applied);
        var patch = JsonDocument.Parse(response.PatchJson).RootElement;
        Assert.Equal("bg-red-600", patch.GetProperty("props").GetProperty("className").GetString());
        Assert.Equal("abierto", patch.GetProperty("visibleIf").GetProperty("var").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_RejectsUnknownVariable()
    {
        // Si el modelo inventa una variable, el bloque quedaría apuntando a algo que no
        // existe y su acción no haría nada de forma silenciosa.
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"events":[{"event":"click","actions":[{"kind":"toggle","target":"inventada"}]}]}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Contains("inventada", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_DropsDisallowedKeys()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"props":{"text":"Vale"},"children":["block-9"],"type":"input"}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.True(response.Applied);
        var patch = JsonDocument.Parse(response.PatchJson).RootElement;
        Assert.False(patch.TryGetProperty("children", out _));
        Assert.False(patch.TryGetProperty("type", out _));
        Assert.Contains("children", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_KeepsValidationsAndNewEvents()
    {
        // Reglas de validación y eventos de la tanda nueva (blur, hover…): deben
        // atravesar la lista blanca sin recortes.
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"validations":[{"kind":"required","message":"Obligatorio"},{"kind":"minLength","value":"3"}],"events":[{"event":"blur","actions":[{"kind":"set","target":"abierto","value":"true"}]}]}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.True(response.Applied);
        var patch = JsonDocument.Parse(response.PatchJson).RootElement;
        var validations = patch.GetProperty("validations");
        Assert.Equal(2, validations.GetArrayLength());
        Assert.Equal("required", validations[0].GetProperty("kind").GetString());
        Assert.Equal("3", validations[1].GetProperty("value").GetString());
        Assert.Equal("blur", patch.GetProperty("events")[0].GetProperty("event").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_RejectsUnknownValidationKind()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"validations":[{"kind":"telefono"}]}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Contains("telefono", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_RejectsUnsupportedActionKind()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"events":[{"event":"click","actions":[{"kind":"navegar","target":"abierto"}]}]}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Contains("navegar", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_ReportsInvalidJson_WithoutThrowing()
    {
        var useCase = new PatchBlockUseCase(new StudGeneratorRaw("esto no es JSON"));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Equal("{}", response.PatchJson);
        Assert.NotNull(response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_AllowsRemovingVisibility()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator("""{"visibleIf":null}"""));

        var response = await useCase.ExecuteAsync(Request("que se vea siempre"));

        Assert.True(response.Applied);
        var patch = JsonDocument.Parse(response.PatchJson).RootElement;
        Assert.Equal(JsonValueKind.Null, patch.GetProperty("visibleIf").ValueKind);
    }

    [Fact]
    public async Task ExecuteAsync_CoercesNumericPropsToStrings()
    {
        // Las props del builder son siempre cadenas; un número no debe colarse tal cual.
        var useCase = new PatchBlockUseCase(new StubGenerator("""{"props":{"rows":4}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.True(response.Applied);
        var patch = JsonDocument.Parse(response.PatchJson).RootElement;
        Assert.Equal(JsonValueKind.String, patch.GetProperty("props").GetProperty("rows").ValueKind);
    }

    // ── Reglas de negocio ────────────────────────────────────────────────────
    //
    // Las condiciones dejaron de mirar solo el estado: ahora pueden mirar un campo
    // del dato que el bloque está pintando, y responder cambiando el estilo en vez
    // de desaparecer. Cada cosa nueva abre su propia puerta al árbol del usuario.

    private const string DataModel =
        """{"name":"Producto","sampleRows":3,"fields":[{"name":"stock","type":"number","sample":"0"}]}""";

    private const string Callbacks = """[{"name":"onComprar","passesItem":true}]""";

    private static PatchBlockRequest ContractRequest(string instruction = "haz algo") =>
        new("tr", "{}", StateVars, instruction, DataModel, Callbacks);

    [Fact]
    public async Task ExecuteAsync_KeepsConditionOverModelField()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"visibleIf":{"field":"stock","op":"gt","value":"0"}}"""));

        var response = await useCase.ExecuteAsync(ContractRequest("oculta la fila si no queda stock"));

        Assert.True(response.Applied);
        var rule = JsonDocument.Parse(response.PatchJson).RootElement.GetProperty("visibleIf");
        Assert.Equal("stock", rule.GetProperty("field").GetString());
        Assert.Equal("gt", rule.GetProperty("op").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_RejectsUnknownModelField()
    {
        // Un campo inventado emitiría `item.loQueSea` contra un tipo que no lo
        // declara: el componente no compilaría en el proyecto de destino.
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"visibleIf":{"field":"precio","op":"gt","value":"0"}}"""));

        var response = await useCase.ExecuteAsync(ContractRequest());

        Assert.False(response.Applied);
        Assert.Contains("precio", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_KeepsStyleRules()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"styleRules":[{"when":{"field":"stock","op":"lt","value":"1"},"className":"bg-red-50"}]}"""));

        var response = await useCase.ExecuteAsync(ContractRequest("pinta en rojo lo agotado"));

        Assert.True(response.Applied);
        var rule = JsonDocument.Parse(response.PatchJson).RootElement.GetProperty("styleRules")[0];
        Assert.Equal("bg-red-50", rule.GetProperty("className").GetString());
        Assert.Equal("stock", rule.GetProperty("when").GetProperty("field").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_DropsStyleRuleWithoutClasses()
    {
        // Una regla sin clases no cambia nada, pero sí aparece en el panel como si
        // el bloque tuviera comportamiento: se descarta antes de llegar al lienzo.
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"styleRules":[{"when":{"var":"abierto","op":"is","value":"true"},"className":"   "}]}"""));

        var response = await useCase.ExecuteAsync(ContractRequest());

        Assert.False(response.Applied);
        Assert.Contains("sin clases", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_KeepsCallAction()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"events":[{"event":"click","actions":[{"kind":"call","target":"onComprar"}]}]}"""));

        var response = await useCase.ExecuteAsync(ContractRequest("al pulsar, avisa"));

        Assert.True(response.Applied);
        var action = JsonDocument.Parse(response.PatchJson).RootElement
            .GetProperty("events")[0].GetProperty("actions")[0];
        Assert.Equal("call", action.GetProperty("kind").GetString());
        Assert.Equal("onComprar", action.GetProperty("target").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_RejectsCallToUndeclaredCallback()
    {
        // Los avisos y las variables son espacios de nombres distintos: `abierto`
        // existe como variable y no por eso puede llamarse como función.
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"events":[{"event":"click","actions":[{"kind":"call","target":"abierto"}]}]}"""));

        var response = await useCase.ExecuteAsync(ContractRequest());

        Assert.False(response.Applied);
        Assert.Contains("abierto", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_RejectsConditionOverFieldWithoutModel()
    {
        // El mismo parche que sí se acepta con modelo declarado. Sin contrato de
        // datos no hay campo al que referirse, y aceptarlo sería emitir contra nada.
        var useCase = new PatchBlockUseCase(new StubGenerator(
            """{"visibleIf":{"field":"stock","op":"gt","value":"0"}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Contains("stock", response.Diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_RequiresInstruction()
    {
        var useCase = new PatchBlockUseCase(new StubGenerator("{}"));

        await Assert.ThrowsAsync<ArgumentException>(
            () => useCase.ExecuteAsync(new PatchBlockRequest("button", "{}", StateVars, "  ")));
    }

    /// <summary>Generador que devuelve un parche fijo.</summary>
    private sealed class StubGenerator : IComponentGenerator
    {
        private readonly string _patch;
        public StubGenerator(string patch) => _patch = patch;

        public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> PatchBlockAsync(string contextJson, string instruction, CancellationToken cancellationToken = default)
            => Task.FromResult(_patch);
    }

    /// <summary>Alias legible para el caso de respuesta no-JSON.</summary>
    private sealed class StudGeneratorRaw : IComponentGenerator
    {
        private readonly string _raw;
        public StudGeneratorRaw(string raw) => _raw = raw;

        public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> PatchBlockAsync(string contextJson, string instruction, CancellationToken cancellationToken = default)
            => Task.FromResult(_raw);
    }
}
