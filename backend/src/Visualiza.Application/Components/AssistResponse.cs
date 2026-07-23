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
public sealed record AssistResponse(string Reply, string? TreeJson, bool Applied);
