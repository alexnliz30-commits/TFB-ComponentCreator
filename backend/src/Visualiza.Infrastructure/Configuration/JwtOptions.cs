namespace Visualiza.Infrastructure.Configuration;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; init; } = "visualiza";
    public string Audience { get; init; } = "visualiza-client";
    public string Secret { get; init; } = string.Empty;
    public int TtlMinutes { get; init; } = 120;
}
