namespace Visualiza.Application.Components;

/// <summary>
/// Respuesta del asistente.
/// </summary>
/// <param name="Reply">Texto para el chat, siempre presente.</param>
/// <param name="TreeJson">
/// Árbol modificado completo, o <c>null</c> si la petición no implicaba cambios.
/// El frontend lo valida contra su esquema de bloques antes de aplicarlo: aquí solo
/// se garantiza que es un objeto JSON bien formado con la estructura mínima.
/// </param>
/// <param name="Applied"><c>true</c> cuando la respuesta incluye un árbol utilizable.</param>
/// <param name="Options">
/// Respuestas rápidas cuando el asistente pregunta en lugar de construir.
///
/// Preguntar es parte del trabajo: una petición vaga («hazme un formulario») admite
/// resultados muy distintos, y adivinar produce un componente que hay que rehacer. Las
/// opciones se ofrecen como texto pulsable para que responder cueste un clic; la lista
/// va vacía cuando la respuesta no es una pregunta.
/// </param>
public sealed record AssistResponse(
    string Reply,
    string? TreeJson,
    bool Applied,
    IReadOnlyList<string>? Options = null);
