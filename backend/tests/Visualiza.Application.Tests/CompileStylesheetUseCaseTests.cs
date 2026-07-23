using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;

namespace Visualiza.Application.Tests;

public class CompileStylesheetUseCaseTests
{
    [Fact]
    public async Task ExecuteAsync_ReturnsGenerated_WhenCompilerProducesCss()
    {
        var useCase = new CompileStylesheetUseCase(new FakeCompiler(".a{color:red}"));

        var response = await useCase.ExecuteAsync(new CompileStylesheetRequest("<div/>", null, "css"));

        Assert.True(response.Generated);
        Assert.Equal(".a{color:red}", response.Css);
        Assert.True(response.ToolchainAvailable);
    }

    [Fact]
    public async Task ExecuteAsync_MarksNotGenerated_WhenToolchainMissing()
    {
        // Sin Node, el paquete sigue siendo válido pero dependerá de Tailwind en
        // destino. No debe confundirse con «el componente no necesita estilos».
        var compiler = new FakeCompiler(StylesheetResult.ToolchainMissing("sin npx"));
        var useCase = new CompileStylesheetUseCase(compiler);

        var response = await useCase.ExecuteAsync(new CompileStylesheetRequest("<div/>", null, "css"));

        Assert.False(response.Generated);
        Assert.False(response.ToolchainAvailable);
        Assert.Equal("sin npx", response.Diagnostics);
    }

    [Theory]
    [InlineData("scss", true)]
    [InlineData("SCSS", true)]
    [InlineData("css", false)]
    [InlineData(null, false)]
    public async Task ExecuteAsync_FlagsSassOnlyForScss(string? language, bool expected)
    {
        var compiler = new FakeCompiler(".a{}");
        var useCase = new CompileStylesheetUseCase(compiler);

        await useCase.ExecuteAsync(new CompileStylesheetRequest("<div/>", "$a: red;", language));

        Assert.Equal(expected, compiler.LastStylesAreSass);
    }

    [Fact]
    public async Task ExecuteAsync_RequiresMarkup()
    {
        var useCase = new CompileStylesheetUseCase(new FakeCompiler(".a{}"));

        await Assert.ThrowsAsync<ArgumentException>(
            () => useCase.ExecuteAsync(new CompileStylesheetRequest("   ", null, "css")));
    }

    private sealed class FakeCompiler : IStylesheetCompiler
    {
        private readonly StylesheetResult _result;
        public bool LastStylesAreSass { get; private set; }

        public FakeCompiler(string css) => _result = new StylesheetResult(css, null);
        public FakeCompiler(StylesheetResult result) => _result = result;

        public Task<StylesheetResult> CompileAsync(
            string markup, string? customStyles, bool stylesAreSass, CancellationToken cancellationToken = default)
        {
            LastStylesAreSass = stylesAreSass;
            return Task.FromResult(_result);
        }
    }
}
