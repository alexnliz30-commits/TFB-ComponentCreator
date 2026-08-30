using System.Text;
using System.Text.Json.Nodes;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using Microsoft.Extensions.Options;
using Visualiza.Application.Abstractions;
using Visualiza.Application.Components;
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

    /// <summary>
    /// Única puerta hacia la API de Claude, para traducir sus fallos ESPERADOS.
    /// </summary>
    /// <remarks>
    /// Una clave inválida, un límite de uso o un proveedor saturado no son errores del
    /// programa: son condiciones previsibles con una respuesta útil que dar. Salían por
    /// el manejador de excepciones como un 500 y la persona que estaba escribiendo en el
    /// chat solo veía «Backend respondió 500». Aquí se convierten en
    /// <see cref="ComponentGeneratorUnavailableException"/>, que los casos de uso saben
    /// explicar.
    ///
    /// Lo que NO se traduce es tan importante como lo que sí: un 400, un 404 o un 422
    /// significan que la petición que construimos está mal, y eso es un fallo nuestro
    /// que debe seguir saliendo como tal para que se arregle en vez de disfrazarse de
    /// «el proveedor no está disponible».
    /// </remarks>
    private async Task<Message> CreateAsync(MessageCreateParams parameters, CancellationToken cancellationToken)
    {
        try
        {
            return await _client.Messages.Create(parameters, cancellationToken: cancellationToken);
        }
        catch (AnthropicUnauthorizedException ex)
        {
            throw ComponentGeneratorUnavailableException.BadKey(ex);
        }
        catch (AnthropicForbiddenException ex)
        {
            throw ComponentGeneratorUnavailableException.BadKey(ex);
        }
        catch (AnthropicRateLimitException ex)
        {
            throw ComponentGeneratorUnavailableException.RateLimited(ex);
        }
        catch (AnthropicServiceException ex)
        {
            throw ComponentGeneratorUnavailableException.ProviderDown(ex);
        }
        catch (AnthropicIOException ex)
        {
            throw ComponentGeneratorUnavailableException.ProviderDown(ex);
        }
    }

    private async Task<string> CompleteAsync(string system, string user, CancellationToken cancellationToken)
    {
        var response = await CreateAsync(new MessageCreateParams
        {
            Model = _options.Model,
            // El límite cubre razonamiento Y respuesta. Con 16000 una petición
            // ambigua agotaba el presupuesto razonando y la respuesta llegaba
            // VACÍA, que aguas abajo se confundía con «no había nada que hacer».
            MaxTokens = 32000,
            // Pensamiento adaptativo: Claude decide cuánto razonar según la tarea.
            Thinking = new ThinkingConfigAdaptive(),
            System = new List<TextBlockParam> { new() { Text = system } },
            Messages = [new() { Role = Role.User, Content = user }],
        }, cancellationToken);

        // Los bloques de thinking preceden al texto; solo interesa el texto.
        var text = string.Concat(response.Content
            .Select(block => block.Value)
            .OfType<TextBlock>()
            .Select(t => t.Text));

        // Sin texto no hay nada que interpretar aguas abajo, y el motivo (se
        // agotó el presupuesto razonando, la respuesta se cortó…) solo se sabe
        // aquí. Sin esta traza el fallo llega al usuario como una respuesta
        // vacía indistinguible de «no había nada que hacer».
        if (string.IsNullOrWhiteSpace(text))
        {
            var blocks = string.Join(", ", response.Content.Select(b => b.Value?.GetType().Name ?? "null"));
            Console.Error.WriteLine(
                $"[Anthropic] Respuesta sin texto. StopReason={response.StopReason}, bloques=[{blocks}], "
                + $"tokens salida={response.Usage?.OutputTokens}.");
        }

        return text;
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
        // Sin esto el modelo produce anchos y rejillas fijos, y el componente se
        // sale de un móvil. Importa más aquí que en ninguna otra parte: el código
        // generado NO pasa por el esquema del constructor, así que no hay ninguna
        // otra capa que pueda corregirlo después.
        sb.AppendLine("Adaptable a cualquier pantalla (obligatorio, se comprueba a 375, 768 y 1280 px):");
        sb.AppendLine("- Mobile-first: la clase sin prefijo describe el MÓVIL y los prefijos sm:/md:/lg: van ampliando. Nunca al revés.");
        sb.AppendLine("- Rejillas: empieza en una columna y amplía — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Nunca un `grid-cols-N` fijo con N>1.");
        sb.AppendLine("- Filas: `flex-wrap` siempre que quepan varios elementos, o `flex-col md:flex-row` si deben apilarse en móvil.");
        sb.AppendLine("- Anchos: usa `w-full` con un tope (`max-w-md`, `max-w-2xl`) en lugar de un ancho fijo. Si pones un ancho en píxeles, acompáñalo SIEMPRE de `max-w-full`.");
        sb.AppendLine("- `min-w-` con una medida fija SOLO dentro de un contenedor con `overflow-x-auto` (donde lo que sobra se desplaza). Suelto desborda la pantalla sin remedio, porque en CSS `min-width` gana a `max-width`.");
        sb.AppendLine("- Tablas: envuélvelas en `<div class=\"w-full overflow-x-auto\">`; una celda no encoge por debajo de su contenido.");
        sb.AppendLine("- Evita posicionar en píxeles absolutos (`absolute left-[820px]`). Si necesitas superponer, ancla a un borde (`absolute top-4 right-4`) o usa porcentajes, que se adaptan solos.");
        sb.AppendLine("- Tipografía y espaciado: tamaños base cómodos en móvil y ampliados con `md:`/`lg:` (p. ej. `text-2xl md:text-3xl`, `p-4 md:p-6`).");
        sb.AppendLine("- Nada debe provocar desplazamiento horizontal de la página a 375 px de ancho.");
        sb.AppendLine();
        // El código generado se entrega para leerlo y mantenerlo, no solo para
        // que compile: es lo que el usuario se lleva. Sin estas reglas el modelo
        // produce componentes correctos pero con la misma cadena de clases
        // repetida cinco veces y bloques JSX calcados uno debajo de otro.
        sb.AppendLine("Calidad del código (se lee y se mantiene, no solo se ejecuta):");
        sb.AppendLine("- DRY: si una lista de clases se repite en dos o más elementos, extráela a una constante de módulo con nombre (`const CLASES_CAMPO = \"…\"`). Si dos o más elementos solo difieren en sus datos, NO los escribas uno debajo de otro: declara un array de datos con nombre y recórrelo con `.map()` usando una `key` estable.");
        sb.AppendLine("- Una responsabilidad por función: extrae la validación, el formateo y los cálculos derivados a funciones puras con nombre propio, fuera del cuerpo del render. Un manejador de evento decide y delega; no valida, formatea y transforma a la vez.");
        sb.AppendLine("- KISS: la solución más simple que cumpla el requisito. Nada de abstracciones para un solo uso, estado que se pueda derivar de otro estado, ni `useEffect` para calcular lo que se puede calcular al renderizar.");
        // Identificadores en INGLÉS, contenido en español: son dos cosas distintas.
        // El texto lo lee el usuario final; los nombres los lee quien mantiene el
        // código, que acaba junto al de terceros en cuanto el paquete se integra.
        sb.AppendLine("- IDIOMA: los identificadores del código —variables, funciones, tipos, props, constantes— y los comentarios van en INGLÉS (`selectedQuantity`, `hasErrors`, `formatPrice`). El CONTENIDO visible —textos, etiquetas, placeholders, mensajes de error— va en español. Nunca al revés.");
        sb.AppendLine("- Nombres que expliquen la intención y sin abreviar, nunca `a`, `tmp`, `data1` ni `flag`.");
        sb.AppendLine("- Sin números ni cadenas mágicas: los umbrales, límites y textos repetidos van a constantes con nombre (`const MAXIMO_UNIDADES = 10`).");
        sb.AppendLine("- Sin código muerto: nada de variables, props, estados o ramas que no se usen, ni comentarios que repitan lo que el código ya dice. Comenta solo el porqué de una decisión que no se deduzca leyendo.");
        sb.AppendLine("- Tipado honesto: nombra los tipos del dominio (`type Campos = {…}`) en vez de repetir la forma; no anotes lo que se infiere solo; `any` únicamente en el parámetro de un manejador de evento.");
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
            // Refinar es donde el código se degrada: cada instrucción añade un
            // bloque nuevo junto a los anteriores, y a la tercera el componente
            // es una pila de JSX calcado. Las reglas de calidad tienen que
            // repetirse aquí o solo valen para el primer disparo.
            "- Mantén la calidad del código al modificarlo, y aprovecha para mejorarla si el cambio lo permite: clases repetidas a una constante con nombre, elementos que solo difieren en datos a un array con `.map()`, lógica de validación o formateo en funciones puras con nombre propio, sin números ni cadenas mágicas, sin código muerto.\n" +
            "- IDIOMA: identificadores y comentarios en INGLÉS; el contenido visible (textos, etiquetas, mensajes) en español. Si el componente que recibes los mezcla, renombra los identificadores al inglés sin tocar el contenido.\n" +
            "- No dupliques para no tocar lo existente: si la instrucción pide algo parecido a lo que ya hay, generaliza lo que hay en vez de añadir una copia al lado.\n" +
            // El refinado tiene que conservar la adaptabilidad además de no
            // romperla: una instrucción como «ponlo en tres columnas» invita a
            // escribir `grid-cols-3` a secas y a deshacer lo que ya estaba bien.
            "- El componente debe seguir sirviendo a 375, 768 y 1280 px: mobile-first, rejillas que empiecen en `grid-cols-1` y amplíen con sm:/md:/lg:, filas con `flex-wrap`, anchos con `w-full` + tope en vez de medidas fijas (y `max-w-full` si pones píxeles), tablas dentro de `overflow-x-auto`, y nada que provoque desplazamiento horizontal a 375 px.\n" +
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
            "  \"events\": [ { \"event\": \"click|change|submit|blur|focus|mouseenter|mouseleave|dblclick\", \"actions\": [ { \"kind\": \"toggle|set|increment|reset|call\", \"target\": \"<variable, o aviso si kind=call>\", \"value\": \"<solo si kind=set>\", \"by\": \"<solo si kind=increment>\" } ] } ],\n" +
            "  \"visibleIf\": <condición>,\n" +
            "  \"validations\": [ { \"kind\": \"required|minLength|maxLength|pattern|email|min|max\", \"value\": \"<parámetro si aplica>\", \"message\": \"<mensaje opcional en español>\" } ],\n" +
            "  \"styleRules\": [ { \"when\": <condición>, \"className\": \"<clases que se AÑADEN si se cumple>\" } ]\n" +
            "}\n" +
            "Una <condición> es `{ \"var\": \"<variable>\", \"op\": \"<op>\", \"value\": \"<valor>\" }` para mirar el " +
            "estado, o `{ \"field\": \"<campo>\", \"op\": \"<op>\", \"value\": \"<valor>\" }` para mirar el dato que " +
            "el bloque está pintando. `op` es uno de: is, not, gt, lt, contains, empty, filled " +
            "(`empty` y `filled` ignoran `value`).\n" +
            "Reglas estrictas:\n" +
            "- Devuelve únicamente el JSON, sin explicaciones ni vallas de código.\n" +
            "- Todos los valores de `props` deben ser cadenas.\n" +
            "- `target` y `var` solo pueden ser nombres de `allowedVariableNames`; `field`, de " +
            "`allowedFieldNames`; y el `target` de una acción `call`, de `allowedCallbackNames`. " +
            "Si la petición necesita algo que no existe, no lo inventes: omite esa parte del parche.\n" +
            "- Para cambiar el aspecto SIEMPRE, modifica la prop `className`. Para cambiarlo SOLO " +
            "cuando se cumple algo («en rojo si el stock es cero»), usa `styleRules`: sus clases se " +
            "añaden a las de `className`, así que escribe solo lo que cambia.\n" +
            "- Una condición con `field` se evalúa por cada elemento, así que solo tiene efecto " +
            "dentro de un bloque repetidor o de sus descendientes.\n" +
            "- `kind: \"call\"` avisa a la aplicación anfitriona (borrar, navegar, confirmar): es para " +
            "lo que el componente no puede resolver por sí mismo.\n" +
            "- `visibleIf: null` elimina la condición de visibilidad.\n" +
            "- `validations` solo tiene sentido en bloques de campo (input, textarea, select, checkbox, " +
            "date-picker). `pattern` debe ser una expresión regular válida de JavaScript.\n" +
            "- Si la instrucción no es aplicable a este bloque, devuelve {}.",
            $"Bloque:\n{contextJson}\n\nInstrucción: {instruction}",
            cancellationToken);
        return ExtractJsonObject(raw);
    }

    public Task<string> AssistAsync(
        string contextJson,
        string message,
        CancellationToken cancellationToken = default)
        => AssistAsync(contextJson, message, null, null, cancellationToken);

    public async Task<string> AssistAsync(
        string contextJson,
        string message,
        IReadOnlyList<AssistImage>? images,
        IReadOnlyList<AssistTurn>? history,
        CancellationToken cancellationToken = default)
    {
        var raw = await CompleteAssistAsync(contextJson, message, images, history, cancellationToken);
        return ExtractJsonObject(raw);
    }

    /// <summary>
    /// Petición del asistente con la conversación completa y, si las hay, las
    /// imágenes adjuntas del último turno.
    /// </summary>
    /// <remarks>
    /// El contexto de la plataforma va en el ÚLTIMO mensaje y no en el sistema porque
    /// cambia en cada turno: el árbol de bloques de hace tres preguntas ya no es el
    /// actual, y dejarlo en el historial haría que el modelo trabajara sobre un lienzo
    /// que ya no existe.
    ///
    /// Las imágenes van antes del texto en el mismo bloque de contenido: es el orden
    /// que recomienda Anthropic para que el modelo mire la imagen antes de leer lo que
    /// se le pide sobre ella.
    /// </remarks>
    private async Task<string> CompleteAssistAsync(
        string contextJson,
        string message,
        IReadOnlyList<AssistImage>? images,
        IReadOnlyList<AssistTurn>? history,
        CancellationToken cancellationToken)
    {
        var messages = new List<MessageParam>();

        foreach (var turn in history ?? [])
        {
            messages.Add(new MessageParam
            {
                Role = turn.Role == "assistant" ? Role.Assistant : Role.User,
                Content = turn.Content,
            });
        }

        var blocks = new List<ContentBlockParam>();
        foreach (var image in images ?? [])
        {
            blocks.Add(new ImageBlockParam
            {
                Source = new Base64ImageSource
                {
                    MediaType = image.MediaType,
                    Data = image.DataBase64,
                },
            });
        }
        blocks.Add(new TextBlockParam
        {
            Text = $"Contexto de la plataforma:\n{contextJson}\n\nPetición del usuario: {message}",
        });

        messages.Add(new MessageParam { Role = Role.User, Content = blocks });

        var response = await CreateAsync(new MessageCreateParams
        {
            Model = _options.Model,
            MaxTokens = 32000,
            Thinking = new ThinkingConfigAdaptive(),
            System = new List<TextBlockParam> { new() { Text = AssistSystemPrompt } },
            Messages = messages,
        }, cancellationToken);

        var text = string.Concat(response.Content
            .Select(block => block.Value)
            .OfType<TextBlock>()
            .Select(t => t.Text));

        if (string.IsNullOrWhiteSpace(text))
        {
            var kinds = string.Join(", ", response.Content.Select(b => b.Value?.GetType().Name ?? "null"));
            Console.Error.WriteLine(
                $"[Anthropic] Asistente sin texto. StopReason={response.StopReason}, bloques=[{kinds}], "
                + $"imágenes={images?.Count ?? 0}, turnos={history?.Count ?? 0}, "
                + $"tokens salida={response.Usage?.OutputTokens}.");
        }

        return text;
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
        "PREGUNTAR ANTES DE CONSTRUIR: preguntar forma parte de tu trabajo, tanto al empezar de " +
        "cero como en mitad del trabajo sobre un componente ya montado.\n" +
        "\n" +
        "LA PRUEBA, aplícala SIEMPRE antes de responder: ¿podrías construir dos componentes " +
        "claramente distintos que cumplan la petición igual de bien? Si la respuesta es sí, " +
        "PREGUNTA en vez de elegir por tu cuenta. Elegir a ciegas produce un componente que el " +
        "usuario tendrá que rehacer, y rehacerlo cuesta más que contestar una pregunta.\n" +
        "Casos típicos en los que la prueba sale que sí:\n" +
        "- «hazme un formulario» → ¿de qué? ¿con qué campos? Un registro, un login, un contacto " +
        "y un alta de producto son componentes completamente distintos.\n" +
        "- «una tabla», «un panel», «una tarjeta» a secas → ¿de qué datos? ¿qué columnas?\n" +
        "- Sobre un componente ya montado, si lo pedido choca con lo que hay: ¿sustituyo lo " +
        "existente o lo añado al lado? ¿el cambio va en este bloque o en todos los de su tipo? " +
        "¿dónde lo coloco, si hay varios sitios razonables?\n" +
        "\n" +
        "NO preguntes lo que puedes decidir tú con buen criterio —colores, espaciado, tamaños, " +
        "textos de ejemplo, qué bloque concreto usar, cómo llamar a una variable— ni lo que el " +
        "usuario YA te ha dicho: eso es devolverle el trabajo. Si la petición ya nombra su " +
        "contenido («tarjeta de producto con imagen, título, precio y botón»), la prueba sale " +
        "que no: construye directamente.\n" +
        "\n" +
        "Cuando preguntes: UNA sola pregunta, breve y concreta, con 2-4 valores en `options` " +
        "redactados como los contestaría el usuario. NO incluyas `tree`: no se construye nada " +
        "hasta tener la respuesta, y ofrecer a la vez un componente y una pregunta obliga al " +
        "usuario a revisar algo que quizá descarte. Con la respuesta en la mano, construye ya: " +
        "nunca dos rondas seguidas de preguntas. Si contesta algo que no estaba entre las " +
        "opciones, hazle caso igual.\n" +
        "\n" +
        "TECNOLOGÍA DESTINO: el contexto trae `target` con el framework, el lenguaje y la " +
        "extensión a los que se va a emitir este componente (React o Vue 3; TypeScript o " +
        "JavaScript). El árbol que devuelves NO cambia por eso —es el mismo para los cuatro " +
        "destinos, y esa es la razón de que exista— pero tus EXPLICACIONES sí: no hables de " +
        "hooks ni de `useState` si el destino es Vue, ni de tipos, interfaces o anotaciones si " +
        "el destino es JavaScript. Si el usuario pregunta cómo integrar o usar el componente, " +
        "respóndele en los términos de SU tecnología. Nunca le propongas cambiar de tecnología: " +
        "esa la elige él en el constructor.\n" +
        "\n" +
        "IMPORTANTE — un componente, no una aplicación:\n" +
        "- Construyes UN componente coherente (un formulario, una tarjeta, una tabla, un panel...), no una " +
        "página entera ni varias secciones sin relación. Si el usuario pide \"más lógica\", esa lógica va " +
        "DENTRO del componente como funcionalidad: estado (`stateVars`), eventos (`events`), visibilidad " +
        "condicional (`visibleIf`), estilo condicional (`styleRules`) y validación de campos " +
        "(`validations`) sobre los bloques existentes. " +
        "No añadas páginas, rutas ni bloques decorativos que no formen parte del componente pedido.\n" +
        "\n" +
        "Modelo de datos del árbol (`tree`):\n" +
        "- `blocks`: mapa id → bloque. Cada bloque tiene `id` (cadena `block-N`), `type`, `props` " +
        "(mapa de cadenas → cadenas), `children` (lista de ids), y opcionalmente `events` y `visibleIf`.\n" +
        "- `rootIds`: ids de los bloques raíz, en orden de aparición.\n" +
        "\n" +
        "POSICIÓN (crítico): el orden de `children` y de `rootIds` ES la posición visual, de arriba " +
        "abajo. Cuando el usuario diga «debajo de», «encima de», «el primero», «al final» o «entre X e Y», " +
        "coloca el id en ese punto exacto de la lista; no lo añadas al final por comodidad. Para mover un " +
        "bloque, cámbialo de sitio en la lista conservando su id. Y cada bloque debe aparecer EXACTAMENTE " +
        "una vez en todo el árbol: ni en dos listas de `children`, ni en `children` y en `rootIds` a la vez. " +
        "Un id repetido se descarta al validar y el bloque acabaría en un sitio que no es el que pediste.\n" +
        "- `stateVars`: variables de estado del componente `{ name, type: \"boolean|number|string\", initial }`.\n" +
        "- `events`: `[ { event: \"click|change|submit|blur|focus|mouseenter|mouseleave|dblclick\", actions: [ { kind: \"toggle|set|increment|reset|call\", target, value?, by? } ] } ]`. " +
        "En las cuatro primeras, `target` es una variable de `stateVars`; en `call`, un aviso de `callbacks`.\n" +
        "- `visibleIf`: una <condición> (ver más abajo). El bloque solo existe si se cumple.\n" +
        "- `styleRules`: `[ { when: <condición>, className: \"<clases>\" } ]`. Las clases se AÑADEN a las " +
        "de `props.className` cuando la condición se cumple, así que escribe solo lo que cambia. Es la " +
        "forma de responder a una regla de negocio sin hacer desaparecer el bloque: «la fila agotada en " +
        "rojo» es `styleRules`, no `visibleIf`.\n" +
        "\n" +
        "CONDICIONES (`visibleIf` y `styleRules.when`) — una de estas dos formas:\n" +
        "- Sobre el estado: `{ var, op, value }`, donde `var` debe existir en `stateVars`.\n" +
        "- Sobre el dato que el bloque está pintando: `{ field, op, value }`, donde `field` debe ser un " +
        "campo de `dataModel`. Se evalúa POR CADA elemento, así que solo tiene efecto dentro de un bloque " +
        "repetidor (`props.repeatOver: \"true\"`) o de sus descendientes.\n" +
        "- `op` es uno de: `is`, `not`, `gt` (mayor), `lt` (menor), `contains`, `empty`, `filled`. " +
        "`empty` y `filled` no comparan contra nada e ignoran `value`.\n" +
        "\n" +
        "DATOS Y AVISOS: el contexto puede traer `dataModel` (lo que el componente recibe de fuera: un " +
        "elemento con campos tipados) y `callbacks` (props de función con las que avisa a la aplicación " +
        "que lo integra). NO los declaras tú: los declara el usuario en su panel, y tú puedes usarlos.\n" +
        "- Para pintar un campo, pon `props.bindField: \"<campo>\"` en un bloque de texto (span, p, h1…) " +
        "que esté dentro del repetidor.\n" +
        "- Para repetir un bloque por cada elemento, `props.repeatOver: \"true\"`.\n" +
        "- Para avisar a la aplicación, una acción `{ kind: \"call\", target: \"<nombre del callback>\" }`. " +
        "Es para lo que el componente no puede resolver solo: borrar, navegar, confirmar.\n" +
        "- `validations` (solo en bloques de campo: input, textarea, select, checkbox, date-picker): " +
        "`[ { kind: \"required|minLength|maxLength|pattern|email|min|max\", value?, message? } ]`. " +
        "`value` es el parámetro (longitud, límite o expresión regular válida); `message` es el texto en " +
        "español a mostrar (omítelo para usar el mensaje por defecto). El campo se valida solo: al salir " +
        "de él y al enviar el formulario que lo contiene, que además bloquea el envío si algo falla. " +
        "NO montes la validación a mano con estado y visibilidad: usa `validations`. " +
        "Cuando el usuario pida un formulario, añade las validaciones que el contenido pida por sentido " +
        "común (correo → email, campos imprescindibles → required), y al botón que envía ponle " +
        "`buttonType: \"submit\"` en sus props, o el envío no se disparará.\n" +
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
        // La lista NO se enumera aquí. `palette` llega en cada petición derivada
        // de `BLOCK_DEFINITIONS`, y repetirla en el prompt la dejaba
        // desincronizada a la primera que se añadía un contenedor —pasó al
        // añadir la tabla componible, cuyas celdas la IA no habría usado nunca—.
        "- Solo los tipos contenedores llevan hijos en `children`: exactamente los que en `palette` " +
        "traen `isContainer: true`. El resto deben tener `children: []`.\n" +
        "- Para una tabla con controles dentro (botones de acción por fila, badges de estado, " +
        "switches) usa la tabla COMPONIBLE —`table-c` › `thead-c`/`tbody-c` › `tr` › `th`/`td`—, cuyas " +
        "celdas admiten cualquier bloque con sus eventos. `table-ui` y `data-grid` toman sus datos de " +
        "props y no admiten controles dentro.\n" +
        "\n" +
        "CALIDAD DEL ÁRBOL: el árbol que devuelves se traduce a código React que una persona va a leer y " +
        "mantener, así que la estructura que elijas determina la calidad de ese código. Reglas:\n" +
        "- Usa el bloque específico antes que componerlo a mano: una tabla es `table-ui` con `headers` y " +
        "`rows`, no veinte `div` anidados; una lista es `ul`/`ol` con `items`. El emisor pliega esos datos " +
        "en constantes con `.map()`, mientras que los bloques sueltos se emiten uno a uno y ensucian el " +
        "resultado (DRY).\n" +
        "- Un bloque por responsabilidad: no metas en `text` contenido que corresponde a otro bloque, ni " +
        "abuses de contenedores anidados sin motivo. Si un `div` no aporta agrupación ni estilo, sobra (KISS).\n" +
        "- Semántica y accesibilidad: usa `header`, `nav-html`, `main`, `footer`, `form`, `fieldset` y los " +
        "niveles de encabezado correctos en vez de `div` genéricos. Los campos de formulario llevan su " +
        "etiqueta.\n" +
        "- Estado mínimo: declara en `stateVars` solo lo que algún bloque lea o escriba, con nombres " +
        "descriptivos en INGLÉS (`modalOpen`, `currentStep`), nunca `a`, `x` o `flag` —el contenido visible sí va en español—. Las variables sin " +
        "usar se descartan al emitir.\n" +
        "\n" +
        "ESTILOS: `className` con clases utilitarias de Tailwind 3 es la ÚNICA forma de estilar.\n" +
        "\n" +
        "VOCABULARIO CERRADO (crítico para que se vea): el contexto incluye `styleVocabulary` con las " +
        "ÚNICAS utilidades que el lienzo sabe pintar. Su CSS se compila por adelantado, así que una clase " +
        "que no esté en ese vocabulario NO TIENE REGLA: se guarda en el bloque y no se ve nada, sin ningún " +
        "error. Reglas:\n" +
        "- Usa solo utilidades que encajen en la gramática de `styleVocabulary` (sus grupos indican los " +
        "prefijos válidos, y `escalaEspaciado`, `familiasColor` y `tonosColor` los valores admitidos).\n" +
        "- Las variantes válidas son las de `variantesPantalla` (`sm: md: lg: xl:`) y `variantesEstado` " +
        "(`hover: focus: disabled:`…), y solo sobre los grupos que las admiten.\n" +
        "- No inventes valores arbitrarios entre corchetes (`w-[347px]`, `bg-[#ff0000]`): no tienen regla. " +
        "La única excepción son los roles del tema, que aparecen listados abajo.\n" +
        "- Ante la duda entre una utilidad exótica y una corriente, elige la corriente.\n" +
        "\n" +
        // El esquema ya pliega la colocación en píxeles y capa los anchos fijos,
        // pero no puede adivinar una intención: que una rejilla de 4 columnas
        // deba ser de 1 en móvil es una decisión de diseño, no una corrección.
        "ADAPTABLE A CUALQUIER PANTALLA (por defecto, sin que haga falta pedirlo):\n" +
        "- Mobile-first: la clase sin prefijo describe el MÓVIL, y `sm: md: lg:` van ampliando. Nunca al revés.\n" +
        "- Rejillas: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, nunca un `grid-cols-N` fijo con N>1.\n" +
        "- Filas de varios elementos: `flex-wrap`, o `flex-col md:flex-row` cuando deban apilarse en móvil.\n" +
        "- Anchos: `w-full` con un tope (`max-w-md`, `max-w-2xl`) antes que una medida fija.\n" +
        "- Para superponer un bloque, ancla a un borde (`absolute top-4 right-4`) o usa `left-1/2`: eso se " +
        "adapta solo. Un desplazamiento en píxeles solo vale en el ancho en que se midió.\n" +
        "- Un componente que necesita desplazamiento horizontal para verse en un móvil está mal hecho.\n" +
        "\n" +
        "La librería tiene un TEMA global (color de marca, tipografía, redondeo) que comparten todos sus " +
        "componentes, expresado como variables CSS. Para que lo que crees respete ese tema y cambie con él, " +
        "usa los ROLES en lugar de colores literales:\n" +
        "- Fondos: `bg-[var(--vz-superficie)]` (tarjetas, campos), `bg-[var(--vz-superficie-alt)]` (cabeceras, " +
        "zonas destacadas), `bg-[var(--vz-primario)]` (acción principal).\n" +
        "- Texto: `text-[color:var(--vz-texto)]` (principal), `text-[color:var(--vz-texto-suave)]` " +
        "(secundario), `text-[color:var(--vz-primario-contraste)]` (sobre el primario), " +
        "`text-[color:var(--vz-primario)]` (enlaces y acentos).\n" +
        "- Líneas: `border-[color:var(--vz-borde)]`, `ring-[color:var(--vz-primario)]`.\n" +
        "- Estados: `--vz-exito`, `--vz-aviso`, `--vz-error` con la misma forma.\n" +
        "- Redondeo: `rounded-[var(--vz-radio)]`.\n" +
        "El resto (espaciado, tamaños de texto, flex/grid, hover, focus, transiciones) va con clases Tailwind " +
        "normales. Usa un color literal SOLO si el usuario pide expresamente ese color concreto: si lo haces, " +
        "ese bloque dejará de seguir el tema, que es justo lo que habrá pedido.\n" +
        "\n" +
        "IMÁGENES ADJUNTAS: cuando el usuario adjunta una captura, un boceto o un diseño, esa imagen es " +
        "la especificación. Sigue este flujo, un paso por turno y sin saltarte ninguno:\n" +
        "\n" +
        "PASO 1 — INVENTARIO. Mira la imagen y enumera qué componentes contiene, entendiendo por " +
        "componente una unidad reutilizable (una tarjeta, un formulario, una barra de navegación, una " +
        "tabla, un panel de estadísticas), no cada caja ni cada texto. Responde SOLO con el recuento y la " +
        "lista breve («Veo 3 componentes: una barra de navegación, una tarjeta de producto y un " +
        "formulario de contacto»), y pregunta si es correcto, ofreciendo en `options` " +
        "[\"Sí, adelante\", \"Solo algunos\", \"Es un único componente\"]. NO construyas nada todavía.\n" +
        "\n" +
        "PASO 2 — DESTINO. Pregunta dónde deben ir, con `options` construidas a partir de `libraries` del " +
        "contexto: una opción por librería existente con su nombre real («Añadir a Mi Kit»), más " +
        "\"Crear una librería nueva\" y \"Sin librería\". Si `libraries` viene vacío, ofrece solo las dos " +
        "últimas. Nunca inventes nombres de librería.\n" +
        "\n" +
        "PASO 3 — ESTILOS. Pregunta si aplicar los estilos consolidados del destino —el `theme` del " +
        "contexto, descrito por su color primario y su tipografía— o respetar los colores y formas que se " +
        "ven en la imagen, con `options` [\"Aplicar los estilos de la librería\", \"Respetar la imagen\"]. Si " +
        "eligen los de la librería, usa los roles del tema; si eligen la imagen, usa las utilidades " +
        "corrientes del vocabulario que más se aproximen a lo que ves.\n" +
        "\n" +
        "PASO 4 — ALCANCE FUNCIONAL. Pregunta qué debe llevar cada componente, en una sola pregunta con " +
        "`options` [\"Solo la estructura visual\", \"Con estado y eventos\", \"Con validaciones y estado\"]. " +
        "Una imagen no dice si un botón abre un modal ni si un campo es obligatorio: eso hay que " +
        "preguntarlo, no inventarlo.\n" +
        "\n" +
        "PASO 5 — CONSTRUIR. Con las respuestas, devuelve la tanda en `components`: un elemento por " +
        "componente identificado, cada uno con su `name` (descriptivo, en español, sin repetir los de " +
        "`project.components`) y su `tree` completo. Con un único componente usa `tree` a secas, no " +
        "`components`. Los componentes de una tanda deben ser ATÓMICOS: cada uno independiente y " +
        "reutilizable por separado, sin que uno contenga a otro. Si en la imagen un elemento aparece " +
        "repetido (tres tarjetas iguales), es UN componente, no tres.\n" +
        "\n" +
        "EL ALCANCE ELEGIDO HAY QUE MATERIALIZARLO, no solo anunciarlo. Si el usuario pidió estado y " +
        "eventos, CADA componente de la tanda al que le corresponda debe llevar `stateVars` no vacío y " +
        "`events` en los bloques que reaccionan; si pidió validaciones, los campos llevan `validations`. " +
        "Un botón «Añadir al carrito» que no cambia nada al pulsarlo, o un menú que no se despliega, NO " +
        "cumplen lo pedido aunque el texto diga que sí. Y `reply` solo puede afirmar lo que el árbol " +
        "contiene de verdad: describir un comportamiento que no está es el peor resultado posible, " +
        "porque el usuario lo da por hecho y no lo comprueba. Si un componente es legítimamente " +
        "estático (un pie de página, un texto), dilo en vez de inventarle estado.\n" +
        "\n" +
        "En los pasos 1 a 4 las respuestas rápidas van SIEMPRE en el campo `options` del JSON, nunca " +
        "escritas dentro de `reply`: en `reply` va solo la pregunta. Enumerarlas en el texto las " +
        "convierte en algo que el usuario tiene que teclear a mano en vez de pulsar.\n" +
        "\n" +
        "Salta un paso solo cuando el usuario ya lo haya contestado —en la petición o en un turno " +
        "anterior— y NUNCA repitas una pregunta ya respondida: el historial de la conversación va " +
        "incluido, léelo antes de preguntar. Si el usuario dice «hazlo todo tú» o equivalente, aplica los " +
        "valores por defecto (proyecto actual sin librería nueva, estilos de la librería, estado y " +
        "eventos) y construye.\n" +
        "\n" +
        "Formato de respuesta: SOLO un objeto JSON, sin vallas ni texto fuera de él:\n" +
        "{ \"reply\": \"<respuesta breve al usuario, en español>\", \"tree\": { \"blocks\": {...}, \"rootIds\": [...], \"stateVars\": [...] }, \"options\": [\"<respuesta rápida>\", ...] }\n" +
        "Para varios componentes de una vez, en lugar de `tree`:\n" +
        "{ \"reply\": \"...\", \"components\": [ { \"name\": \"Tarjeta de producto\", \"tree\": { \"blocks\": {...}, \"rootIds\": [...], \"stateVars\": [...] } }, ... ], " +
        "\"target\": { \"kind\": \"existing|new|none\", \"libraryId\": \"<solo si existing>\", \"libraryName\": \"<solo si new>\" } }\n" +
        "`target` es OBLIGATORIO siempre que devuelvas `components`: es lo que hace que el destino que " +
        "preguntaste en el PASO 2 se lleve a cabo de verdad. `libraryId` debe ser un id de `libraries` " +
        "del contexto, nunca inventado; `libraryName` es el nombre de la librería nueva a crear. Si el " +
        "usuario no quiso librería, `{ \"kind\": \"none\" }`.\n" +
        "Reglas estrictas de la respuesta:\n" +
        "- `tree` y `components` son excluyentes: uno u otro, nunca los dos.\n" +
        "- En una tanda, los ids de bloque son independientes por componente: cada `tree` es un árbol " +
        "completo por sí mismo.\n" +
        "- Incluye `tree` SIEMPRE que la petición implique crear o cambiar algo en el lienzo (que es lo " +
        "habitual). Para una pregunta o explicación pura, devuelve solo `reply`.\n" +
        "- `options` solo acompaña a una pregunta, y entonces `reply` ES la pregunta y no hay `tree`. " +
        "Una pregunta se devuelve con EXACTAMENTE esta forma, como objeto JSON y nunca como texto " +
        "suelto ni escribiendo «options:» dentro de `reply`:\n" +
        "{ \"reply\": \"¿Qué tipo de formulario necesitas?\", \"options\": [\"Registro de usuario\", \"Inicio de sesión\", \"Contacto\"] }\n" +
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
        if (start != -1 && end > start) return text[start..(end + 1)];

        // Sin JSON en la respuesta. Ocurre sobre todo cuando el modelo hace una
        // pregunta: contesta en prosa, como en una conversación normal, en vez
        // de envolverla en el formato. Descartarla obligaría al usuario a
        // repetir la petición para leer algo que el modelo ya había dicho, así
        // que se acepta como respuesta conversacional: no trae árbol, luego no
        // puede tocar el lienzo.
        return new JsonObject { ["reply"] = text }.ToJsonString();
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
