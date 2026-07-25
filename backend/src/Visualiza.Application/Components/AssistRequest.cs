namespace Visualiza.Application.Components;

/// <summary>
/// Petición al asistente de la plataforma: la IA recibe el estado completo del
/// constructor y puede responder texto, modificar el árbol de bloques o ambas cosas.
/// </summary>
/// <param name="Message">Lo que el usuario pide, en lenguaje natural.</param>
/// <param name="TreeJson">
/// Árbol completo del lienzo (<c>{ blocks, rootIds, stateVars }</c>) serializado.
/// Es el contexto que permite a la IA operar sobre el componente y sus propiedades.
/// </param>
/// <param name="SelectedBlockId">Bloque seleccionado en el lienzo, si lo hay.</param>
/// <param name="CurrentCode">Código emitido actual, para preguntas sobre el código.</param>
/// <param name="PaletteJson">
/// Catálogo de tipos de bloque disponibles con sus propiedades por defecto, tal y
/// como lo declara el frontend. Se envía en cada petición en lugar de codificarlo
/// en el prompt: así el modelo conoce siempre los nombres y formatos de propiedad
/// reales de la paleta y no puede quedar desincronizado con ella, que es la causa
/// habitual de que un bloque se renderice vacío o con valores por defecto.
/// </param>
/// <param name="ThemeJson">
/// Estilos globales de la librería (color, tipografía y forma). Se envían para que
/// la IA sepa con qué está trabajando y proponga valores coherentes; los bloques que
/// cree deben referirse al tema por rol (<c>var(--vz-primario)</c>) y no copiar el
/// color literal, o dejarían de seguir al tema en cuanto este cambie.
/// </param>
public sealed record AssistRequest(
    string Message,
    string TreeJson,
    string? SelectedBlockId,
    string? CurrentCode,
    string? PaletteJson = null,
    string? ThemeJson = null);
