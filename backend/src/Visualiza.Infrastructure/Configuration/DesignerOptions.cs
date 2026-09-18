namespace Visualiza.Infrastructure.Configuration;

/// <summary>
/// Acceso al constructor (RF11).
///
/// No hay registro ni almacén de usuarios: el estudio no lo necesita y añadir
/// ASP.NET Core Identity traería un modelo de usuarios entero para un sistema
/// cuyos participantes son anónimos por diseño. Lo que sí hace falta es que los
/// endpoints del diseñador —generación con IA, que cuesta dinero, y las
/// librerías, que son escribibles— dejen de estar abiertos a cualquiera.
///
/// El compromiso es un <b>código de acceso compartido</b> que se canjea por un
/// JWT con el rol <c>designer</c>: mismo mecanismo de firma que ya usan las
/// sesiones del experimento, ninguna tabla nueva, y un token de participante
/// nunca sirve para el constructor porque no lleva ese rol.
/// </summary>
public sealed class DesignerOptions
{
    public const string SectionName = "Designer";

    /// <summary>
    /// Llave <b>maestra</b>: abre cualquier proyecto. Vacía = la API arranca pero
    /// rechaza todo intento de canje con ella, en lugar de dejar los endpoints
    /// abiertos: un fallo de configuración no puede traducirse en menos seguridad
    /// de la pedida.
    /// </summary>
    /// <remarks>
    /// Cada proyecto tiene además su propio código, que nace con él y solo lo abre
    /// a él (ver <c>DesignerProject</c>). Esta sigue existiendo por dos motivos:
    /// administrar el despliegue sin ir recuperando códigos uno a uno, y poder
    /// entrar a un proyecto cuyo código se perdió —que, al enseñarse una sola vez,
    /// es un final posible y no una hipótesis.
    /// </remarks>
    public string AccessCode { get; init; } = string.Empty;

    /// <summary>
    /// ¿Puede cualquiera dar de alta un proyecto?
    /// </summary>
    /// <remarks>
    /// Abierto —por defecto— es lo que hace que estrenar el sistema funcione: se
    /// crea el proyecto y el servidor entrega su código. El precio es que el alta
    /// devuelve un token válido, así que en un despliegue expuesto a internet
    /// equivale a regalar la cuota de la API de Claude a quien pase por ahí.
    /// Poniéndolo a <c>false</c> el alta exige ya tener acceso —la llave maestra o
    /// el código de otro proyecto—, y el sistema vuelve a estar cerrado de
    /// principio a fin.
    /// </remarks>
    public bool OpenProjectCreation { get; init; } = true;

    /// <summary>Vigencia del token del diseñador. Más larga que la de una sesión
    /// de experimento: una sesión de trabajo con el constructor dura horas.</summary>
    public int TtlMinutes { get; init; } = 720;
}
