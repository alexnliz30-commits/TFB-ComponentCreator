using Visualiza.Application.Abstractions;

namespace Visualiza.Application.Projects;

/// <summary>
/// Sustituye el código de un proyecto por uno nuevo (RF11).
/// </summary>
/// <remarks>
/// Es la salida al único callejón que abre enseñar el código una sola vez: quien
/// lo pierde se queda fuera. Solo puede pedirlo quien ya está dentro —lo exige la
/// política <c>Designer</c> en el controlador—, así que no es una puerta trasera
/// sino un cambio de cerradura desde dentro. El código anterior deja de valer en
/// el acto; los tokens ya emitidos siguen vigentes hasta caducar, que es lo
/// correcto cuando se regenera por pérdida y no por filtración.
/// </remarks>
public sealed class RegenerateProjectCodeUseCase
{
    private readonly IDesignerProjectRepository _repository;
    private readonly IDesignerAccessService _access;

    public RegenerateProjectCodeUseCase(IDesignerProjectRepository repository, IDesignerAccessService access)
    {
        _repository = repository;
        _access = access;
    }

    /// <summary>Devuelve el código nuevo, o <c>null</c> si el proyecto no existe.</summary>
    public async Task<string?> ExecuteAsync(Guid projectId, CancellationToken cancellationToken = default)
    {
        var code = _access.NewAccessCode();
        var replaced = await _repository.ReplaceCodeHashAsync(projectId, code.Hash, cancellationToken);
        return replaced ? code.Code : null;
    }
}
