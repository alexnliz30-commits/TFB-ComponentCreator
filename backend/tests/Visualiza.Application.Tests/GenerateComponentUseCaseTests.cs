using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
using Visualiza.Domain.Components;

namespace Visualiza.Application.Tests;

public class GenerateComponentUseCaseTests
{
    [Fact]
    public async Task ExecuteAsync_ReturnsResponse_WithCompilationFlag()
    {
        var useCase = BuildUseCase(out var repository);

        var response = await useCase.ExecuteAsync(
            new GenerateComponentRequest(ComponentType.StatsPanel, "show users"));

        Assert.Equal(ComponentType.StatsPanel, response.Type);
        Assert.Equal("// fake", response.SourceCode);
        Assert.True(response.Compiled);
        Assert.Equal(1, repository.SavedCount);
    }

    [Fact]
    public async Task ExecuteAsync_MarksNotVerified_WhenToolchainMissing()
    {
        // Un entorno sin Node no debe reportarse como fallo de compilación: eso haría
        // que el KR1 midiera 0 % en vez de reflejar la ausencia de medición.
        var repository = new FakeRepository();
        var useCase = new GenerateComponentUseCase(
            new FakeGenerator(),
            new FakeChecker(success: false, toolchainAvailable: false),
            repository);

        var response = await useCase.ExecuteAsync(
            new GenerateComponentRequest(ComponentType.StatsPanel, "show users"));

        Assert.False(response.Verified);
        Assert.False(response.Compiled);
        Assert.Equal("// fake", response.SourceCode);
    }

    [Fact]
    public async Task ExecuteAsync_DoesNotVerify_NonReactFrameworks()
    {
        var repository = new FakeRepository();
        var useCase = new GenerateComponentUseCase(
            new FakeGenerator(),
            new ThrowingChecker(),   // el harness tsc no debe invocarse para Vue
            repository);

        var response = await useCase.ExecuteAsync(new GenerateComponentRequest(
            ComponentType.StatsPanel, "show users", TargetFramework.Vue3, CodeLanguage.TypeScript));

        Assert.False(response.Verified);
        Assert.False(response.Compiled);
    }

    [Fact]
    public async Task ExecuteAsync_ThrowsOnEmptyPrompt()
    {
        var useCase = BuildUseCase(out _);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            useCase.ExecuteAsync(new GenerateComponentRequest(ComponentType.ProductCard, " ")));
    }

    private static GenerateComponentUseCase BuildUseCase(out FakeRepository repository)
    {
        repository = new FakeRepository();
        return new GenerateComponentUseCase(
            new FakeGenerator(),
            new FakeChecker(success: true),
            repository);
    }

    private sealed class FakeGenerator : IComponentGenerator
    {
        public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
            => Task.FromResult(new UiComponent(type, "// fake", "tsx"));

        public Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
            => Task.FromResult($"// refined: {instruction}\n{sourceCode}");
    }

    private sealed class FakeChecker : ITsxCompilationChecker
    {
        private readonly bool _success;
        private readonly bool _toolchainAvailable;
        public FakeChecker(bool success, bool toolchainAvailable = true)
        {
            _success = success;
            _toolchainAvailable = toolchainAvailable;
        }
        public Task<TsxCompilationResult> CheckAsync(string sourceCode, CancellationToken cancellationToken = default)
            => Task.FromResult(new TsxCompilationResult(_success, _success ? null : "stub diagnostics", _toolchainAvailable));
    }

    private sealed class ThrowingChecker : ITsxCompilationChecker
    {
        public Task<TsxCompilationResult> CheckAsync(string sourceCode, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("El harness tsc no debe invocarse fuera de React+TypeScript.");
    }

    private sealed class FakeRepository : IGeneratedComponentRepository
    {
        public int SavedCount { get; private set; }
        public Task SaveAsync(UiComponent component, string prompt, bool compiled, string? diagnostics, CancellationToken cancellationToken = default)
        {
            SavedCount++;
            return Task.CompletedTask;
        }
        public Task<int> CountAsync(CancellationToken cancellationToken = default) => Task.FromResult(SavedCount);
    }
}
