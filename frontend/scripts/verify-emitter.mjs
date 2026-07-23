/**
 * Ejecuta `verify-emitter.ts` y compila su salida con tsc, replicando el entorno
 * del harness KR1 (`TsxCompilationChecker`): sin imports, hooks globales y sin
 * node_modules del proyecto.
 *
 * Uso: `npm run verify:emitter`
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

// Réplica del stub del harness: los componentes emitidos no llevan imports y en
// el sandbox React y sus hooks existen como globales.
const GLOBALS_STUB = `
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
`;

const workDir = mkdtempSync(join(tmpdir(), 'visualiza-emit-'));

try {
  // 1) Empaquetar el guion de emisión: importa módulos TS del builder.
  const bundlePath = join(workDir, 'emit.mjs');
  await build({
    entryPoints: ['scripts/verify-emitter.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    logLevel: 'silent',
  });

  // 2) Emitir los componentes. Los paquetes van dentro del proyecto para que
  //    `import ... from 'react'` resuelva contra el node_modules real.
  const emitDir = join(workDir, 'emitidos');
  const pkgDir = join(process.cwd(), '.verify-packages');
  execFileSync(process.execPath, [bundlePath, emitDir, pkgDir], { stdio: 'inherit' });

  const names = JSON.parse(readFileSync(join(emitDir, 'manifest.json'), 'utf8'));

  // 3) Compilar cada componente por separado, como hace el harness.
  writeFileSync(join(emitDir, 'globals.d.ts'), GLOBALS_STUB, 'utf8');

  const failures = [];
  for (const name of names) {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: [`${name}.tsx`, 'globals.d.ts'],
    };
    writeFileSync(join(emitDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8');

    try {
      execFileSync(
        process.execPath,
        [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
        { cwd: emitDir, stdio: 'pipe' },
      );
    } catch (err) {
      failures.push({ name, output: (err.stdout?.toString() || err.message).trim() });
    }
  }

  console.log(`\nComponentes (entorno harness): ${names.length - failures.length}/${names.length}`);

  // 4) Los paquetes se compilan contra los tipos reales de React.
  const pkgNames = JSON.parse(readFileSync(join(pkgDir, 'manifest.json'), 'utf8'));
  writeFileSync(
    join(pkgDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: pkgNames,
    }, null, 2),
    'utf8',
  );

  const pkgFailures = [];
  try {
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
      { cwd: pkgDir, stdio: 'pipe' },
    );
  } catch (err) {
    pkgFailures.push((err.stdout?.toString() || err.message).trim());
  }

  console.log(`Paquetes (tipos reales de React): ${pkgFailures.length === 0 ? `${pkgNames.length}/${pkgNames.length}` : 'con fallos'}`);

  if (failures.length > 0) {
    console.error(`\nFallos de componentes (${failures.length}):\n`);
    for (const f of failures) console.error(`── ${f.name} ──\n${f.output}\n`);
  }
  if (pkgFailures.length > 0) {
    console.error(`\nFallos de paquetes:\n${pkgFailures.join('\n')}\n`);
  }
  if (failures.length > 0 || pkgFailures.length > 0) process.exit(1);

  console.log('\nTodo lo emitido compila.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
  rmSync(join(process.cwd(), '.verify-packages'), { recursive: true, force: true });
}
