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
/// Acuña, comprueba y canjea los códigos de acceso al constructor (RF11).
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

    /// <summary>
    /// Proyecto que abre un token de proyecto. Ausente en el de la llave maestra,
    /// que por eso los abre todos.
    /// </summary>
    public const string ProjectClaimType = "pid";

    /// <summary>
    /// Alfabeto de los códigos: sin los caracteres que se confunden al copiarlos
    /// a mano (<c>O</c>/<c>0</c>, <c>I</c>/<c>L</c>/<c>1</c>).
    /// </summary>
    /// <remarks>
    /// El código está pensado para leerse de una pantalla y teclearse en otra, así
    /// que la ambigüedad no es una molestia estética: es un intento fallido que el
    /// usuario interpreta como «me lo han dado mal».
    /// </remarks>
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    /// <summary>
    /// Caracteres aleatorios por código: 12 sobre 31 símbolos son ~59 bits.
    /// </summary>
    /// <remarks>
    /// Sobra para que adivinarlo por fuerza bruta contra el endpoint no sea una
    /// vía —a mil intentos por segundo serían millones de años—, y es corto
    /// bastante para copiarlo de un vistazo.
    /// </remarks>
    private const int CodeLength = 12;

    private readonly JwtOptions _jwt;
    private readonly DesignerOptions _designer;

    public DesignerAccessService(IOptions<JwtOptions> jwt, IOptions<DesignerOptions> designer)
    {
        _jwt = jwt.Value;
        _designer = designer.Value;
        if (string.IsNullOrWhiteSpace(_jwt.Secret) || _jwt.Secret.Length < 32)
            throw new InvalidOperationException("Jwt:Secret must be at least 32 characters.");
    }

    public bool OpenProjectCreation => _designer.OpenProjectCreation;

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
                + "Configúralo (DESIGNER_ACCESS_CODE) para habilitar la llave maestra.");
            return null;
        }

        if (string.IsNullOrWhiteSpace(accessCode) || !FixedTimeEquals(accessCode, _designer.AccessCode))
            return null;

        // Sin claim de proyecto: es la llave maestra y los abre todos.
        return BuildToken([]);
    }

    public ProjectAccessCode NewAccessCode()
    {
        // `GetItems` reparte sobre el alfabeto sin sesgo aunque su tamaño no sea
        // potencia de dos; un `% Alphabet.Length` sobre bytes al azar habría
        // hecho más probables los primeros caracteres.
        var chars = RandomNumberGenerator.GetItems<char>(Alphabet, CodeLength);
        var code = $"{new string(chars[..4])}-{new string(chars[4..8])}-{new string(chars[8..])}";
        return new ProjectAccessCode(code, Hash(code));
    }

    public bool CodeMatches(string accessCode, string codeHash)
    {
        if (string.IsNullOrWhiteSpace(accessCode) || string.IsNullOrWhiteSpace(codeHash)) return false;
        // Longitudes distintas = el hash guardado no es uno nuestro. Se sale antes
        // de comparar porque `FixedTimeEquals` exige el mismo tamaño, y no se
        // filtra nada al hacerlo: el hash no es el secreto, lo es el código.
        return codeHash.Length == Hash(string.Empty).Length && FixedTimeEquals(Hash(accessCode), codeHash);
    }

    public DesignerAccess IssueForProject(Guid projectId)
        => BuildToken([new Claim(ProjectClaimType, projectId.ToString())]);

    /// <summary>
    /// Hash del código: SHA-256 en base64, sin sal ni derivación lenta.
    /// </summary>
    /// <remarks>
    /// PBKDF2 y compañía existen para encarecer el adivinar contraseñas elegidas
    /// por personas, que tienen poca entropía. Estos códigos los genera el
    /// servidor con ~59 bits: no hay diccionario que probar ni tabla que
    /// precalcular, así que una derivación lenta solo añadiría coste al canje
    /// legítimo. La normalización —espacios fuera, todo a mayúsculas— es para que
    /// teclearlo en minúscula funcione, que es lo que la gente hace.
    /// </remarks>
    private static string Hash(string code)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim().ToUpperInvariant())));

    private DesignerAccess BuildToken(IEnumerable<Claim> extra)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret));
        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims:
            [
                new Claim(ClaimTypes.Role, RoleValue),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                .. extra,
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
