using Visualiza.Domain.Components;

namespace Visualiza.Application.Libraries;

public sealed record CreateLibraryRequest(
    string Name,
    TargetFramework Framework,
    CodeLanguage Language,
    string? Description = null,
    string? ThemeJson = null,
    string? GlobalStyles = null);

/// <param name="ThemeJson">
/// Tema de la librería serializado. Nulo en las creadas antes de que el tema
/// viviera aquí; el cliente aplica entonces el suyo por defecto.
/// </param>
/// <param name="GlobalStyles">
/// Hoja de estilos global de la librería, que comparten todos sus componentes.
/// Se emite por delante de los estilos propios de cada uno.
/// </param>
public sealed record LibraryResponse(
    Guid Id,
    string Name,
    string Description,
    TargetFramework Framework,
    CodeLanguage Language,
    DateTime CreatedAt,
    int ComponentCount,
    string? ThemeJson = null,
    string? GlobalStyles = null);

/// <summary>Sustitución de los estilos globales de una librería.</summary>
/// <remarks>
/// Los dos campos son opcionales por separado a propósito: el panel guarda el
/// tema y la hoja global de forma independiente, y enviar uno no puede borrar el
/// otro. Nulo = no lo toques; cadena vacía = déjalo sin nada.
/// </remarks>
public sealed record UpdateLibraryStylesRequest(
    string? ThemeJson = null,
    string? GlobalStyles = null);

/// <param name="TreeJson">
/// Árbol de bloques del constructor, serializado. Opcional: los componentes generados
/// como código no lo tienen. Es lo que permite reabrir el componente en el
/// constructor y seguir editándolo, porque del TSX emitido no hay vuelta atrás.
/// </param>
/// <param name="ComponentId">
/// Identificador del componente que se está revisando. Cuando llega, guardar es
/// actualizar; si no, se busca por nombre dentro de la librería y solo se inserta
/// cuando tampoco hay coincidencia. Sin esto, cada guardado desde el constructor
/// insertaba una copia y la librería dejaba de poder leerse como catálogo.
/// </param>
public sealed record SaveComponentRequest(
    string Name,
    string SourceCode,
    string? TreeJson = null,
    Guid? ComponentId = null);

public sealed record SavedComponentResponse(
    Guid Id,
    Guid LibraryId,
    string Name,
    string SourceCode,
    DateTime CreatedAt,
    string? TreeJson = null,
    bool Editable = false);

public sealed record LibraryDetailResponse(
    LibraryResponse Library,
    IReadOnlyList<SavedComponentResponse> Components);

/// <param name="Created">
/// Distingue el alta de la revisión, para que el endpoint responda 201 o 200 según
/// corresponda: guardar dos veces el mismo componente no crea un recurso nuevo.
/// </param>
public sealed record SaveComponentResult(SavedComponentResponse Component, bool Created);
