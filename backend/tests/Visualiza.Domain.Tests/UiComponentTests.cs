using Visualiza.Domain.Components;

namespace Visualiza.Domain.Tests;

public class UiComponentTests
{
    [Fact]
    public void Constructor_AssignsProperties()
    {
        var before = DateTime.UtcNow;
        var component = new UiComponent(ComponentType.ProductCard, "code", "tsx");
        var after = DateTime.UtcNow;

        Assert.Equal(ComponentType.ProductCard, component.Type);
        Assert.Equal("code", component.SourceCode);
        Assert.Equal("tsx", component.Language);
        Assert.NotEqual(Guid.Empty, component.Id);
        Assert.InRange(component.GeneratedAt, before, after);
    }

    [Fact]
    public void Constructor_RejectsEmptySource()
    {
        Assert.Throws<ArgumentException>(() =>
            new UiComponent(ComponentType.DataTable, "", "tsx"));
    }

    [Fact]
    public void Constructor_RejectsWhitespaceSource()
    {
        Assert.Throws<ArgumentException>(() =>
            new UiComponent(ComponentType.StatsPanel, "   ", "tsx"));
    }

    [Fact]
    public void Constructor_RejectsEmptyLanguage()
    {
        Assert.Throws<ArgumentException>(() =>
            new UiComponent(ComponentType.NavigationMenu, "code", ""));
    }

    [Theory]
    [InlineData(ComponentType.RegistrationForm)]
    [InlineData(ComponentType.DataTable)]
    [InlineData(ComponentType.StatsPanel)]
    [InlineData(ComponentType.NavigationMenu)]
    [InlineData(ComponentType.ProductCard)]
    public void Constructor_AcceptsAllComponentTypes(ComponentType type)
    {
        var component = new UiComponent(type, "<div/>", "tsx");
        Assert.Equal(type, component.Type);
    }

    [Fact]
    public void Constructor_GeneratesUniqueIds()
    {
        var a = new UiComponent(ComponentType.ProductCard, "code", "tsx");
        var b = new UiComponent(ComponentType.ProductCard, "code", "tsx");
        Assert.NotEqual(a.Id, b.Id);
    }
}
