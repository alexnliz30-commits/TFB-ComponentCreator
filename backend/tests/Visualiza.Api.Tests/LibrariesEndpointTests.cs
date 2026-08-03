using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Visualiza.Application.Libraries;

namespace Visualiza.Api.Tests;

public class LibrariesEndpointTests : IClassFixture<VisualizaApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly VisualizaApiFactory _factory;

    public LibrariesEndpointTests(VisualizaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Create_List_SaveComponent_And_Delete_FullFlow()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var createResponse = await client.PostAsJsonAsync(
            "/api/libraries",
            new { name = "UI Vue", framework = "Vue3", language = "TypeScript", description = "Colección Vue 3" });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var library = (await createResponse.Content.ReadFromJsonAsync<LibraryResponse>(JsonOpts))!;
        Assert.Equal("UI Vue", library.Name);
        Assert.Equal(0, library.ComponentCount);

        var listResponse = await client.GetFromJsonAsync<List<LibraryResponse>>("/api/libraries", JsonOpts);
        Assert.NotNull(listResponse);
        Assert.Contains(listResponse!, l => l.Id == library.Id);

        var saveResponse = await client.PostAsJsonAsync(
            $"/api/libraries/{library.Id}/components",
            new { name = "Card de producto", sourceCode = "<template><div/></template>" });
        Assert.Equal(HttpStatusCode.Created, saveResponse.StatusCode);
        var saved = (await saveResponse.Content.ReadFromJsonAsync<SavedComponentResponse>(JsonOpts))!;

        var detail = await client.GetFromJsonAsync<LibraryDetailResponse>($"/api/libraries/{library.Id}", JsonOpts);
        Assert.NotNull(detail);
        Assert.Single(detail!.Components);
        Assert.Equal(1, detail.Library.ComponentCount);

        var deleteResponse = await client.DeleteAsync($"/api/libraries/{library.Id}/components/{saved.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
    }

    [Fact]
    public async Task Create_Returns400_WhenAngularWithJavaScript()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            "/api/libraries",
            new { name = "Angular JS", framework = "Angular", language = "JavaScript" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SaveComponent_Returns404_WhenLibraryDoesNotExist()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.PostAsJsonAsync(
            $"/api/libraries/{Guid.NewGuid()}/components",
            new { name = "X", sourceCode = "y" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SaveComponent_RevisesInsteadOfDuplicating()
    {
        // Guardar desde el constructor ocurre muchas veces sobre el mismo
        // componente. Dando siempre de alta, la librería acumulaba copias con el
        // mismo nombre y dejaba de poder leerse como catálogo.
        var client = await _factory.CreateDesignerClientAsync();
        var library = await CreateLibraryAsync(client, "Kit React");

        var first = await client.PostAsJsonAsync(
            $"/api/libraries/{library.Id}/components",
            new { name = "Botón", sourceCode = "v1", treeJson = """{"rootIds":["block-1"]}""" });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var created = (await first.Content.ReadFromJsonAsync<SavedComponentResponse>(JsonOpts))!;
        Assert.True(created.Editable);

        // Por id conocido: es lo que envía el constructor tras el primer guardado.
        var second = await client.PostAsJsonAsync(
            $"/api/libraries/{library.Id}/components",
            new { name = "Botón", sourceCode = "v2", treeJson = """{"rootIds":["block-2"]}""", componentId = created.Id });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var revised = (await second.Content.ReadFromJsonAsync<SavedComponentResponse>(JsonOpts))!;
        Assert.Equal(created.Id, revised.Id);

        // Sin id, la coincidencia por nombre evita la copia cuando un proyecto
        // local publica por primera vez en una librería que ya lo tenía.
        var third = await client.PostAsJsonAsync(
            $"/api/libraries/{library.Id}/components",
            new { name = "botón", sourceCode = "v3" });
        Assert.Equal(HttpStatusCode.OK, third.StatusCode);

        var detail = await client.GetFromJsonAsync<LibraryDetailResponse>($"/api/libraries/{library.Id}", JsonOpts);
        var component = Assert.Single(detail!.Components);
        Assert.Equal("v3", component.SourceCode);
        Assert.Equal(1, detail.Library.ComponentCount);
    }

    [Fact]
    public async Task SaveComponent_WithoutTree_IsNotEditable()
    {
        // Los componentes generados como código no tienen árbol: el catálogo debe
        // ofrecerlos para ver y descargar, pero no para editar en el constructor,
        // que abriría en blanco.
        var client = await _factory.CreateDesignerClientAsync();
        var library = await CreateLibraryAsync(client, "Kit sin árbol");

        var response = await client.PostAsJsonAsync(
            $"/api/libraries/{library.Id}/components",
            new { name = "Generado", sourceCode = "export function App() { return null; }" });

        var saved = (await response.Content.ReadFromJsonAsync<SavedComponentResponse>(JsonOpts))!;
        Assert.Null(saved.TreeJson);
        Assert.False(saved.Editable);
    }

    [Fact]
    public async Task DeleteLibrary_RemovesLibraryAndItsComponents()
    {
        var client = await _factory.CreateDesignerClientAsync();
        var library = await CreateLibraryAsync(client, "Kit desechable");
        await client.PostAsJsonAsync(
            $"/api/libraries/{library.Id}/components",
            new { name = "Botón", sourceCode = "v1" });

        var deleted = await client.DeleteAsync($"/api/libraries/{library.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var detail = await client.GetAsync($"/api/libraries/{library.Id}");
        Assert.Equal(HttpStatusCode.NotFound, detail.StatusCode);

        // Los componentes se borran explícitamente: el ON DELETE CASCADE es de
        // PostgreSQL y el proveedor InMemory de estos tests no lo aplica, así que
        // sin ese borrado la suite pasaría y quedarían filas huérfanas.
        var reuse = await CreateLibraryAsync(client, "Kit desechable");
        var reuseDetail = await client.GetFromJsonAsync<LibraryDetailResponse>($"/api/libraries/{reuse.Id}", JsonOpts);
        Assert.Empty(reuseDetail!.Components);
    }

    [Fact]
    public async Task DeleteLibrary_Returns404_WhenMissing()
    {
        var client = await _factory.CreateDesignerClientAsync();

        var response = await client.DeleteAsync($"/api/libraries/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<LibraryResponse> CreateLibraryAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/libraries",
            new { name, framework = "React", language = "TypeScript" });
        return (await response.Content.ReadFromJsonAsync<LibraryResponse>(JsonOpts))!;
    }
}
