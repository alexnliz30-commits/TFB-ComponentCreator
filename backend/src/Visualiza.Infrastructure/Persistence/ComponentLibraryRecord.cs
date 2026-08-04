namespace Visualiza.Infrastructure.Persistence;

public sealed class ComponentLibraryRecord
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Framework { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    /// <summary>Tema de la librería serializado. Nulo en las anteriores al campo.</summary>
    public string? ThemeJson { get; set; }

    /// <summary>Hoja de estilos global de la librería. Nula si no tiene.</summary>
    public string? GlobalStyles { get; set; }
}
