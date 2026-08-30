namespace Visualiza.Application.Abstractions;

/// <summary>
/// El generador de componentes no está disponible por una causa CONOCIDA y explicable:
/// la clave de la API es inválida, el proveedor está saturado o ha aplicado un límite
/// de uso.
/// </summary>
/// <remarks>
/// Existe para separar «esto se ha roto» de «esto no se puede hacer ahora mismo, y sé
/// por qué». Sin ella, una clave caducada salía por el manejador de excepciones como un
/// 500, y lo único que llegaba a la persona que estaba escribiendo en el chat era
/// «Backend respondió 500 en POST /api/components/assist»: un mensaje que no dice qué
/// pasa, no dice qué hacer, y se lee como un fallo del programa cuando en realidad basta
/// con corregir una variable de entorno.
///
/// Es el mismo criterio que ya seguía el compilador de hojas de estilo, que ante la
/// falta de Node responde 200 explicando por qué el paquete sale sin hoja
/// (<see cref="IStylesheetCompiler"/>). Aquella dependencia externa degradaba con
/// honestidad y esta no; ahora las dos hacen lo mismo.
/// </remarks>
public sealed class ComponentGeneratorUnavailableException : Exception
{
    public ComponentGeneratorUnavailableException(string message, Exception? inner = null)
        : base(message, inner)
    {
    }

    /// <summary>La clave configurada no la acepta el proveedor.</summary>
    public static ComponentGeneratorUnavailableException BadKey(Exception inner) => new(
        "La clave de la API de Claude no es válida. Revisa `ANTHROPIC_API_KEY` en el "
        + "entorno del backend; mientras tanto, el constructor visual sigue funcionando "
        + "sin la ayuda de la IA.",
        inner);

    /// <summary>Límite de uso alcanzado.</summary>
    public static ComponentGeneratorUnavailableException RateLimited(Exception inner) => new(
        "El proveedor de IA ha aplicado un límite de uso. Espera unos segundos y "
        + "vuelve a intentarlo.",
        inner);

    /// <summary>El proveedor no responde o devuelve un error temporal.</summary>
    public static ComponentGeneratorUnavailableException ProviderDown(Exception inner) => new(
        "El proveedor de IA no está respondiendo ahora mismo. Vuelve a intentarlo en "
        + "un momento.",
        inner);
}
