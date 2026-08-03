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
    /// Código que abre el constructor. Vacío = la API arranca pero rechaza todo
    /// intento de canje, en lugar de dejar los endpoints abiertos: un fallo de
    /// configuración no puede traducirse en menos seguridad de la pedida.
    /// </summary>
    public string AccessCode { get; init; } = string.Empty;

    /// <summary>Vigencia del token del diseñador. Más larga que la de una sesión
    /// de experimento: una sesión de trabajo con el constructor dura horas.</summary>
    public int TtlMinutes { get; init; } = 720;
}
