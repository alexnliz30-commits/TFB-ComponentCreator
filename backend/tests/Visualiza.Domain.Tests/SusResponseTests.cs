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

    // El SUS se administra una vez por condición, sobre el CONJUNTO de los cinco
    // componentes de esa condición, así que no hay un tipo al que referirlo.
    [Fact]
    public void Constructor_AcceptsNullComponentType_ForWholeConditionSet()
    {
        var sus = new SusResponse(
            Guid.NewGuid(),
            null,
            Condition.Ai,
            new[] { 5, 1, 5, 1, 5, 1, 5, 1, 5, 1 });

        Assert.Null(sus.ComponentType);
        Assert.Equal(100.0, sus.Score, precision: 5);
    }

    // La validación no se relaja por no llevar tipo: las diez respuestas y su
    // rango siguen siendo obligatorios.
    [Fact]
    public void Constructor_WithNullComponentType_StillValidatesItems()
    {
        Assert.Throws<ArgumentException>(() =>
            new SusResponse(Guid.NewGuid(), null, Condition.Human, new[] { 1, 2, 3 }));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new SusResponse(Guid.NewGuid(), null, Condition.Human, new[] { 1, 2, 3, 4, 5, 6, 1, 1, 1, 1 }));
    }
}
