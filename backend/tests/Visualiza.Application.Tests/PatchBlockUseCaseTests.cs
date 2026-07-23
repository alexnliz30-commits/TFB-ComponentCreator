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
