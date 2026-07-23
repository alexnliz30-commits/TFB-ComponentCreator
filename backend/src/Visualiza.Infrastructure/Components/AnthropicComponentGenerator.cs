using System.Text;
using Anthropic;
using Anthropic.Models.Messages;
using Microsoft.Extensions.Options;
using Visualiza.Application.Abstractions;
using Visualiza.Domain.Components;
using Visualiza.Infrastructure.Configuration;

namespace Visualiza.Infrastructure.Components;

/// <summary>
/// Generador de componentes respaldado por la API de Claude (Anthropic).
///
/// Sustituye al antiguo generador de OpenAI conservando el mismo contrato
/// (<see cref="IComponentGenerator"/>) y los mismos prompts de calidad, y añade
/// el modo asistente: la IA recibe el árbol de bloques completo del lienzo y
/// puede devolverlo modificado, de modo que interactúa con la plataforma (los
/// bloques, sus propiedades y el código) y no solo con texto.
/// </summary>
public sealed class AnthropicComponentGenerator : IComponentGenerator
{
    private readonly AnthropicClient _client;
    private readonly AnthropicOptions _options;

    public AnthropicComponentGenerator(IOptions<AnthropicOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new InvalidOperationException("Anthropic ApiKey is not configured.");
        _client = new AnthropicClient { ApiKey = _options.ApiKey };
    }

    private async Task<string> CompleteAsync(string system, string user, CancellationToken cancellationToken)
    {
        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _options.Model,
            MaxTokens = 16000,
            // Pensamiento adaptativo: Claude decide cuánto razonar según la tarea.
            Thinking = new ThinkingConfigAdaptive(),
            System = new List<TextBlockParam> { new() { Text = system } },
            Messages = [new() { Role = Role.User, Content = user }],
        }, cancellationToken: cancellationToken);

        // Los bloques de thinking preceden al texto; solo interesa el texto.
        return string.Concat(response.Content
            .Select(block => block.Value)
            .OfType<TextBlock>()
            .Select(text => text.Text));
    }

    public Task<UiComponent> GenerateAsync(ComponentType type, string prompt, CancellationToken cancellationToken = default)
        => GenerateAsync(type, prompt, TargetFramework.React, CodeLanguage.TypeScript, cancellationToken);

    public async Task<UiComponent> GenerateAsync(
        ComponentType type,
        string prompt,
        TargetFramework framework,
        CodeLanguage language,
        CancellationToken cancellationToken = default)
    {
        var raw = await CompleteAsync(BuildSystemPrompt(type, framework, language), prompt, cancellationToken);
        var source = ExtractTsxBlock(raw);

        return new UiComponent(type, source, LanguageTokens.For(framework, language));
    }

    private static string BuildSystemPrompt(ComponentType type, TargetFramework framework, CodeLanguage language)
    {
        var label = type switch
        {
            ComponentType.RegistrationForm => "un formulario de registro",
            ComponentType.DataTable => "una tabla de datos",
            ComponentType.StatsPanel => "un panel de estadísticas",
            ComponentType.NavigationMenu => "un menú de navegación",
            ComponentType.ProductCard => "una tarjeta de producto",
            _ => "un componente UI"
        };

        var sb = new StringBuilder();
        sb.AppendLine(FrameworkIdentity(framework, language));
        sb.AppendLine($"Tu tarea es producir {label} COMPLETO a partir de la descripción del usuario, no un esqueleto estático.");
        sb.AppendLine();
        sb.AppendLine("Contrato de salida (obligatorio):");
        sb.AppendLine(FrameworkContract(framework, language));
        sb.AppendLine("- Declara los datos de ejemplo dentro del componente, realistas y en español (nada de \"Lorem ipsum\" ni \"Item 1\").");
        sb.AppendLine();
        sb.AppendLine("Interactividad y comportamiento:");
        sb.AppendLine(framework switch
        {
            TargetFramework.React => "- Usa estado real con useState y manejadores de eventos (onClick, onChange, onSubmit) que produzcan un efecto visible.",
            TargetFramework.Vue3 => "- Usa estado reactivo real (ref/computed) y manejadores de eventos (@click, @input, @submit.prevent) que produzcan un efecto visible.",
            TargetFramework.Vue2 => "- Usa estado reactivo real (data/computed) y manejadores de eventos (@click, @input, @submit.prevent) que produzcan un efecto visible.",
            TargetFramework.Angular => "- Usa signals para el estado y manejadores de eventos ((click), (input), (ngSubmit)) que produzcan un efecto visible.",
            _ => "- Usa estado real y manejadores de eventos que produzcan un efecto visible."
        });
        sb.AppendLine("- Si hay entrada de datos, valida: campos obligatorios, formato de email, longitudes mínimas; muestra mensajes de error inline en español junto al campo (con role=\"alert\" y aria-invalid) y un estado de éxito tras la acción.");
        sb.AppendLine("- Los botones y controles deben responder: feedback visual al pulsar, deshabilitado cuando no aplica.");
        sb.AppendLine();
        sb.AppendLine("Diseño visual:");
        sb.AppendLine("- Paleta coherente: fondos white/slate-50, textos slate-900/slate-500, un único color de acento (indigo-600) para acciones primarias.");
        sb.AppendLine("- Jerarquía clara: título, texto de apoyo, espaciado generoso (p-6, space-y-4), bordes rounded-xl con border-slate-200 y shadow-sm.");
        sb.AppendLine("- Estados hover:, focus-visible: (anillo de foco), disabled: y transition en todos los elementos interactivos.");
        sb.AppendLine("- Accesibilidad: <label> asociado a cada campo, aria-* donde aplique, contraste AA y área táctil cómoda (mínimo px-4 py-2).");
        sb.AppendLine("- Usa exclusivamente clases utilitarias de Tailwind para los estilos.");
        sb.AppendLine();
        sb.AppendLine("Requisitos específicos de este tipo de componente:");
        sb.AppendLine(TypeRequirements(type));
        return sb.ToString();
    }

    private static string FrameworkIdentity(TargetFramework framework, CodeLanguage language)
    {
        var lang = language == CodeLanguage.TypeScript ? "TypeScript" : "JavaScript";
        return framework switch
        {
            TargetFramework.React => $"Eres un ingeniero frontend senior que genera componentes React 18 en {lang} con Tailwind 3 listos para producción.",
            TargetFramework.Vue3 => $"Eres un ingeniero frontend senior que genera componentes de fichero único (SFC) de Vue 3 con Composition API en {lang} y Tailwind 3, listos para producción.",
            TargetFramework.Vue2 => $"Eres un ingeniero frontend senior que genera componentes de fichero único (SFC) de Vue 2 con Options API en {lang} y Tailwind 3, listos para producción.",
            TargetFramework.Angular => "Eres un ingeniero frontend senior que genera componentes standalone de Angular (última versión) en TypeScript con Tailwind 3, listos para producción.",
            _ => $"Eres un ingeniero frontend senior que genera componentes UI en {lang} con Tailwind 3."
        };
    }

    private static string FrameworkContract(TargetFramework framework, CodeLanguage language) => framework switch
    {
        TargetFramework.React when language == CodeLanguage.TypeScript =>
            "- Devuelve únicamente un bloque de código TSX, sin texto adicional.\n" +
            "- Exporta el componente exactamente como `export function App()`, sin props obligatorias.\n" +
            "- No incluyas imports: useState, useEffect, useMemo, useRef, useCallback y useReducer están disponibles como globales (React 18 con jsx-runtime).\n" +
            "- El componente debe compilar con `tsc --noEmit --strict`: tipa el estado; en los manejadores de eventos puedes usar `(e: any)`.",
        TargetFramework.React =>
            "- Devuelve únicamente un bloque de código JSX (JavaScript, sin anotaciones de tipos), sin texto adicional.\n" +
            "- Exporta el componente exactamente como `export function App()`, sin props obligatorias.\n" +
            "- No incluyas imports: useState, useEffect, useMemo, useRef, useCallback y useReducer están disponibles como globales (React 18 con jsx-runtime).",
        TargetFramework.Vue3 =>
            "- Devuelve únicamente un bloque de código con el SFC completo (.vue), sin texto adicional.\n" +
            $"- Usa `<script setup{(language == CodeLanguage.TypeScript ? " lang=\"ts\"" : "")}>` con Composition API (ref, computed) importando solo desde 'vue'.\n" +
            "- El bloque `<template>` va después del script; no uses `<style>`: todos los estilos con clases de Tailwind.",
        TargetFramework.Vue2 =>
            "- Devuelve únicamente un bloque de código con el SFC completo (.vue), sin texto adicional.\n" +
            "- Usa Options API (`export default { data(), computed, methods }`) compatible con Vue 2.7; sin dependencias externas.\n" +
            "- El bloque `<template>` debe tener un único elemento raíz; no uses `<style>`: todos los estilos con clases de Tailwind.",
        TargetFramework.Angular =>
            "- Devuelve únicamente un bloque de código TypeScript con el componente completo, sin texto adicional.\n" +
            "- Componente standalone (`@Component({ standalone: true, ... })`) con template inline; importa solo desde '@angular/core', '@angular/common' y '@angular/forms' si hace falta.\n" +
            "- Usa signals para el estado y la nueva sintaxis de control de flujo (@if, @for) cuando aplique.",
        _ => "- Devuelve únicamente un bloque de código, sin texto adicional."
    };

    private static string TypeRequirements(ComponentType type) => type switch
    {
        ComponentType.RegistrationForm =>
            "- Incluye al menos nombre, email y contraseña con validación por campo al perder el foco y al enviar, texto de ayuda para los requisitos de contraseña, y una vista de éxito tras el envío válido.",
        ComponentType.DataTable =>
            "- Incluye un buscador que filtra las filas en vivo, una cabecera clicable que ordena ascendente/descendente con indicador visual, contador de resultados y un estado vacío con mensaje cuando el filtro no encuentra nada.",
        ComponentType.StatsPanel =>
            "- Incluye 3-4 métricas con valor, etiqueta y variación porcentual respecto al periodo anterior (positiva en verde con ▲, negativa en rojo con ▼) y un selector de periodo que cambia los datos mostrados.",
        ComponentType.NavigationMenu =>
            "- Incluye marca, enlaces con el ítem activo resaltado (aria-current=\"page\") que cambia al hacer clic, una acción primaria destacada y menú móvil desplegable con botón hamburguesa funcional (aria-expanded).",
        ComponentType.ProductCard =>
            "- Incluye zona de imagen (degradado como placeholder), nombre, descripción corta, precio con oferta, selector de cantidad con límites deshabilitables y botón «Añadir al carrito» con feedback visual temporal al pulsar.",
        _ =>
            "- Aplica las reglas generales de interactividad, validación y diseño visual."
    };

    public async Task<string> RefineAsync(string sourceCode, string instruction, CancellationToken cancellationToken = default)
    {
        var raw = await CompleteAsync(
            "Eres un ingeniero frontend senior que modifica componentes React 18 en TypeScript con Tailwind 3.\n" +
            "Reglas estrictas:\n" +
            "- Devuelve únicamente el código TSX modificado completo, sin texto adicional.\n" +
            "- Mantén la signatura `export function App()` sin props obligatorias.\n" +
            "- No incluyas imports: useState y demás hooks están disponibles como globales.\n" +
            "- Conserva la interactividad existente (estado, eventos, validaciones) salvo que la instrucción pida cambiarla; si añades campos de entrada, añade también su validación con mensajes en español.\n" +
            "- Mantén el sistema visual del componente: paleta slate + acento indigo-600, rounded-xl, shadow-sm, estados hover/focus-visible/disabled con transition, y accesibilidad (labels, aria-*).\n" +
            "- Usa exclusivamente clases utilitarias de Tailwind.\n" +
            "- El componente debe compilar con `tsc --noEmit --strict` (en manejadores puedes usar `(e: any)`).",
            $"Componente actual:\n```tsx\n{sourceCode}\n```\n\nInstrucción: {instruction}",
            cancellationToken);
        return ExtractTsxBlock(raw);
    }

    public async Task<string> PatchBlockAsync(
        string contextJson,
        string instruction,
        CancellationToken cancellationToken = default)
    {
        var raw = await CompleteAsync(
            "Modificas un bloque de un editor visual devolviendo SOLO un objeto JSON, nunca código.\n" +
            "Formato exacto de la respuesta (omite las claves que no cambien):\n" +
            "{\n" +
            "  \"props\": { \"<nombre>\": \"<valor como cadena>\" },\n" +
            "  \"events\": [ { \"event\": \"click|change|submit\", \"actions\": [ { \"kind\": \"toggle|set|increment|reset\", \"target\": \"<variable>\", \"value\": \"<solo si kind=set>\", \"by\": \"<solo si kind=increment>\" } ] } ],\n" +
            "  \"visibleIf\": { \"var\": \"<variable>\", \"op\": \"is|not\", \"value\": \"<valor>\" }\n" +
            "}\n" +
            "Reglas estrictas:\n" +
            "- Devuelve únicamente el JSON, sin explicaciones ni vallas de código.\n" +
            "- Todos los valores de `props` deben ser cadenas.\n" +
            "- `target` y `var` solo pueden ser nombres de `allowedVariableNames`. Si la petición " +
            "necesita una variable que no existe, no inventes ninguna: omite esa parte del parche.\n" +
            "- Para cambiar el aspecto, modifica la prop `className` con clases utilitarias de " +
            "Tailwind, conservando las que sigan siendo válidas.\n" +
            "- `visibleIf: null` elimina la condición de visibilidad.\n" +
            "- Si la instrucción no es aplicable a este bloque, devuelve {}.",
            $"Bloque:\n{contextJson}\n\nInstrucción: {instruction}",
            cancellationToken);
        return ExtractJsonObject(raw);
    }

    public async Task<string> AssistAsync(
        string contextJson,
        string message,
        CancellationToken cancellationToken = default)
    {
        var raw = await CompleteAsync(AssistSystemPrompt, $"Contexto de la plataforma:\n{contextJson}\n\nPetición del usuario: {message}", cancellationToken);
        return ExtractJsonObject(raw);
    }

    /// <summary>
    /// Prompt del modo asistente: describe el modelo de datos del constructor
    /// visual para que la IA pueda leer y modificar el árbol de bloques (la
    /// plataforma, el componente y sus propiedades), no solo emitir código.
    /// </summary>
    private const string AssistSystemPrompt =
        "Eres el asistente de Visualiza, un constructor visual de componentes UI. El usuario edita UN " +
        "componente como un árbol de bloques; tú lo lees y lo devuelves modificado. Toda tu salida se " +
        "aplica DIRECTAMENTE al lienzo (añadir, editar, reordenar o eliminar bloques y sus propiedades), " +
        "no como código. El usuario ve el resultado renderizado, así que debe verse bien de inmediato.\n" +
        "\n" +
        "IMPORTANTE — un componente, no una aplicación:\n" +
        "- Construyes UN componente coherente (un formulario, una tarjeta, una tabla, un panel...), no una " +
        "página entera ni varias secciones sin relación. Si el usuario pide \"más lógica\", esa lógica va " +
        "DENTRO del componente como funcionalidad: estado (`stateVars`), eventos (`events`) y visibilidad " +
        "condicional (`visibleIf`) sobre los bloques existentes. No añadas páginas, rutas ni bloques " +
        "decorativos que no formen parte del componente pedido.\n" +
        "\n" +
        "Modelo de datos del árbol (`tree`):\n" +
        "- `blocks`: mapa id → bloque. Cada bloque tiene `id` (cadena `block-N`), `type`, `props` " +
        "(mapa de cadenas → cadenas), `children` (lista de ids), y opcionalmente `events` y `visibleIf`.\n" +
        "- `rootIds`: ids de los bloques raíz, en orden de aparición.\n" +
        "- `stateVars`: variables de estado del componente `{ name, type: \"boolean|number|string\", initial }`.\n" +
        "- `events`: `[ { event: \"click|change|submit\", actions: [ { kind: \"toggle|set|increment|reset\", target, value?, by? } ] } ]`. " +
        "`target` debe ser el nombre de una variable declarada en `stateVars`.\n" +
        "- `visibleIf`: `{ var, op: \"is|not\", value }`. `var` debe existir en `stateVars`.\n" +
        "\n" +
        "PALETA (fuente de verdad): el contexto incluye `palette`, un array con TODOS los tipos de bloque " +
        "disponibles y, en `defaultProps`, las propiedades exactas que cada tipo entiende con un ejemplo de " +
        "valor. Reglas de uso obligatorias para que el componente se visualice bien:\n" +
        "- Usa SOLO tipos presentes en `palette`. No inventes tipos ni props.\n" +
        "- Al crear un bloque, parte de sus `defaultProps` y ajústalos: rellena SIEMPRE las props de " +
        "contenido con valores realistas en español (por ejemplo `text`, `label`, `title`, `placeholder`, " +
        "`items`, `value`), nunca las dejes vacías ni con textos de relleno tipo \"Item 1\".\n" +
        "- Respeta el formato de cada prop tal como aparece en `defaultProps`: las listas (`items`, " +
        "`options`, `headers`, `rows`) van como CSV (`\"a,b,c\"`) o pares (`\"Título:contenido,...\"`) " +
        "según el ejemplo; los números van como cadena.\n" +
        "- Solo los tipos contenedores llevan hijos en `children` (los que en `palette` tienen " +
        "`isContainer: true`: div, section, header, footer, main, aside, article, nav-html, form, card, " +
        "modal, drawer, collapse, fieldset, navbar, sidebar, grid, flex). El resto deben tener `children: []`.\n" +
        "\n" +
        "Estilos: `className` con clases utilitarias de Tailwind 3 es la ÚNICA forma de estilar. Mantén un " +
        "sistema visual coherente (fondos blancos/slate, texto slate-900/500, un acento —p. ej. indigo-600— " +
        "para acciones, `rounded-xl`, espaciado generoso, `shadow-sm`, estados hover/focus) salvo que el " +
        "usuario pida algo distinto.\n" +
        "\n" +
        "Formato de respuesta: SOLO un objeto JSON, sin vallas ni texto fuera de él:\n" +
        "{ \"reply\": \"<respuesta breve al usuario, en español>\", \"tree\": { \"blocks\": {...}, \"rootIds\": [...], \"stateVars\": [...] } }\n" +
        "Reglas estrictas de la respuesta:\n" +
        "- Incluye `tree` SIEMPRE que la petición implique crear o cambiar algo en el lienzo (que es lo " +
        "habitual). Para una pregunta o explicación pura, devuelve solo `reply`.\n" +
        "- Devuelve el `tree` COMPLETO (todos los bloques resultantes, no solo los que cambian), " +
        "conservando los ids de los bloques que se mantienen. Ids nuevos con prefijo distinto: " +
        "`block-a1`, `block-a2`... Para vaciar el lienzo, devuelve `blocks: {}` y `rootIds: []`.\n" +
        "- Si hay `selectedBlockId` en el contexto, la petición se refiere principalmente a ese bloque; aun " +
        "así devuelve el árbol entero.\n" +
        "- Todos los valores de `props` deben ser cadenas.\n" +
        "- En `reply`, una o dos frases sobre lo que has hecho.";

    /// <summary>
    /// Aísla el objeto JSON de la respuesta, tolerando vallas de código o texto alrededor.
    /// </summary>
    private static string ExtractJsonObject(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "{}";

        var text = raw.Trim();

        // Quita la valla ```json ... ``` si viene envuelto.
        if (text.StartsWith("```", StringComparison.Ordinal))
        {
            var firstBreak = text.IndexOf('\n');
            if (firstBreak != -1) text = text[(firstBreak + 1)..];
            var closing = text.LastIndexOf("```", StringComparison.Ordinal);
            if (closing != -1) text = text[..closing];
            text = text.Trim();
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        return start != -1 && end > start ? text[start..(end + 1)] : "{}";
    }

    private static string ExtractTsxBlock(string raw)
    {
        const string fenceStart = "```tsx";
        const string fenceStartGeneric = "```";
        const string fenceEnd = "```";

        var startIdx = raw.IndexOf(fenceStart, StringComparison.Ordinal);
        if (startIdx == -1) startIdx = raw.IndexOf(fenceStartGeneric, StringComparison.Ordinal);
        if (startIdx == -1) return raw.Trim();

        var contentStart = raw.IndexOf('\n', startIdx);
        if (contentStart == -1) return raw.Trim();
        contentStart++;

        var endIdx = raw.IndexOf(fenceEnd, contentStart, StringComparison.Ordinal);
        return endIdx == -1
            ? raw[contentStart..].Trim()
            : raw[contentStart..endIdx].Trim();
    }
}
