namespace Visualiza.Application.Components;

/// <summary>
/// Imagen adjunta a una petición del asistente: una captura, un boceto o un
/// diseño del que hay que deducir qué componentes construir.
/// </summary>
/// <param name="MediaType">Tipo MIME (<c>image/png</c>, <c>image/jpeg</c>, <c>image/webp</c>, <c>image/gif</c>).</param>
/// <param name="DataBase64">
/// Contenido en base64 <em>sin</em> el prefijo <c>data:</c>. El frontend lo recorta antes de
/// enviarlo: mandarlo entero haría que el modelo recibiera una cadena que no es base64 válida
/// y la petición fallaría con un error de la API difícil de relacionar con su causa.
/// </param>
public sealed record AssistImage(string MediaType, string DataBase64);
