using Visualiza.Domain.Components;

namespace Visualiza.Domain.Libraries;

public sealed class ComponentLibrary
{
    public Guid Id { get; }
    public string Name { get; }
    public string Description { get; }
    public TargetFramework Framework { get; }
    public CodeLanguage Language { get; }
    public DateTime CreatedAt { get; }

    public ComponentLibrary(string name, TargetFramework framework, CodeLanguage language, string? description = null)
        : this(Guid.NewGuid(), name, framework, language, description, DateTime.UtcNow)
    {
    }

    public ComponentLibrary(Guid id, string name, TargetFramework framework, CodeLanguage language, string? description, DateTime createdAt)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Library name cannot be empty.", nameof(name));
        if (framework == TargetFramework.Angular && language == CodeLanguage.JavaScript)
            throw new ArgumentException("Angular (moderno) requiere TypeScript: elige TypeScript como lenguaje de la librería.", nameof(language));

        Id = id;
        Name = name.Trim();
        Description = description?.Trim() ?? string.Empty;
        Framework = framework;
        Language = language;
        CreatedAt = createdAt;
    }
}
