using System.ComponentModel;
using System.Diagnostics;
using Visualiza.Application.Abstractions;

namespace Visualiza.Infrastructure.Components;

/// <summary>
/// Compila la hoja de estilos autocontenida de un componente con la CLI de Tailwind.
///
/// Comparte entorno y limitaciones con <see cref="TsxCompilationChecker"/>: ambos
/// dependen de Node, que deliberadamente no está en las imágenes de contenedor. Sin él
/// la exportación sigue funcionando y el paquete se entrega con las clases Tailwind sin
/// resolver, informándolo explícitamente en vez de adjuntar una hoja vacía.
/// </summary>
public sealed class TailwindStylesheetCompiler : IStylesheetCompiler
{
    /// <summary>Clase que el componente exportado aplica en su raíz. Acota el reset.</summary>
    public const string RootClass = "visualiza-component";

    // Misma resolución por ruta absoluta que el harness TSX: invocar "npx" por nombre
    // falla en Windows porque cmd.exe expande %~dp0 contra el directorio de trabajo.
    private static readonly Lazy<string?> NpxPath = new(ResolveNpx);

    private static string? ResolveNpx()
    {
        var candidates = OperatingSystem.IsWindows()
            ? new[] { "npx.cmd", "npx.exe", "npx" }
            : new[] { "npx" };

        var pathVar = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var dir in pathVar.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var candidate in candidates)
            {
                try
                {
                    var full = Path.Combine(dir.Trim().Trim('"'), candidate);
                    if (File.Exists(full)) return full;
                }
                catch (ArgumentException)
                {
                    // Entrada del PATH con caracteres inválidos: se ignora.
                }
            }
        }

        return null;
    }

    public async Task<StylesheetResult> CompileAsync(
        string markup,
        string? customStyles,
        bool stylesAreSass,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(markup))
            return StylesheetResult.Failed("No hay marcado del que extraer clases.");

        var npx = NpxPath.Value;
        if (npx is null)
        {
            return StylesheetResult.ToolchainMissing(
                "No se encontró npx en el PATH: el paquete se entrega sin hoja de estilos " +
                "autocontenida y requiere Tailwind en el proyecto anfitrión.");
        }

        var workDir = Path.Combine(Path.GetTempPath(), "visualiza-css", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(workDir);

        try
        {
            await File.WriteAllTextAsync(Path.Combine(workDir, "markup.tsx"), markup, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(workDir, "tailwind.config.js"), TailwindConfig, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(workDir, "input.css"), BuildInput(), cancellationToken);

            // La versión va fijada a la 3 por dos motivos, ambos comprobados:
            // "-p tailwindcss" a secas resuelve la 4, donde la CLI se movió al paquete
            // aparte @tailwindcss/cli y la invocación falla con «no se reconoce»; y
            // además la 4 cambia la sintaxis de las directivas @tailwind, de modo que
            // el input.css de aquí no produciría el mismo resultado. La 3 es la que
            // usa el frontend (tailwindcss ^3.4.10), así que el CSS exportado coincide
            // con lo que el usuario ve en el lienzo.
            var tailwind = await RunAsync(
                npx,
                "--yes -p tailwindcss@3 tailwindcss -i input.css -o output.css",
                workDir,
                cancellationToken);

            if (tailwind.TimedOut)
                return StylesheetResult.ToolchainMissing("Tailwind excedió el tiempo máximo de ejecución.");
            if (tailwind.Failed)
                return StylesheetResult.ToolchainMissing(tailwind.Detail!);
            if (tailwind.ExitCode != 0)
                return StylesheetResult.Failed(tailwind.Output);

            var outputPath = Path.Combine(workDir, "output.css");
            if (!File.Exists(outputPath))
                return StylesheetResult.Failed("Tailwind terminó sin producir la hoja de estilos.");

            var css = await File.ReadAllTextAsync(outputPath, cancellationToken);

            // Los estilos propios van al final para que ganen a las utilidades.
            if (!string.IsNullOrWhiteSpace(customStyles))
            {
                var custom = stylesAreSass
                    ? await CompileSassAsync(npx, customStyles!, workDir, cancellationToken)
                    : new StylesheetResult(customStyles, null);

                if (custom.Css is null)
                {
                    // El SASS del usuario es cosa suya: se informa, pero no se pierde
                    // la hoja de Tailwind que sí se generó correctamente.
                    return new StylesheetResult(css, custom.Diagnostics, custom.ToolchainAvailable);
                }

                css = $"{css}\n/* ── Estilos propios del componente ── */\n{custom.Css.Trim()}\n";
            }

            return new StylesheetResult(css, null);
        }
        finally
        {
            try { Directory.Delete(workDir, recursive: true); } catch { /* best effort */ }
        }
    }

    private static async Task<StylesheetResult> CompileSassAsync(
        string npx, string sass, string workDir, CancellationToken cancellationToken)
    {
        await File.WriteAllTextAsync(Path.Combine(workDir, "custom.scss"), sass, cancellationToken);

        var result = await RunAsync(
            npx, "--yes -p sass sass custom.scss custom.css --no-source-map", workDir, cancellationToken);

        if (result.TimedOut)
            return StylesheetResult.ToolchainMissing("El compilador de SASS excedió el tiempo máximo.");
        if (result.Failed)
            return StylesheetResult.ToolchainMissing(result.Detail!);
        if (result.ExitCode != 0)
            return StylesheetResult.Failed(result.Output);

        var path = Path.Combine(workDir, "custom.css");
        return File.Exists(path)
            ? new StylesheetResult(await File.ReadAllTextAsync(path, cancellationToken), null)
            : StylesheetResult.Failed("El compilador de SASS no produjo salida.");
    }

    private sealed record ProcessOutcome(int ExitCode, string Output, bool Failed, string? Detail, bool TimedOut);

    private static async Task<ProcessOutcome> RunAsync(
        string fileName, string arguments, string workDir, CancellationToken cancellationToken)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        Process? process;
        try
        {
            process = Process.Start(psi);
        }
        catch (Win32Exception ex)
        {
            return new ProcessOutcome(-1, string.Empty, true,
                $"No se pudo ejecutar {fileName}: {ex.Message}. El paquete se entrega sin hoja autocontenida.",
                false);
        }

        if (process is null)
            return new ProcessOutcome(-1, string.Empty, true, $"No se pudo iniciar {fileName}.", false);

        using var _ = process;

        // La primera invocación descarga el paquete: se da margen, pero acotado, para
        // que una descarga colgada no bloquee la petición indefinidamente.
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(3));

        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();

        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            try { process.Kill(entireProcessTree: true); } catch { /* best effort */ }
            return new ProcessOutcome(-1, string.Empty, false, null, true);
        }

        return new ProcessOutcome(process.ExitCode, string.Concat(await stdout, await stderr), false, null, false);
    }

    // `preflight: false` es la clave de la portabilidad: el preflight de Tailwind
    // aplica un reset global (`*`, `html`, `body`) que arrasaría los estilos de la
    // web anfitriona. En su lugar se inyecta un reset equivalente pero acotado al
    // componente, en BuildInput().
    private const string TailwindConfig = """
        module.exports = {
          content: ['./markup.tsx'],
          corePlugins: { preflight: false }
        };
        """;

    /// <summary>
    /// Reset mínimo del que dependen las utilidades, acotado a la raíz del componente.
    /// </summary>
    /// <remarks>
    /// Se usa <c>:where()</c> a propósito: aporta especificidad cero, de modo que
    /// cualquier utilidad de Tailwind lo sobreescribe. Es el mismo mecanismo por el que
    /// el preflight original no interfiere con las utilidades.
    ///
    /// El reset de bordes no es cosmético: las utilidades <c>border</c> solo fijan el
    /// grosor, así que sin <c>border-style: solid</c> no se vería ningún borde.
    /// </remarks>
    private static string BuildInput() => $$"""
        .{{RootClass}},
        .{{RootClass}} *,
        .{{RootClass}} *::before,
        .{{RootClass}} *::after {
          box-sizing: border-box;
          border-width: 0;
          border-style: solid;
          border-color: #e5e7eb;
        }

        .{{RootClass}} :where(h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd, pre) {
          margin: 0;
        }

        .{{RootClass}} :where(ul, ol) {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .{{RootClass}} :where(button, input, select, textarea, optgroup) {
          font: inherit;
          color: inherit;
          margin: 0;
        }

        .{{RootClass}} :where(button, [type='button'], [type='submit']) {
          background-color: transparent;
          background-image: none;
          cursor: pointer;
        }

        .{{RootClass}} :where(img, svg, video, canvas, iframe) {
          display: block;
          max-width: 100%;
          height: auto;
        }

        .{{RootClass}} :where(table) {
          border-collapse: collapse;
        }

        .{{RootClass}} :where(a) {
          color: inherit;
          text-decoration: inherit;
        }

        .{{RootClass}} :where(hr) {
          height: 0;
          color: inherit;
          border-top-width: 1px;
        }

        @tailwind components;
        @tailwind utilities;
        """;
}
