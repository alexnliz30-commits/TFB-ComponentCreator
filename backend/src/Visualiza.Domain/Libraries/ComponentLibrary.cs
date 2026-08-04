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

    /// <summary>
    /// Tema de la librería (roles de color, tipografía y forma), serializado.
    /// </summary>
    /// <remarks>
    /// Es lo que convierte a la librería en un kit y no en una bolsa de piezas
    /// sueltas: sus componentes lo consumen por rol, así que cambiarlo aquí
    /// repinta todos a la vez.
    /// <para>
    /// Vive en la librería y no en el proyecto local del navegador, que es donde
    /// estaba antes. Con aquello, abrir la misma librería desde otro navegador
    /// —o después de limpiar el almacenamiento— la pintaba con el tema por
    /// defecto: los «estilos globales de la librería» no eran de la librería.
    /// </para>
    /// Nulo en las creadas antes de este campo; entonces se aplica el tema por
    /// defecto, igual que antes.
    /// </remarks>
    public string? ThemeJson { get; private set; }

    /// <summary>
    /// Hoja de estilos global de la librería: CSS libre que comparten todos sus
    /// componentes, además de los roles del tema.
    /// </summary>
    /// <remarks>
    /// Se emite en la capa <c>vz-global</c>, por delante de los estilos propios
    /// de cada componente. Un componente solo la pisa si marca la declaración
    /// con <c>!propio</c>, de modo que desviarse del kit es una decisión escrita
    /// y no un accidente.
    /// </remarks>
    public string? GlobalStyles { get; private set; }

    public ComponentLibrary(string name, TargetFramework framework, CodeLanguage language, string? description = null)
        : this(Guid.NewGuid(), name, framework, language, description, DateTime.UtcNow)
    {
    }

    public ComponentLibrary(
        Guid id,
        string name,
        TargetFramework framework,
        CodeLanguage language,
        string? description,
        DateTime createdAt,
        string? themeJson = null,
        string? globalStyles = null)
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
        ThemeJson = Blank(themeJson);
        GlobalStyles = Blank(globalStyles);
    }

    /// <summary>Sustituye los estilos globales de la librería.</summary>
    /// <remarks>
    /// Ambos son opcionales por separado: guardar solo el tema desde el panel de
    /// estilos no debe borrar la hoja global, ni al revés.
    /// </remarks>
    public void SetGlobalStyles(string? themeJson, string? globalStyles)
    {
        ThemeJson = Blank(themeJson) ?? ThemeJson;
        GlobalStyles = Blank(globalStyles) ?? GlobalStyles;
    }

    /// <summary>Vacía la hoja global (distinto de «no tocarla»).</summary>
    public void ClearGlobalStylesSheet() => GlobalStyles = null;

    private static string? Blank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
