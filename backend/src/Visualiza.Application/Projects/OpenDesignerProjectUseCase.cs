using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Projects;

/// <summary>
/// Canjea el código de un proyecto por un token que lo abre (RF11).
/// </summary>
public sealed class OpenDesignerProjectUseCase
{
    private readonly IDesignerProjectRepository _repository;
    private readonly IDesignerAccessService _access;

    public OpenDesignerProjectUseCase(IDesignerProjectRepository repository, IDesignerAccessService access)
    {
        _repository = repository;
        _access = access;
    }

    /// <summary>
    /// Devuelve el token, o <c>null</c> si el proyecto no existe o el código no es
    /// el suyo.
    /// </summary>
    /// <remarks>
    /// Un solo <c>null</c> para los dos casos: responder «ese proyecto no existe»
    /// le confirmaría a quien prueba identificadores cuáles sí existen, y eso es
    /// la mitad del trabajo de adivinar un código.
    /// </remarks>
    public async Task<DesignerAccess?> ExecuteAsync(
        Guid projectId, string accessCode, CancellationToken cancellationToken = default)
    {
        var project = await _repository.GetAsync(projectId, cancellationToken);
        if (project is null) return null;
        if (!_access.CodeMatches(accessCode, project.CodeHash)) return null;

        return _access.IssueForProject(projectId);
    }
}
