namespace Visualiza.Infrastructure.Configuration;

public sealed class AnthropicOptions
{
    public const string SectionName = "Anthropic";

    public string Model { get; init; } = "claude-opus-4-8";
    public string ApiKey { get; init; } = string.Empty;
    public bool UseMock { get; init; } = true;
}
