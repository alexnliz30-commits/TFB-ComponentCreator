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

    [Fact]
    public async Task ExecuteAsync_ReturnsQuestionWithQuickAnswers()
    {
        // Preguntar es parte del trabajo: una petición vaga admite resultados muy
        // distintos y adivinar produce un componente que hay que rehacer. Una
        // pregunta llega sin árbol y con opciones para responder de un clic.
        var assistant = new StubAssistant(
            """{"reply":"¿Qué campos necesitas?","options":["Nombre y email","Email y contraseña","  ",""]}""");
        var useCase = new AssistUseCase(assistant);

        var response = await useCase.ExecuteAsync(Request("hazme un formulario"));

        Assert.False(response.Applied);
        Assert.Null(response.TreeJson);
        Assert.Equal(new[] { "Nombre y email", "Email y contraseña" }, response.Options);
    }

    [Fact]
    public async Task ExecuteAsync_OmitsOptionsWhenAnswerIsNotAQuestion()
    {
        var assistant = new StubAssistant("""{"reply":"Hecho."}""");
        var useCase = new AssistUseCase(assistant);

        var response = await useCase.ExecuteAsync(Request());

        Assert.Null(response.Options);
    }

    [Fact]
    public async Task ExecuteAsync_PassesStyleVocabularyInContext()
    {
        // El CSS del lienzo se compila en build-time: una utilidad fuera del
        // vocabulario no tiene regla y el bloque se renderiza sin ella, en
        // silencio. Si el vocabulario no llega al contexto, la IA escribe
        // Tailwind válido que el lienzo no sabe pintar.
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(new AssistRequest(
            "haz algo", Tree, null, null,
            StyleVocabularyJson: """{"grupos":[{"grupo":"Padding","utilidades":"p-N"}]}"""));

        var context = JsonDocument.Parse(assistant.LastContext!).RootElement;
        Assert.Equal(
            "p-N",
            context.GetProperty("styleVocabulary").GetProperty("grupos")[0].GetProperty("utilidades").GetString());
    }

    [Fact]
    public async Task ExecuteAsync_OmitsStyleVocabularyWhenNotProvided()
    {
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(Request());

        var context = JsonDocument.Parse(assistant.LastContext!).RootElement;
        Assert.False(context.TryGetProperty("styleVocabulary", out _));
    }

    // ── Imágenes, historial y tandas de varios componentes ──

    private const string PngBase64 = "iVBORw0KGgoAAAANSUhEUg==";

    // Los destinos viven en constantes porque sus llaves de cierre chocarían con
    // los delimitadores `{{ }}` de una cadena interpolada sin formato.
    private const string TargetExisting = """{"kind":"existing","libraryId":"lib-1"}""";
    private const string TargetNew = """{"kind":"new","libraryName":"Kit de Tienda"}""";
    private const string TargetUnknown = """{"kind":"al-servidor-de-al-lado"}""";

    [Fact]
    public async Task ExecuteAsync_PassesImagesAndHistoryToGenerator()
    {
        var assistant = new StubAssistant("""{"reply":"Veo 2 componentes."}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(Request() with
        {
            Images = [new AssistImage("image/png", PngBase64)],
            HistoryJson = """[{"role":"user","content":"hola"},{"role":"assistant","content":"dime"}]""",
        });

        Assert.Single(assistant.LastImages!);
        Assert.Equal("image/png", assistant.LastImages![0].MediaType);
        Assert.Equal(2, assistant.LastHistory!.Count);
        // El contexto anuncia que hubo imágenes aunque viajen como bloques aparte.
        var context = JsonDocument.Parse(assistant.LastContext!).RootElement;
        Assert.Equal(1, context.GetProperty("attachedImages").GetInt32());
    }

    [Fact]
    public async Task ExecuteAsync_DropsImagesWithUnsupportedMediaType()
    {
        // Un tipo que la API no acepta provocaría un 400 del proveedor a mitad de
        // conversación, con un mensaje que no apunta a su causa.
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(Request() with
        {
            Images = [new AssistImage("image/bmp", PngBase64), new AssistImage("image/png", PngBase64)],
        });

        Assert.Single(assistant.LastImages!);
        Assert.Equal("image/png", assistant.LastImages![0].MediaType);
    }

    [Fact]
    public async Task ExecuteAsync_DropsHistoryTurnsWithUnknownRole()
    {
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(Request() with
        {
            HistoryJson = """[{"role":"system","content":"x"},{"role":"user","content":"y"},{"role":"user","content":""}]""",
        });

        Assert.Single(assistant.LastHistory!);
        Assert.Equal("user", assistant.LastHistory![0].Role);
    }

    [Fact]
    public async Task ExecuteAsync_ParsesComponentBatch()
    {
        var useCase = new AssistUseCase(new StubAssistant(
            $$"""{"reply":"Creados 2.","components":[{"name":"Tarjeta","tree":{{Tree}}},{"tree":{{Tree}}}]}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.Equal(2, response.Components!.Count);
        Assert.Equal("Tarjeta", response.Components[0].Name);
        // Sin nombre se numera, para que el catálogo no muestre una ficha sin título.
        Assert.Equal("Componente 2", response.Components[1].Name);
        // La tanda no toca el lienzo abierto: son componentes nuevos del proyecto.
        Assert.False(response.Applied);
        Assert.Null(response.TreeJson);
    }

    [Fact]
    public async Task ExecuteAsync_ParsesBatchTarget()
    {
        // El destino tiene que llegar estructurado: es lo que hace que la
        // pregunta «¿dónde los guardo?» tenga efecto en vez de quedarse en el texto.
        var useCase = new AssistUseCase(new StubAssistant(
            $$"""{"reply":"ok","components":[{"name":"A","tree":{{Tree}}}],"target":{{TargetExisting}}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.Equal("existing", response.Target!.Kind);
        Assert.Equal("lib-1", response.Target.LibraryId);
    }

    [Fact]
    public async Task ExecuteAsync_ParsesNewLibraryTarget()
    {
        var useCase = new AssistUseCase(new StubAssistant(
            $$"""{"reply":"ok","components":[{"name":"A","tree":{{Tree}}}],"target":{{TargetNew}}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.Equal("new", response.Target!.Kind);
        Assert.Equal("Kit de Tienda", response.Target.LibraryName);
        Assert.Null(response.Target.LibraryId);
    }

    [Fact]
    public async Task ExecuteAsync_DegradesUnknownTargetToNone()
    {
        // Un destino ininteligible no puede tirar la tanda: los componentes se
        // crean igual y lo único que se pierde es la publicación, que se rehace.
        var useCase = new AssistUseCase(new StubAssistant(
            $$"""{"reply":"ok","components":[{"name":"A","tree":{{Tree}}}],"target":{{TargetUnknown}}}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.Equal("none", response.Target!.Kind);
        Assert.Single(response.Components!);
    }

    [Fact]
    public async Task ExecuteAsync_DropsMalformedComponentsFromBatch()
    {
        // Un elemento roto no puede tirar la tanda entera: se descarta solo él.
        // El árbol sin `rootIds` va en su propia constante: intercalarlo en la
        // cadena interpolada chocaría con los delimitadores `{{ }}`.
        const string sinRaices = """{"name":"Roto","tree":{"blocks":{}}}""";
        var useCase = new AssistUseCase(new StubAssistant(
            $$"""{"reply":"ok","components":[{{sinRaices}},{"name":"Bueno","tree":{{Tree}}}]}"""));

        var response = await useCase.ExecuteAsync(Request());

        Assert.Single(response.Components!);
        Assert.Equal("Bueno", response.Components![0].Name);
    }

    [Fact]
    public async Task ExecuteAsync_PassesLibrariesAndProjectInContext()
    {
        var assistant = new StubAssistant("""{"reply":"ok"}""");
        var useCase = new AssistUseCase(assistant);

        await useCase.ExecuteAsync(Request() with
        {
            LibrariesJson = """[{"id":"lib-1","name":"Mi Kit"}]""",
            ProjectJson = """{"name":"Proyecto","components":["Cabecera"]}""",
        });

        var context = JsonDocument.Parse(assistant.LastContext!).RootElement;
        Assert.Equal("Mi Kit", context.GetProperty("libraries")[0].GetProperty("name").GetString());
        Assert.Equal("Proyecto", context.GetProperty("project").GetProperty("name").GetString());
    }

    /// <summary>
    /// El proveedor de IA no disponible se CONTESTA, no se propaga.
    /// </summary>
    /// <remarks>
    /// Con una clave inválida la excepción subía hasta el manejador global y salía
    /// como un 500; en el chat solo se leía «Backend respondió 500 en POST
    /// /api/components/assist». Es una condición conocida con algo útil que decir, y
    /// el sitio donde decirlo es la conversación. `Applied` en falso garantiza
    /// además que el lienzo se queda como estaba.
    /// </remarks>
    [Fact]
    public async Task ExecuteAsync_GeneratorUnavailableAnswersInTheChat()
    {
        var useCase = new AssistUseCase(new UnavailableAssistant());

        var response = await useCase.ExecuteAsync(Request());

        Assert.False(response.Applied);
        Assert.Null(response.TreeJson);
        Assert.Contains("ANTHROPIC_API_KEY", response.Reply);
    }

    /// <summary>Generador cuyo proveedor rechaza la clave.</summary>
    private sealed class UnavailableAssistant : IComponentGenerator
    {
        public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> AssistAsync(string contextJson, string message, CancellationToken cancellationToken = default)
            => throw ComponentGeneratorUnavailableException.BadKey(new InvalidOperationException("401"));
    }

    /// <summary>Generador que devuelve una respuesta de asistente fija.</summary>
    private sealed class StubAssistant : IComponentGenerator
    {
        private readonly string _response;
        public StubAssistant(string response) => _response = response;

        /// <summary>Contexto recibido en la última llamada, para poder afirmarlo.</summary>
        public string? LastContext { get; private set; }

        /// <summary>Imágenes e historial que llegaron al generador ya saneados.</summary>
        public IReadOnlyList<AssistImage>? LastImages { get; private set; }
        public IReadOnlyList<AssistTurn>? LastHistory { get; private set; }

        public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<string> AssistAsync(string contextJson, string message, CancellationToken cancellationToken = default)
        {
            LastContext = contextJson;
            return Task.FromResult(_response);
        }

        public Task<string> AssistAsync(
            string contextJson,
            string message,
            IReadOnlyList<AssistImage>? images,
            IReadOnlyList<AssistTurn>? history,
            CancellationToken cancellationToken = default)
        {
            LastImages = images;
            LastHistory = history;
            return AssistAsync(contextJson, message, cancellationToken);
        }
    }
}
