using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Visualiza.Application.Abstractions;

namespace Visualiza.Api.Controllers;

/// <summary>
/// Acceso al constructor (RF11).
///
/// Es el único endpoint del diseñador abierto, y solo para canjear el código por
/// un token; todo lo demás —generación con IA y librerías— exige ya el rol.
/// </summary>
[ApiController]
[Route("api/access")]
public sealed class AccessController : ControllerBase
{
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
}

public sealed record DesignerAccessRequest(string? AccessCode);

public sealed record DesignerAccessResponse(string Token, int ExpiresInMinutes);
