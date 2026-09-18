namespace Visualiza.Application.Abstractions;

/// <summary>
/// Canje de códigos de acceso del constructor por un token (RF11).
/// </summary>
/// <remarks>
/// Hay dos llaves y una sola cerradura. La <b>maestra</b> viene de la
/// configuración del despliegue y abre cualquier proyecto —es la que usa quien
/// administra el sistema, y la red de seguridad cuando se pierde un código—; la
/// de <b>proyecto</b> nace con el proyecto y solo lo abre a él. Las dos producen
/// el mismo tipo de token, con el rol <c>designer</c>, porque lo que separa al
/// diseñador del participante del experimento es el rol y no la procedencia.
/// </remarks>
public interface IDesignerAccessService
{
    /// <summary>
    /// Devuelve el token y sus minutos de vigencia, o <c>null</c> si el código no
    /// es válido o no hay ninguno configurado.
    /// </summary>
    /// <remarks>
    /// El mismo <c>null</c> para «código incorrecto» y para «no configurado» es
    /// deliberado: distinguirlos en la respuesta le diría a quien prueba códigos
    /// si merece la pena seguir intentándolo. El motivo real se traza en el
    /// servidor, que es donde hace falta para diagnosticar.
    /// </remarks>
    DesignerAccess? Exchange(string accessCode);

    /// <summary>
    /// ¿Puede cualquiera dar de alta un proyecto, o hace falta ya tener acceso?
    /// </summary>
    /// <remarks>
    /// Abierto es lo que hace que estrenar el sistema tenga sentido: se crea el
    /// proyecto y el servidor entrega su código. Cerrado es lo que corresponde a
    /// un despliegue público, donde cada alta es un token válido y por tanto
    /// cuota de la API de Claude al alcance de cualquiera.
    /// </remarks>
    bool OpenProjectCreation { get; }

    /// <summary>Acuña un código de acceso nuevo, con su hash para guardar.</summary>
    ProjectAccessCode NewAccessCode();

    /// <summary>¿Corresponde el código tecleado al hash guardado?</summary>
    bool CodeMatches(string accessCode, string codeHash);

    /// <summary>Emite un token que abre un proyecto concreto.</summary>
    DesignerAccess IssueForProject(Guid projectId);
}

/// <param name="Token">JWT con el rol <c>designer</c>.</param>
/// <param name="ExpiresInMinutes">Vigencia, para que el cliente sepa cuándo repetir el canje.</param>
public sealed record DesignerAccess(string Token, int ExpiresInMinutes);

/// <param name="Code">El código en claro. Es la única vez que existe fuera de quien lo recibe.</param>
/// <param name="Hash">Lo que se guarda en la base de datos.</param>
public sealed record ProjectAccessCode(string Code, string Hash);
