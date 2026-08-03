namespace Visualiza.Application.Abstractions;

/// <summary>
/// Canje del código de acceso del diseñador por un token (RF11).
/// </summary>
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
}

/// <param name="Token">JWT con el rol <c>designer</c>.</param>
/// <param name="ExpiresInMinutes">Vigencia, para que el cliente sepa cuándo repetir el canje.</param>
public sealed record DesignerAccess(string Token, int ExpiresInMinutes);
