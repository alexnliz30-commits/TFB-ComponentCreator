using Visualiza.Application.Abstractions;
using Visualiza.Domain.Projects;

namespace Visualiza.Application.Projects;

/// <summary>
/// Da de alta un proyecto y entrega su código de acceso (RF11).
/// </summary>
/// <remarks>
/// Devuelve el código <b>y</b> un token ya emitido, las dos cosas a la vez y a
/// propósito: quien acaba de crear el proyecto entra directamente, sin teclear lo
/// que el sistema le acaba de enseñar. El código es para la próxima vez, para
/// otro navegador y para compartirlo.
/// </remarks>
public sealed class CreateDesignerProjectUseCase
{
    private readonly IDesignerProjectRepository _repository;
    private readonly IDesignerAccessService _access;

    public CreateDesignerProjectUseCase(IDesignerProjectRepository repository, IDesignerAccessService access)
    {
        _repository = repository;
        _access = access;
    }

    public async Task<CreatedProjectAccess> ExecuteAsync(string name, CancellationToken cancellationToken = default)
    {
        var code = _access.NewAccessCode();
        var project = new DesignerProject(name, code.Hash);
        await _repository.AddAsync(project, cancellationToken);

        var access = _access.IssueForProject(project.Id);
        return new CreatedProjectAccess(
            project.Id, project.Name, code.Code, access.Token, access.ExpiresInMinutes);
    }
}

/// <param name="AccessCode">El código en claro. No se puede volver a consultar: solo regenerar.</param>
public sealed record CreatedProjectAccess(
    Guid ProjectId,
    string Name,
    string AccessCode,
    string Token,
    int ExpiresInMinutes);
