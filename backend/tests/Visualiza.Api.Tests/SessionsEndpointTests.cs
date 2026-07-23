using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Visualiza.Api.Controllers;
using Visualiza.Application.Experiment;
using Visualiza.Domain.Components;
using Visualiza.Domain.Experiment;

namespace Visualiza.Api.Tests;

public class SessionsEndpointTests : IClassFixture<VisualizaApiFactory>
{
    private readonly VisualizaApiFactory _factory;

    public SessionsEndpointTests(VisualizaApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Start_ReturnsToken_ForNewParticipant()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/sessions/start",
            new StartSessionRequest("P001"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(body);
        Assert.NotEqual(Guid.Empty, body!.SessionId);
        Assert.False(string.IsNullOrWhiteSpace(body.Token));
    }

    [Fact]
    public async Task RecordSus_PersistsAndReturnsScore_WhenAuthenticated()
    {
        var client = _factory.CreateClient();

        var startResponse = await client.PostAsJsonAsync(
            "/api/sessions/start",
            new StartSessionRequest("P002"));
        startResponse.EnsureSuccessStatusCode();
        var start = (await startResponse.Content.ReadFromJsonAsync<StartSessionResponse>())!;

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", start.Token);

        var susResponse = await client.PostAsJsonAsync(
            $"/api/sessions/{start.SessionId}/sus",
            new RecordSusInput(ComponentType.RegistrationForm, Condition.Ai,
                new[] { 5, 1, 5, 1, 5, 1, 5, 1, 5, 1 }));

        Assert.Equal(HttpStatusCode.OK, susResponse.StatusCode);
        var sus = await susResponse.Content.ReadFromJsonAsync<RecordSusResponse>();
        Assert.NotNull(sus);
        Assert.Equal(100.0, sus!.Score, precision: 5);
    }

    [Fact]
    public async Task RecordTask_Returns401_WithoutToken()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            $"/api/sessions/{Guid.NewGuid()}/tasks",
            new RecordTaskInput(ComponentType.DataTable, Condition.Human, 1000, 0, true));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
