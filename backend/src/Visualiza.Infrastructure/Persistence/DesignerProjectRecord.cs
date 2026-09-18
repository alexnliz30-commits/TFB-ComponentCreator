namespace Visualiza.Infrastructure.Persistence;

public sealed class DesignerProjectRecord
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Hash del código de acceso; el código en claro no se guarda nunca.</summary>
    public string CodeHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
