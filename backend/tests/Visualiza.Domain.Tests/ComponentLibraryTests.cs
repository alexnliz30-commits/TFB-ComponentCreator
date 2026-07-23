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
}
