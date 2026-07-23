using System.ComponentModel;
using System.Diagnostics;
using Visualiza.Application.Abstractions;

namespace Visualiza.Infrastructure.Components;

public sealed class TsxCompilationChecker : ITsxCompilationChecker
{
    // Ruta absoluta de npx, resuelta una sola vez. Es imprescindible invocarlo por
    // ruta completa y no por nombre: en Windows npx.cmd es un script por lotes que
    // localiza npx-cli.js con %~dp0. Si se lanza como "npx.cmd" a secas, cmd.exe
    // expande %~dp0 contra el directorio de trabajo (aquí, el temporal del harness)
    // y falla con MODULE_NOT_FOUND antes de ejecutar tsc — lo que hacía que todo
    // componente, válido o no, se contabilizara como «no compila» en el KR1.
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

    public async Task<TsxCompilationResult> CheckAsync(string sourceCode, CancellationToken cancellationToken = default)
    {
        var npx = NpxPath.Value;
        if (npx is null)
        {
            return TsxCompilationResult.ToolchainMissing(
                "No se encontró npx en el PATH: el componente se entrega sin verificación estática.");
        }

        var workDir = Path.Combine(Path.GetTempPath(), "visualiza-tsx", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(workDir);

        try
        {
            await File.WriteAllTextAsync(Path.Combine(workDir, "Component.tsx"), sourceCode, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(workDir, "globals.d.ts"), GlobalsStub, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(workDir, "tsconfig.json"), TsConfigStub, cancellationToken);

            var psi = new ProcessStartInfo
            {
                FileName = npx,
                // "-p typescript" garantiza el compilador real: sin él, npx resuelve
                // el paquete placeholder "tsc" de npm, que siempre sale con código 1.
                Arguments = "--yes -p typescript tsc -p .",
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
                // No hay Node/npx en el entorno (p. ej. la imagen dotnet/sdk del
                // docker-compose, o el runtime aspnet del despliegue). Degradar a
                // «sin verificar» en vez de propagar un 500: el componente se ha
                // generado igualmente y el flag Verified informa al cliente.
                return TsxCompilationResult.ToolchainMissing(
                    $"No se pudo ejecutar el harness de compilación ({psi.FileName}): {ex.Message}. " +
                    "El componente se entrega sin verificación estática.");
            }

            if (process is null)
                return TsxCompilationResult.ToolchainMissing("No se pudo iniciar el proceso tsc.");

            using var _ = process;

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);

            await process.WaitForExitAsync(cancellationToken);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            return process.ExitCode == 0
                ? new TsxCompilationResult(true, null)
                : new TsxCompilationResult(false, string.Concat(stdout, stderr));
        }
        finally
        {
            try { Directory.Delete(workDir, recursive: true); } catch { /* best effort */ }
        }
    }

    private const string TsConfigStub = """
        {
          "compilerOptions": {
            "target": "ES2022",
            "module": "ESNext",
            "moduleResolution": "Bundler",
            "jsx": "react-jsx",
            "strict": true,
            "skipLibCheck": true,
            "noEmit": true
          },
          "include": ["Component.tsx", "globals.d.ts"]
        }
        """;

    // Los componentes generados no llevan imports (regla del prompt) y en el sandbox
    // React y sus hooks existen como globales. Este stub replica ese entorno para
    // que tsc valide el TSX sin necesitar node_modules ni @types/react.
    private const string GlobalsStub = """
        declare namespace JSX {
          interface Element {}
          interface ElementChildrenAttribute { children: {} }
          interface IntrinsicElements { [element: string]: any }
        }
        declare module "react/jsx-runtime" {
          export const jsx: any;
          export const jsxs: any;
          export const Fragment: any;
        }
        declare const React: any;
        declare const ReactDOM: any;
        declare function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
        declare function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
        declare function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T;
        declare function useRef<T>(initial: T): { current: T };
        declare function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: readonly unknown[]): T;
        declare function useReducer(reducer: any, initial: any): [any, (action: any) => void];
        """;
}
