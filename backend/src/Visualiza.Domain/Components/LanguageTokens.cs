namespace Visualiza.Domain.Components;

public static class LanguageTokens
{
    /// <summary>Token de lenguaje persistido junto al código (también extensión de fichero sugerida).</summary>
    public static string For(TargetFramework framework, CodeLanguage language) => framework switch
    {
        TargetFramework.React => language == CodeLanguage.TypeScript ? "tsx" : "jsx",
        TargetFramework.Vue2 or TargetFramework.Vue3 => "vue",
        TargetFramework.Angular => "ts",
        _ => "tsx"
    };
}
