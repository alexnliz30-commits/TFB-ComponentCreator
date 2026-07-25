using System.Text.Json;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
using Visualiza.Domain.Components;

namespace Visualiza.Application.Tests;

/// <summary>
/// El asistente devuelve datos (un árbol), no código. Aquí se cubre el contrato de
/// parseo: solo se acepta un árbol con la estructura mínima, y una respuesta rota
/// degrada a texto sin tocar el lienzo.
/// </summary>
public class AssistUseCaseTests
{
    private const string Tree =
        """{"blocks":{"block-1":{"id":"block-1","type":"button","props":{"text":"Hola"},"children":[]}},"rootIds":["block-1"],"stateVars":[]}""";

    private static AssistRequest Request(string message = "haz algo") =>
        new(message, Tree, "block-1", null);

    [Fact]
    public async Task ExecuteAsync_ReturnsReplyAndTree()
    {
        var useCase = new AssistUseCase(new StubAssistant(
            $$"""{"reply":"Cambiado el texto del botón.","tree":{{Tree}}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.True(response.Applied);
        Assert.Equal("Cambiado el texto del botón.", response.Reply);
        var tree = JsonDocument.Parse(response.TreeJson!).RootElement;
        Assert.True(tree.TryGetProperty("blocks", out _));
        Assert.True(tree.TryGetProperty("rootIds", out _));
    }

    [Fact]
    public async Task ExecuteAsync_ReplyWithoutTreeIsNotApplied()
    {
        var useCase = new AssistUseCase(new StubAssistant(
            """{"reply":"Ese bloque ya es azul."}"""));

        var response = await useCase.ExecuteAsync(Request("¿de qué color es?"));

        Assert.False(response.Applied);
        Assert.Null(response.TreeJson);
        Assert.Equal("Ese bloque ya es azul.", response.Reply);
    }

    [Fact]
    public async Task ExecuteAsync_MalformedTreeIsDiscarded()
    {
        // Un árbol sin la estructura mínima no debe llegar al lienzo.
        var useCase = new AssistUseCase(new StubAssistant(
            """{"reply":"ok","tree":{"cosas":true}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Null(response.TreeJson);
    }

    [Fact]
    public async Task ExecuteAsync_NonJsonDegradesToText()
    {
        var useCase = new AssistUseCase(new StubAssistant("esto no es JSON"));

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.False(string.IsNullOrWhiteSpace(response.Reply));
    }

    [Fact]
    public async Task ExecuteAsync_RequiresMessage()
    {
        var useCase = new AssistUseCase(new StubAssistant("{}"));

        await Assert.ThrowsAsync<ArgumentException>(() => useCase.ExecuteAsync(Request("  ")));
    }

    [Fact]
    public async Task ExecuteAsync_PassesPaletteAndThemeInContext()
    {
        // La paleta y el tema son lo que permite a la IA generar bloques que se
        // renderizan bien y que siguen los estilos globales de la librería. Si no
        // llegan al contexto, el modelo inventa tipos y colores literales.
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(new AssistRequest(
            "haz algo", Tree, null, null,
            PaletteJson: """[{"type":"button"}]""",
            ThemeJson: """{"colors":{"primario":"#ff0000"}}"""));

        var context = JsonDocument.Parse(assistant.LastContext!).RootElement;
        Assert.True(context.TryGetProperty("palette", out _));
        Assert.Equal(
            "#ff0000",
            context.GetProperty("theme").GetProperty("colors").GetProperty("primario").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_OmitsThemeWhenNotProvided()
    {
        // Compatibilidad: las peticiones sin tema (clientes antiguos, pruebas)
        // deben seguir funcionando sin ensuciar el contexto con una clave vacía.
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(Request());

        var context = JsonDocument.Parse(assistant.LastContext!).RootElement;
        Assert.False(context.TryGetProperty("theme", out _));
    }

    /// <summary>Generador que devuelve una respuesta de asistente fija.</summary>
    private sealed class StubAssistant : IComponentGenerator
    {
        private readonly string _response;
        public StubAssistant(string response) => _response = response;

        /// <summary>Contexto recibido en la última llamada, para poder afirmarlo.</summary>
        public string? LastContext { get; private set; }

        public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> AssistAsync(string contextJson, string message, CancellationToken cancellationToken = default)
        {
            LastContext = contextJson;
            return Task.FromResult(_response);
        }
    }
}
