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
        var client = _factory.CreateClient();

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
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/libraries",
            new { name = "Angular JS", framework = "Angular", language = "JavaScript" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SaveComponent_Returns404_WhenLibraryDoesNotExist()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            $"/api/libraries/{Guid.NewGuid()}/components",
            new { name = "X", sourceCode = "y" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
