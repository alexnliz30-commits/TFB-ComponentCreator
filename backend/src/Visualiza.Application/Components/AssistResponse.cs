namespace Visualiza.Application.Components;

/// <summary>
/// Componente devuelto por el asistente dentro de una tanda.
/// </summary>
/// <param name="Name">Nombre propuesto, ya legible para el catálogo.</param>
/// <param name="TreeJson">Su árbol de bloques, con la misma forma que <c>tree</c>.</param>
public sealed record AssistComponent(string Name, string TreeJson);

/// <summary>
/// Dónde deben acabar los componentes de una tanda.
///
/// Va estructurado y no solo dicho en la respuesta porque el frontend tiene que
/// <em>actuar</em>: crear la librería, publicar en la que ya existe, o no hacer
/// ninguna de las dos. Preguntar el destino y luego no aplicarlo convertiría la
/// pregunta en un trámite sin efecto.
/// </summary>
/// <param name="Kind"><c>existing</c>, <c>new</c> o <c>none</c>.</param>
/// <param name="LibraryId">Id de la librería elegida, solo con <c>existing</c>.</param>
/// <param name="LibraryName">Nombre de la librería a crear, solo con <c>new</c>.</param>
public sealed record AssistTarget(string Kind, string? LibraryId, string? LibraryName);

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
/// <param name="Components">
/// Varios componentes de una tanda, cuando de una imagen salen más de uno.
///
/// Va aparte de <paramref name="TreeJson"/> porque son cosas distintas: el árbol
/// sustituye el lienzo abierto, mientras que una tanda crea un componente por elemento
/// en el proyecto. Mezclarlos obligaría al frontend a adivinar cuál de las dos cosas
/// quiso decir el modelo.
/// </param>
/// <param name="Target">
/// Destino de la tanda, cuando el asistente ya lo tiene decidido. <c>null</c> si la
/// respuesta no crea componentes o si el destino aún está por preguntar.
/// </param>
public sealed record AssistResponse(
    string Reply,
    string? TreeJson,
    bool Applied,
    IReadOnlyList<string>? Options = null,
    IReadOnlyList<AssistComponent>? Components = null,
    AssistTarget? Target = null);
