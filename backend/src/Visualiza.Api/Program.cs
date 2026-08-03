using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration.Json;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Visualiza.Infrastructure;
using Visualiza.Infrastructure.Configuration;
using Visualiza.Infrastructure.Persistence;
using Visualiza.Infrastructure.Security;

const string FrontendCors = "frontend";
const string DesignerPolicy = "Designer";

var builder = WebApplication.CreateBuilder(args);

// Credenciales locales fuera de control de versiones (ver .gitignore).
// Se inserta tras los demás JSON pero antes de las variables de entorno: en Docker
// ConnectionStrings__Postgres debe seguir ganando aunque el bind mount exponga este fichero.
var insertAt = builder.Configuration.Sources
    .Select((source, index) => (source, index))
    .Where(x => x.source is JsonConfigurationSource)
    .Select(x => x.index + 1)
    .DefaultIfEmpty(0)
    .Max();
builder.Configuration.Sources.Insert(insertAt, new JsonConfigurationSource
{
    Path = "appsettings.Local.json",
    Optional = true,
    ReloadOnChange = true,
});

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Visualiza API", Version = "v1" });
});
builder.Services.AddProblemDetails();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHealthChecks()
    .AddDbContextCheck<VisualizaDbContext>("postgres");

builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCors, policy => policy
        .WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

builder.Services
    .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwtAccessor) =>
    {
        var jwt = jwtAccessor.Value;
        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret))
        };
    });
// Política del constructor (RF11). El rol la separa de los tokens de sesión del
// experimento: un participante nunca puede generar componentes ni escribir en
// las librerías, aunque su token esté firmado con la misma clave.
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(DesignerPolicy, policy => policy
        .RequireAuthenticatedUser()
        .RequireRole(DesignerAccessService.RoleValue));
});

var app = builder.Build();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<IExceptionHandlerFeature>();
        var error = exceptionFeature?.Error;

        var (status, title) = error switch
        {
            ArgumentException => (StatusCodes.Status400BadRequest, "Bad Request"),
            _ => (StatusCodes.Status500InternalServerError, "Internal Server Error")
        };

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = error?.Message
        });
    });
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Auto-creación del esquema en arranque (Testing usa InMemory, así que es no-op).
if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<VisualizaDbContext>();
    db.Database.EnsureCreated();
}

app.UseCors(FrontendCors);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/healthz");

app.Run();

public partial class Program;
