using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Visualiza.Application.Abstractions;
using Visualiza.Infrastructure.Configuration;

namespace Visualiza.Infrastructure.Security;

/// <summary>
/// Canjea el código de acceso compartido por un JWT con el rol <c>designer</c>.
///
/// Firma con la misma clave que los tokens de sesión —un solo secreto que
/// gestionar— pero el rol los separa: el token de un participante no abre el
/// constructor, y el del diseñador no puede escribir en la sesión de nadie
/// porque no lleva el claim <c>sid</c> que exigen esos endpoints.
/// </summary>
public sealed class DesignerAccessService : IDesignerAccessService
{
    /// <summary>Valor del claim que la política de autorización exige.</summary>
    public const string RoleValue = "designer";

    private readonly JwtOptions _jwt;
    private readonly DesignerOptions _designer;

    public DesignerAccessService(IOptions<JwtOptions> jwt, IOptions<DesignerOptions> designer)
    {
        _jwt = jwt.Value;
        _designer = designer.Value;
        if (string.IsNullOrWhiteSpace(_jwt.Secret) || _jwt.Secret.Length < 32)
            throw new InvalidOperationException("Jwt:Secret must be at least 32 characters.");
    }

    public DesignerAccess? Exchange(string accessCode)
    {
        if (string.IsNullOrWhiteSpace(_designer.AccessCode))
        {
            // Sin código configurado no se abre el constructor a todo el mundo:
            // se rechaza y se dice por qué en el servidor, que es donde se
            // arregla. Abrirlo convertiría un despiste de configuración en un
            // endpoint público que además gasta la cuota de la API de Claude.
            Console.Error.WriteLine(
                "[Designer] Se rechazó un canje porque Designer:AccessCode está vacío. "
                + "Configúralo (DESIGNER_ACCESS_CODE) para habilitar el constructor.");
            return null;
        }

        if (string.IsNullOrWhiteSpace(accessCode) || !FixedTimeEquals(accessCode, _designer.AccessCode))
            return null;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret));
        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims:
            [
                new Claim(ClaimTypes.Role, RoleValue),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            ],
            expires: DateTime.UtcNow.AddMinutes(_designer.TtlMinutes),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new DesignerAccess(
            new JwtSecurityTokenHandler().WriteToken(token),
            _designer.TtlMinutes);
    }

    /// <summary>
    /// Comparación en tiempo constante.
    /// </summary>
    /// <remarks>
    /// Un <c>==</c> corriente sale en cuanto encuentra el primer carácter
    /// distinto, y esa diferencia de tiempo es medible: permite adivinar el
    /// código carácter a carácter en vez de tener que probarlo entero.
    /// </remarks>
    private static bool FixedTimeEquals(string a, string b)
        => CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a),
            Encoding.UTF8.GetBytes(b));
}
