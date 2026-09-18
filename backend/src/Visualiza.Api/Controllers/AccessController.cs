using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Projects;
using Visualiza.Infrastructure.Security;

namespace Visualiza.Api.Controllers;

/// <summary>
/// Acceso al constructor (RF11).
///
/// Es el único controlador del diseñador con endpoints abiertos, y solo para las
/// dos operaciones que por definición no pueden exigir un token: dar de alta un
/// proyecto —de donde sale el primer código— y canjear un código por un token.
/// Todo lo demás —generación con IA y librerías— exige ya el rol.
/// </summary>
[ApiController]
[Route("api/access")]
public sealed class AccessController : ControllerBase
{
    /// <summary>Canjea la llave maestra del despliegue.</summary>
    [HttpPost("designer")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DesignerAccessResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<DesignerAccessResponse> Designer(
        [FromBody] DesignerAccessRequest request,
        [FromServices] IDesignerAccessService accessService)
    {
        var access = accessService.Exchange(request.AccessCode ?? string.Empty);
        if (access is null) return Unauthorized(new { message = "Código de acceso no válido." });

        return Ok(new DesignerAccessResponse(access.Token, access.ExpiresInMinutes));
    }

    /// <summary>
    /// Da de alta un proyecto y devuelve su código de acceso recién acuñado.
    /// </summary>
    /// <remarks>
    /// El código viaja <b>una sola vez</b>, en esta respuesta: el servidor solo
    /// guarda su hash, así que no hay ningún endpoint que lo vuelva a contar.
    /// Perderlo se arregla regenerándolo desde dentro, o con la llave maestra.
    /// </remarks>
    [HttpPost("projects")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CreatedProjectResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<CreatedProjectResponse>> CreateProject(
        [FromBody] CreateProjectRequest request,
        [FromServices] IDesignerAccessService accessService,
        [FromServices] CreateDesignerProjectUseCase useCase,
        CancellationToken cancellationToken)
    {
        // Con el alta cerrada hay que llegar ya con acceso. `AllowAnonymous` deja
        // pasar la petición, pero la autenticación ya se ha ejecutado: si trae un
        // token válido de diseñador, `User` lo refleja.
        if (!accessService.OpenProjectCreation && !User.IsInRole(DesignerAccessService.RoleValue))
            return Unauthorized(new { message = "Este despliegue no permite crear proyectos sin acceso previo." });

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "El proyecto necesita un nombre." });
        if (name.Length > 128)
            return BadRequest(new { message = "El nombre del proyecto no puede pasar de 128 caracteres." });

        var created = await useCase.ExecuteAsync(name, cancellationToken);
        return Ok(new CreatedProjectResponse(
            created.ProjectId, created.Name, created.AccessCode, created.Token, created.ExpiresInMinutes));
    }

    /// <summary>Canjea el código de un proyecto por un token que lo abre.</summary>
    [HttpPost("projects/{projectId:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DesignerAccessResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<DesignerAccessResponse>> OpenProject(
        Guid projectId,
        [FromBody] DesignerAccessRequest request,
        [FromServices] OpenDesignerProjectUseCase useCase,
        CancellationToken cancellationToken)
    {
        var access = await useCase.ExecuteAsync(projectId, request.AccessCode ?? string.Empty, cancellationToken);
        if (access is null) return Unauthorized(new { message = "Código de acceso no válido." });

        return Ok(new DesignerAccessResponse(access.Token, access.ExpiresInMinutes));
    }

    /// <summary>Cambia el código del proyecto y devuelve el nuevo.</summary>
    [HttpPost("projects/{projectId:guid}/code")]
    [Authorize(Policy = "Designer")]
    [ProducesResponseType(typeof(ProjectCodeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProjectCodeResponse>> RegenerateCode(
        Guid projectId,
        [FromServices] RegenerateProjectCodeUseCase useCase,
        CancellationToken cancellationToken)
    {
        var code = await useCase.ExecuteAsync(projectId, cancellationToken);
        return code is null ? NotFound() : Ok(new ProjectCodeResponse(code));
    }

    /// <summary>
    /// Da de baja el proyecto del servidor.
    /// </summary>
    /// <remarks>
    /// Lo llama el frontend al borrar el proyecto del navegador. Sin esto, la
    /// tabla acumularía filas de proyectos que ya no existen en ninguna parte y
    /// que nadie va a reclamar nunca.
    /// </remarks>
    [HttpDelete("projects/{projectId:guid}")]
    [Authorize(Policy = "Designer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteProject(
        Guid projectId,
        [FromServices] IDesignerProjectRepository repository,
        CancellationToken cancellationToken)
    {
        var deleted = await repository.DeleteAsync(projectId, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}

public sealed record DesignerAccessRequest(string? AccessCode);

public sealed record DesignerAccessResponse(string Token, int ExpiresInMinutes);

public sealed record CreateProjectRequest(string? Name);

public sealed record CreatedProjectResponse(
    Guid ProjectId,
    string Name,
    string AccessCode,
    string Token,
    int ExpiresInMinutes);

public sealed record ProjectCodeResponse(string AccessCode);
