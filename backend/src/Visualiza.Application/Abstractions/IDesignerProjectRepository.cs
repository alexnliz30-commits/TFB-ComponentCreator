using Visualiza.Domain.Projects;

namespace Visualiza.Application.Abstractions;

/// <summary>
/// Proyectos del constructor y sus códigos de acceso (RF11).
/// </summary>
/// <remarks>
/// Solo la identidad y la llave: el contenido del proyecto —componentes, árboles
/// de bloques, tema— sigue viviendo en el navegador. Lo que sube al servidor es
/// lo único que el navegador no puede custodiar sin mentir, que es la decisión
/// sobre quién puede entrar.
/// </remarks>
public interface IDesignerProjectRepository
{
    Task AddAsync(DesignerProject project, CancellationToken cancellationToken = default);

    Task<DesignerProject?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Cambia el código del proyecto. Devuelve <c>false</c> si no existe.</summary>
    Task<bool> ReplaceCodeHashAsync(Guid id, string codeHash, CancellationToken cancellationToken = default);

    /// <summary>Da de baja el proyecto. Devuelve <c>false</c> si no existía.</summary>
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
