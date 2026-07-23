using Visualiza.Domain.Components;
using Visualiza.Domain.Experiment;

namespace Visualiza.Domain.Tests;

public class SusResponseTests
{
    [Fact]
    public void Score_AllFives_ReturnsExactly50()
    {
        var sus = new SusResponse(
            Guid.NewGuid(),
            ComponentType.RegistrationForm,
            Condition.Ai,
            new[] { 5, 5, 5, 5, 5, 5, 5, 5, 5, 5 });

        Assert.Equal(50.0, sus.Score, precision: 5);
    }

    [Fact]
    public void Score_MaximumUsability_Returns100()
    {
        var sus = new SusResponse(
            Guid.NewGuid(),
            ComponentType.DataTable,
            Condition.Human,
            new[] { 5, 1, 5, 1, 5, 1, 5, 1, 5, 1 });

        Assert.Equal(100.0, sus.Score, precision: 5);
    }

    [Fact]
    public void Constructor_RejectsWrongItemCount()
    {
        Assert.Throws<ArgumentException>(() =>
            new SusResponse(Guid.NewGuid(), ComponentType.ProductCard, Condition.Ai, new[] { 1, 2, 3 }));
    }

    [Fact]
    public void Constructor_RejectsOutOfRangeItem()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new SusResponse(Guid.NewGuid(), ComponentType.ProductCard, Condition.Ai,
                new[] { 1, 2, 3, 4, 5, 6, 5, 4, 3, 2 }));
    }
}
