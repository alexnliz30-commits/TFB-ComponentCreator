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
        var client = _factory.CreateClient();

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
        var client = _factory.CreateClient();

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
        var client = _factory.CreateClient();

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
        var client = _factory.CreateClient();

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

    [Fact]
    public async Task PatchBlock_ReportsNotApplied_WhenNothingMatches()
    {
        var client = _factory.CreateClient();

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
