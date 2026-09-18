using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Visualiza.Application.Components;
using Visualiza.Domain.Components;

namespace Visualiza.Api.Tests;

/// <summary>
/// Códigos de acceso por proyecto (RF11).
/// </summary>
/// <remarks>
/// Lo que se comprueba aquí es el ciclo completo tal como lo recorre una persona:
/// crear un proyecto sin traer ninguna llave, recibir la suya, volver con ella, y
/// poder cambiarla si se pierde. Antes el código era uno solo y venía de la
/// configuración, así que el primer paso —crear— exigía ya saberse la respuesta.
/// </remarks>
public class ProjectAccessEndpointTests : IClassFixture<VisualizaApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    private readonly VisualizaApiFactory _factory;

    public ProjectAccessEndpointTests(VisualizaApiFactory factory)
    {
        _factory = factory;
    }

    private sealed record CreatedProject(Guid ProjectId, string Name, string AccessCode, string Token, int ExpiresInMinutes);
    private sealed record AccessToken(string Token, int ExpiresInMinutes);
    private sealed record ProjectCode(string AccessCode);

    private async Task<CreatedProject> CreateProjectAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/access/projects", new { name });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreatedProject>(JsonOpts))!;
    }

    [Fact]
    public async Task CreateProject_IsOpen_AndReturnsACodeAndAUsableToken()
    {
        // Sin cabecera de autorización: es el caso que estaba roto, porque el
        // único código existente había que conocerlo de antemano.
        var client = _factory.CreateClient();

        var created = await CreateProjectAsync(client, "Kit de prueba");

        Assert.NotEqual(Guid.Empty, created.ProjectId);
        Assert.False(string.IsNullOrWhiteSpace(created.AccessCode));
        Assert.False(string.IsNullOrWhiteSpace(created.Token));

        // El token que viene con el alta abre ya el constructor: quien acaba de
        // crear el proyecto no tiene que teclear lo que se le acaba de enseñar.
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", created.Token);
        var generate = await client.PostAsJsonAsync(
            "/api/components/generate",
            new GenerateComponentRequest(ComponentType.RegistrationForm, "alta de usuario"));

        Assert.Equal(HttpStatusCode.OK, generate.StatusCode);
    }

    [Fact]
    public async Task CreateProject_RejectsEmptyName()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/access/projects", new { name = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task OpenProject_AcceptsItsOwnCode()
    {
        var client = _factory.CreateClient();
        var created = await CreateProjectAsync(client, "Abrir con su código");

        var response = await client.PostAsJsonAsync(
            $"/api/access/projects/{created.ProjectId}", new { accessCode = created.AccessCode });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = await response.Content.ReadFromJsonAsync<AccessToken>(JsonOpts);
        Assert.False(string.IsNullOrWhiteSpace(token!.Token));
    }

    [Fact]
    public async Task OpenProject_AcceptsItsCodeInLowercaseAndWithSpaces()
    {
        // Se enseña en mayúsculas y se copia a mano: exigir la caja exacta
        // convertiría un código correcto en un rechazo sin explicación.
        var client = _factory.CreateClient();
        var created = await CreateProjectAsync(client, "Tecleado a mano");

        var response = await client.PostAsJsonAsync(
            $"/api/access/projects/{created.ProjectId}",
            new { accessCode = $"  {created.AccessCode.ToLowerInvariant()}  " });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task OpenProject_RejectsTheCodeOfAnotherProject()
    {
        var client = _factory.CreateClient();
        var uno = await CreateProjectAsync(client, "Proyecto uno");
        var otro = await CreateProjectAsync(client, "Proyecto dos");

        var response = await client.PostAsJsonAsync(
            $"/api/access/projects/{uno.ProjectId}", new { accessCode = otro.AccessCode });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task OpenProject_RejectsUnknownProject_WithoutRevealingThatItDoesNotExist()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            $"/api/access/projects/{Guid.NewGuid()}", new { accessCode = "XXXX-XXXX-XXXX" });

        // 401 y no 404: decir «ese proyecto no existe» le confirmaría a quien
        // prueba identificadores cuáles sí existen.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MasterCode_OpensTheBuilder_ForAnyProject()
    {
        // La llave maestra sigue existiendo: es la salida cuando se pierde el
        // código de un proyecto, que al enseñarse una sola vez es un final posible.
        var client = _factory.CreateClient();
        await CreateProjectAsync(client, "Con maestra");

        var response = await client.PostAsJsonAsync(
            "/api/access/designer", new { accessCode = VisualizaApiFactory.DesignerAccessCode });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task RegenerateCode_InvalidatesThePreviousOne()
    {
        var client = _factory.CreateClient();
        var created = await CreateProjectAsync(client, "Cambio de cerradura");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", created.Token);

        var rotated = await client.PostAsync($"/api/access/projects/{created.ProjectId}/code", null);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var nuevo = await rotated.Content.ReadFromJsonAsync<ProjectCode>(JsonOpts);
        Assert.NotEqual(created.AccessCode, nuevo!.AccessCode);

        var anonymous = _factory.CreateClient();
        var conElViejo = await anonymous.PostAsJsonAsync(
            $"/api/access/projects/{created.ProjectId}", new { accessCode = created.AccessCode });
        var conElNuevo = await anonymous.PostAsJsonAsync(
            $"/api/access/projects/{created.ProjectId}", new { accessCode = nuevo.AccessCode });

        Assert.Equal(HttpStatusCode.Unauthorized, conElViejo.StatusCode);
        Assert.Equal(HttpStatusCode.OK, conElNuevo.StatusCode);
    }

    [Fact]
    public async Task RegenerateCode_RejectsAnonymousCallers()
    {
        // Si no, sería una puerta trasera: cualquiera podría echar al dueño de su
        // propio proyecto pidiendo un código nuevo.
        var client = _factory.CreateClient();
        var created = await CreateProjectAsync(client, "Sin permiso");

        var response = await client.PostAsync($"/api/access/projects/{created.ProjectId}/code", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteProject_RemovesItsCode()
    {
        var client = _factory.CreateClient();
        var created = await CreateProjectAsync(client, "Para borrar");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", created.Token);

        var deleted = await client.DeleteAsync($"/api/access/projects/{created.ProjectId}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var anonymous = _factory.CreateClient();
        var reopen = await anonymous.PostAsJsonAsync(
            $"/api/access/projects/{created.ProjectId}", new { accessCode = created.AccessCode });

        Assert.Equal(HttpStatusCode.Unauthorized, reopen.StatusCode);
    }

    [Fact]
    public async Task IssuedCodes_AreDistinct()
    {
        // Un código repetido abriría el proyecto de otro. Diez altas no prueban la
        // aleatoriedad, pero sí cazarían una constante o un contador.
        var client = _factory.CreateClient();
        var codes = new List<string>();
        for (var i = 0; i < 10; i++)
            codes.Add((await CreateProjectAsync(client, $"Proyecto {i}")).AccessCode);

        Assert.Equal(codes.Count, codes.Distinct().Count());
    }
}
