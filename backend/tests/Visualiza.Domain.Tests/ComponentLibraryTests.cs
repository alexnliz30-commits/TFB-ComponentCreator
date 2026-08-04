using Visualiza.Domain.Components;
using Visualiza.Domain.Libraries;

namespace Visualiza.Domain.Tests;

public class ComponentLibraryTests
{
    [Fact]
    public void Constructor_CreatesLibrary_WithTrimmedNameAndDefaults()
    {
        var library = new ComponentLibrary("  Mi librería  ", TargetFramework.Vue3, CodeLanguage.JavaScript);

        Assert.NotEqual(Guid.Empty, library.Id);
        Assert.Equal("Mi librería", library.Name);
        Assert.Equal(TargetFramework.Vue3, library.Framework);
        Assert.Equal(CodeLanguage.JavaScript, library.Language);
        Assert.Equal(string.Empty, library.Description);
    }

    [Fact]
    public void Constructor_Throws_WhenNameIsEmpty()
    {
        Assert.Throws<ArgumentException>(() =>
            new ComponentLibrary("   ", TargetFramework.React, CodeLanguage.TypeScript));
    }

    [Fact]
    public void Constructor_Throws_WhenAngularWithJavaScript()
    {
        Assert.Throws<ArgumentException>(() =>
            new ComponentLibrary("Angular JS lib", TargetFramework.Angular, CodeLanguage.JavaScript));
    }

    [Fact]
    public void Constructor_Allows_AngularWithTypeScript()
    {
        var library = new ComponentLibrary("Angular lib", TargetFramework.Angular, CodeLanguage.TypeScript);
        Assert.Equal(TargetFramework.Angular, library.Framework);
    }

    [Fact]
    public void SavedComponent_Throws_WhenSourceCodeIsEmpty()
    {
        Assert.Throws<ArgumentException>(() =>
            new SavedComponent(Guid.NewGuid(), "Botón", "  "));
    }

    [Fact]
    public void SavedComponent_NormalizesBlankTreeToNull()
    {
        // `TreeJson` distingue «editable en el constructor» de «solo código», así
        // que una cadena en blanco tiene que contar como ausencia: si no, el
        // componente se ofrecería como editable y el constructor abriría vacío.
        var component = new SavedComponent(Guid.NewGuid(), "Botón", "export function App() {}", "   ");

        Assert.Null(component.TreeJson);
    }

    [Fact]
    public void WithContent_KeepsIdentityAndCreationDate()
    {
        // Volver a guardar es una revisión del mismo componente: si cambiara el id,
        // la librería acumularía copias y el catálogo dejaría de ser legible.
        var original = new SavedComponent(Guid.NewGuid(), "Botón", "v1", """{"rootIds":[]}""");

        var revised = original.WithContent("Botón primario", "v2", """{"rootIds":["block-1"]}""");

        Assert.Equal(original.Id, revised.Id);
        Assert.Equal(original.LibraryId, revised.LibraryId);
        Assert.Equal(original.CreatedAt, revised.CreatedAt);
        Assert.Equal("Botón primario", revised.Name);
        Assert.Equal("v2", revised.SourceCode);
        Assert.Equal("""{"rootIds":["block-1"]}""", revised.TreeJson);
    }

    [Theory]
    [InlineData(TargetFramework.React, CodeLanguage.TypeScript, "tsx")]
    [InlineData(TargetFramework.React, CodeLanguage.JavaScript, "jsx")]
    [InlineData(TargetFramework.Vue2, CodeLanguage.JavaScript, "vue")]
    [InlineData(TargetFramework.Vue3, CodeLanguage.TypeScript, "vue")]
    [InlineData(TargetFramework.Angular, CodeLanguage.TypeScript, "ts")]
    public void LanguageTokens_MapFrameworkAndLanguage_ToExpectedToken(
        TargetFramework framework, CodeLanguage language, string expected)
    {
        Assert.Equal(expected, LanguageTokens.For(framework, language));
    }

    // ── Estilos globales de la librería ──────────────────────────────────────

    [Fact]
    public void Constructor_LeavesGlobalStyles_Null_WhenNotProvided()
    {
        var library = new ComponentLibrary("Kit", TargetFramework.React, CodeLanguage.TypeScript);

        // Nulo y no cadena vacía: es lo que distingue «esta librería no tiene tema
        // propio, aplícale el genérico» de «tiene uno, y está vacío».
        Assert.Null(library.ThemeJson);
        Assert.Null(library.GlobalStyles);
    }

    [Fact]
    public void SetGlobalStyles_StoresBoth()
    {
        var library = new ComponentLibrary("Kit", TargetFramework.React, CodeLanguage.TypeScript);

        library.SetGlobalStyles("{\"colors\":{}}", ".kit { letter-spacing: 0.01em; }");

        Assert.Equal("{\"colors\":{}}", library.ThemeJson);
        Assert.Equal(".kit { letter-spacing: 0.01em; }", library.GlobalStyles);
    }

    [Fact]
    public void SetGlobalStyles_DoesNotWipeTheOther_WhenOnlyOneIsSent()
    {
        // El panel guarda el tema y la hoja global por separado. Si guardar uno
        // borrara el otro, tocar un color desde el selector se llevaría por
        // delante toda la hoja global de la librería sin avisar.
        var library = new ComponentLibrary("Kit", TargetFramework.React, CodeLanguage.TypeScript);
        library.SetGlobalStyles("{\"tema\":1}", ".kit { color: red; }");

        library.SetGlobalStyles("{\"tema\":2}", null);

        Assert.Equal("{\"tema\":2}", library.ThemeJson);
        Assert.Equal(".kit { color: red; }", library.GlobalStyles);
    }

    [Fact]
    public void SetGlobalStyles_TreatsBlankAsAbsent()
    {
        var library = new ComponentLibrary("Kit", TargetFramework.React, CodeLanguage.TypeScript);
        library.SetGlobalStyles("{}", ".kit { color: red; }");

        library.SetGlobalStyles("   ", "  ");

        Assert.Equal("{}", library.ThemeJson);
        Assert.Equal(".kit { color: red; }", library.GlobalStyles);
    }

    [Fact]
    public void ClearGlobalStylesSheet_EmptiesOnlyTheSheet()
    {
        var library = new ComponentLibrary("Kit", TargetFramework.React, CodeLanguage.TypeScript);
        library.SetGlobalStyles("{}", ".kit { color: red; }");

        library.ClearGlobalStylesSheet();

        Assert.Null(library.GlobalStyles);
        Assert.Equal("{}", library.ThemeJson);
    }
}
