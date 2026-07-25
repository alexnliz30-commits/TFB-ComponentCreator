using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
using Visualiza.Application.Experiment;
using Visualiza.Application.Libraries;
using Visualiza.Infrastructure.Components;
using Visualiza.Infrastructure.Configuration;
using Visualiza.Infrastructure.Experiment;
using Visualiza.Infrastructure.Persistence;

namespace Visualiza.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<AnthropicOptions>()
            .Bind(configuration.GetSection(AnthropicOptions.SectionName));
        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName));

        services.AddSingleton<IComponentGenerator>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<AnthropicOptions>>().Value;
            return options.UseMock || string.IsNullOrWhiteSpace(options.ApiKey)
                ? new MockComponentGenerator()
                : new AnthropicComponentGenerator(Options.Create(options));
        });

        services.AddSingleton<ITsxCompilationChecker, TsxCompilationChecker>();
        services.AddSingleton<IStylesheetCompiler, TailwindStylesheetCompiler>();
        services.AddSingleton<IJwtTokenService, JwtTokenService>();

        services.AddScoped<IGeneratedComponentRepository, GeneratedComponentRepository>();
        services.AddScoped<IParticipantRepository, ParticipantRepository>();
        services.AddScoped<IExperimentSessionRepository, ExperimentSessionRepository>();
        services.AddScoped<IComponentLibraryRepository, ComponentLibraryRepository>();

        services.AddScoped<GenerateComponentUseCase>();
        services.AddScoped<RefineComponentUseCase>();
        services.AddScoped<PatchBlockUseCase>();
        services.AddScoped<AssistUseCase>();
        services.AddScoped<CompileStylesheetUseCase>();
        services.AddScoped<StartSessionUseCase>();
        services.AddScoped<RecordTaskUseCase>();
        services.AddScoped<RecordSusUseCase>();
        services.AddScoped<CompleteSessionUseCase>();
        services.AddScoped<CreateLibraryUseCase>();
        services.AddScoped<ListLibrariesUseCase>();
        services.AddScoped<GetLibraryUseCase>();
        services.AddScoped<SaveComponentToLibraryUseCase>();
        services.AddScoped<DeleteSavedComponentUseCase>();
        services.AddScoped<DeleteLibraryUseCase>();

        var connectionString = configuration.GetConnectionString("Postgres");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                "ConnectionStrings:Postgres is required for the Infrastructure layer.");
        services.AddDbContext<VisualizaDbContext>(opts => opts.UseNpgsql(connectionString));

        return services;
    }
}
