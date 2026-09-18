namespace Visualiza.Domain.Projects;

/// <summary>
/// Proyecto del constructor, con su propio código de acceso (RF11).
///
/// El servidor no guarda el contenido del proyecto —los componentes y sus
/// árboles siguen viviendo en el navegador—, solo lo que hace falta para decidir
/// quién puede abrirlo: su nombre y el <b>hash</b> de su código.
/// </summary>
/// <remarks>
/// Antes había un único código compartido, fijado en configuración. Servía para
/// cerrar los endpoints, pero no para lo que la interfaz promete —«crea un
/// proyecto»—: el código había que conocerlo de antemano, así que quien estrenaba
/// el sistema se encontraba una puerta cerrada sin llave y sin forma de pedir
/// una. Ahora cada proyecto nace con la suya.
/// </remarks>
public sealed class DesignerProject
{
    public Guid Id { get; }
    public string Name { get; }

    /// <summary>
    /// Hash del código de acceso. Nunca el código.
    /// </summary>
    /// <remarks>
    /// El código se enseña una sola vez, cuando se crea el proyecto, y a partir
    /// de ahí el servidor solo sabe comprobarlo. Guardarlo en claro convertiría
    /// una lectura de la base de datos —una copia de seguridad, un volcado para
    /// depurar— en la lista de llaves de todos los proyectos.
    /// </remarks>
    public string CodeHash { get; private set; }

    public DateTime CreatedAt { get; }

    public DesignerProject(string name, string codeHash)
        : this(Guid.NewGuid(), name, codeHash, DateTime.UtcNow)
    {
    }

    public DesignerProject(Guid id, string name, string codeHash, DateTime createdAt)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("El proyecto necesita un nombre.", nameof(name));
        if (string.IsNullOrWhiteSpace(codeHash))
            throw new ArgumentException("El proyecto necesita un código de acceso.", nameof(codeHash));

        Id = id;
        Name = name.Trim();
        CodeHash = codeHash;
        CreatedAt = createdAt;
    }

    /// <summary>
    /// Sustituye el código por otro.
    /// </summary>
    /// <remarks>
    /// Existe porque el código solo se enseña al crear el proyecto: sin esto,
    /// perder el papel donde se copió dejaría el proyecto inaccesible salvo
    /// entrando a la base de datos. Solo puede pedirlo quien ya tiene acceso.
    /// </remarks>
    public void ReplaceCode(string codeHash)
    {
        if (string.IsNullOrWhiteSpace(codeHash))
            throw new ArgumentException("El proyecto necesita un código de acceso.", nameof(codeHash));
        CodeHash = codeHash;
    }
}
