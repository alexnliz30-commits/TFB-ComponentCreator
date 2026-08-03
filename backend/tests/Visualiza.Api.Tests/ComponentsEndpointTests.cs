using System.Net.Http.Headers;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
using Visualiza.Domain.Components;
using Visualiza.Infrastructure.Persistence;

namespace Visualiza.Api.Tests;

public class ComponentsEndpointTests : IClassFixture<VisualizaApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly VisualizaApiFactory _factory;

    public ComponentsEndpointTests(VisualizaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Generate_ReturnsOk_WithMockSourceAndCompilationFlag()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/components/generate",
            new GenerateComponentRequest(ComponentType.RegistrationForm, "user signup"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GenerateComponentResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.Equal(ComponentType.RegistrationForm, body!.Type);
        Assert.False(string.IsNullOrWhiteSpace(body.SourceCode));
        Assert.True(body.Compiled);
    }

    [Fact]
    public async Task PatchBlock_ReturnsSanitizedPatch()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/components/patch-block",
            new PatchBlockRequest(
                "button",
                """{"text":"Aceptar"}""",
                """[{"name":"abierto","type":"boolean","initial":"false"}]""",
                "ponlo rojo"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PatchBlockResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.True(body!.Applied);
        // El generador mock deduce el color por palabra clave; basta con comprobar que
        // el parche llega hasta aquí bien formado y con la clase aplicada.
        Assert.Contains("bg-red-600", body.PatchJson);
    }

    [Fact]
    public async Task Stylesheet_ReturnsGeneratedCss()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/components/stylesheet",
            new CompileStylesheetRequest("<div className=\"p-4\" />", null, "css"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CompileStylesheetResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.True(body!.Generated);
        Assert.Contains("visualiza-component", body.Css);
    }

    [Fact]
    public async Task Assist_ReturnsReply_WithMockGenerator()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/components/assist",
            new AssistRequest(
                "pon el título en rojo",
                """{"blocks":{},"rootIds":[],"stateVars":[]}""",
                null,
                null,
                """[{"type":"h1","label":"Título","isContainer":false,"defaultProps":{"text":"Título"}}]"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AssistResponse>(JsonOpts);
        Assert.NotNull(body);
        // El mock no modifica el árbol: responde texto explicando el modo demo.
        Assert.False(body!.Applied);
        Assert.False(string.IsNullOrWhiteSpace(body.Reply));
    }

    // ── Acceso al constructor (RF11) ──

    [Theory]
    [InlineData("/api/components/generate")]
    [InlineData("/api/components/refine")]
    [InlineData("/api/components/patch-block")]
    [InlineData("/api/components/assist")]
    [InlineData("/api/components/stylesheet")]
    public async Task DesignerEndpoints_RejectAnonymousCallers(string path)
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(path, new { });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DesignerEndpoints_RejectParticipantTokens()
    {
        // Un token de sesión del experimento está firmado con la misma clave,
        // así que la firma es válida: lo que lo separa es el rol. Sin esta
        // comprobación, cualquier participante podría gastar la cuota de la IA.
        var client = _factory.CreateClient();
        var start = await client.PostAsJsonAsync(
            "/api/sessions/start", new Visualiza.Application.Experiment.StartSessionRequest("P-RF11"));
        start.EnsureSuccessStatusCode();
        var session = await start.Content
            .ReadFromJsonAsync<Visualiza.Application.Experiment.StartSessionResponse>(JsonOpts);

        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session!.Token);

        var response = await client.PostAsJsonAsync(
            "/api/components/generate",
            new GenerateComponentRequest(ComponentType.RegistrationForm, "x"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task DesignerAccess_RejectsWrongCode()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/access/designer", new { accessCode = "no-es-el-codigo" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PatchBlock_ReportsNotApplied_WhenNothingMatches()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/components/patch-block",
            new PatchBlockRequest("button", "{}", "[]", "instrucción que el mock no entiende"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<PatchBlockResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.False(body!.Applied);
        Assert.Equal("{}", body.PatchJson);
    }
}

public sealed class VisualizaApiFactory : WebApplicationFactory<Program>
{
    /// <summary>Código de acceso del diseñador en la suite (RF11).</summary>
    public const string DesignerAccessCode = "test-designer-code";

    /// <summary>
    /// Cliente ya autenticado como diseñador.
    /// </summary>
    /// <remarks>
    /// Canjea el código por un token real contra el propio endpoint en vez de
    /// firmar uno a mano: así la suite ejercita el canje de verdad y no puede
    /// pasar con un token que la aplicación no habría emitido.
    /// </remarks>
    public async Task<HttpClient> CreateDesignerClientAsync()
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/access/designer", new { accessCode = DesignerAccessCode });
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<DesignerTokenResponse>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    private sealed record DesignerTokenResponse(string Token, int ExpiresInMinutes);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var apiProjectPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "Visualiza.Api"));
        builder.UseContentRoot(apiProjectPath);
        builder.UseEnvironment("Testing");

        // UseSetting llega a builder.Configuration antes de que Program registre los
        // servicios (ConfigureAppConfiguration se aplicaría demasiado tarde para la
        // validación de la connection string en AddInfrastructure).
        builder.UseSetting("ConnectionStrings:Postgres", "Host=ignored;Database=ignored;Username=ignored;Password=ignored");
        builder.UseSetting("Anthropic:UseMock", "true");
        builder.UseSetting("Jwt:Issuer", "visualiza-test");
        builder.UseSetting("Jwt:Audience", "visualiza-test-client");
        builder.UseSetting("Jwt:Secret", "test-secret-key-please-rotate-32+chars");
        builder.UseSetting("Designer:AccessCode", DesignerAccessCode);

        var dbName = $"visualiza-tests-{Guid.NewGuid():N}";
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<VisualizaDbContext>>();
            services.RemoveAll<VisualizaDbContext>();
            services.AddDbContext<VisualizaDbContext>(opts =>
                opts.UseInMemoryDatabase(dbName));

            services.RemoveAll<ITsxCompilationChecker>();
            services.AddSingleton<ITsxCompilationChecker>(new AlwaysSuccessChecker());

            // El compilador real invoca Tailwind por npx, lo que implica red y varios
            // segundos: se sustituye por un doble para que la suite siga siendo rápida
            // y determinista. La invocación real se valida aparte, en el host.
            services.RemoveAll<IStylesheetCompiler>();
            services.AddSingleton<IStylesheetCompiler>(new FakeStylesheetCompiler());
        });
    }

    private sealed class AlwaysSuccessChecker : ITsxCompilationChecker
    {
        public Task<TsxCompilationResult> CheckAsync(string sourceCode, CancellationToken cancellationToken = default)
            => Task.FromResult(new TsxCompilationResult(true, null));
    }

    private sealed class FakeStylesheetCompiler : IStylesheetCompiler
    {
        public Task<StylesheetResult> CompileAsync(
            string markup, string? customStyles, bool stylesAreSass, CancellationToken cancellationToken = default)
            => Task.FromResult(new StylesheetResult(".visualiza-component{padding:1rem}", null));
    }
}
