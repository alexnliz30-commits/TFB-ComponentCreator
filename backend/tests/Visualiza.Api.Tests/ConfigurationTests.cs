using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Visualiza.Infrastructure.Configuration;
using Visualiza.Infrastructure.Experiment;

namespace Visualiza.Api.Tests;

/// <summary>
/// Comprobaciones sobre el <c>appsettings.json</c> que se publica en el repositorio.
///
/// Existen por un fallo real: al sanear el fichero para hacer público el repositorio se
/// vaciaron también valores que no son secretos (<c>Jwt:Issuer</c>, <c>Jwt:Audience</c>,
/// <c>Anthropic:Model</c>). Como <see cref="JwtOptions"/> tiene valores por defecto
/// razonables, escribir cadenas vacías es peor que omitir las claves: las sobreescribe.
/// El resultado era que <see cref="JwtTokenService"/> abortaba y el flujo del experimento
/// no arrancaba en un clon recién hecho.
/// </summary>
public class ConfigurationTests
{
    private static IConfigurationRoot LoadAppSettings()
    {
        var apiProjectPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "Visualiza.Api"));

        return new ConfigurationBuilder()
            .SetBasePath(apiProjectPath)
            .AddJsonFile("appsettings.json", optional: false)
            .Build();
    }

    [Fact]
    public void AppSettings_DoesNotBlankNonSecretJwtValues()
    {
        var options = LoadAppSettings().GetSection(JwtOptions.SectionName).Get<JwtOptions>();

        Assert.NotNull(options);
        Assert.False(string.IsNullOrWhiteSpace(options!.Issuer), "Jwt:Issuer no debe quedar vacío: no es un secreto.");
        Assert.False(string.IsNullOrWhiteSpace(options.Audience), "Jwt:Audience no debe quedar vacío: no es un secreto.");
    }

    [Fact]
    public void AppSettings_KeepsOpenAiModel()
    {
        // El nombre del modelo no es un secreto y sin él la generación real falla.
        var model = LoadAppSettings()["Anthropic:Model"];

        Assert.False(string.IsNullOrWhiteSpace(model));
    }

    [Fact]
    public void AppSettings_DoesNotShipJwtSecret()
    {
        // Este sí es un secreto: debe llegar por entorno, nunca versionado.
        var secret = LoadAppSettings()["Jwt:Secret"];

        Assert.True(string.IsNullOrEmpty(secret), "Jwt:Secret no debe versionarse en appsettings.json.");
    }

    [Fact]
    public void DevelopmentSettings_ProvideUsableJwtSecret()
    {
        // Cubre dos cosas: que el fichero de desarrollo se parsea (lleva comentarios,
        // que el proveedor JSON de .NET admite pero un parser estricto no) y que su
        // secreto cumple el mínimo que exige JwtTokenService, para que `dotnet run`
        // en local arranque sin configuración extra.
        var apiProjectPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "Visualiza.Api"));

        var config = new ConfigurationBuilder()
            .SetBasePath(apiProjectPath)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: false)
            .Build();

        var options = config.GetSection(JwtOptions.SectionName).Get<JwtOptions>()!;

        Assert.True(options.Secret.Length >= 32);
        Assert.Null(Record.Exception(() => new JwtTokenService(Options.Create(options))));
    }

    [Fact]
    public void JwtTokenService_Constructs_WhenSecretComesFromEnvironment()
    {
        // Reproduce lo que hace docker-compose: el secreto entra por variable de entorno
        // sobre la configuración del fichero.
        var config = new ConfigurationBuilder()
            .AddConfiguration(LoadAppSettings())
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "dev-only-insecure-secret-32-chars-min"
            })
            .Build();

        var options = config.GetSection(JwtOptions.SectionName).Get<JwtOptions>()!;

        var exception = Record.Exception(() => new JwtTokenService(Options.Create(options)));

        Assert.Null(exception);
    }
}
