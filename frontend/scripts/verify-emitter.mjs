/**
 * Ejecuta `verify-emitter.ts` y compila su salida con tsc, replicando el entorno
 * del harness KR1 (`TsxCompilationChecker`): sin imports, hooks globales y sin
 * node_modules del proyecto.
 *
 * Uso: `npm run verify:emitter`
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, realpathSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
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

/**
 * Forma mínima de `@angular/core`, para poder compilar sin tener Angular.
 *
 * Solo lo que el emisor usa, y con los tipos de verdad: una señal se lee
 * llamándola, `input()` devuelve una función de solo lectura y `output()` algo
 * con `emit`. Un stub con `any` compilaría cualquier cosa y no serviría de nada.
 */
const ANGULAR_STUB = `
declare module '@angular/core' {
  export interface Signal<T> { (): T; }
  export interface WritableSignal<T> extends Signal<T> {
    set(value: T): void;
    update(fn: (previous: T) => T): void;
  }
  export interface OutputRef<T> { emit(value: T): void; }
  export function signal<T>(initial: T): WritableSignal<T>;
  export function input<T>(initial: T): Signal<T>;
  export function output<T = void>(): OutputRef<T>;
  export function Component(meta: {
    selector: string;
    /* El fichero único lleva la plantilla dentro; el paquete de carpeta la
       apunta con templateUrl y sus estilos con styleUrl. Las dos formas son
       válidas para Angular, así que las dos tienen que serlo para el stub: con
       solo 'template' declarado, la carpeta emitida fallaba aquí sin que su
       código tuviera nada de malo. */
    template?: string;
    templateUrl?: string;
    styleUrl?: string;
    changeDetection?: unknown;
  }): ClassDecorator;
  export const ChangeDetectionStrategy: { OnPush: unknown; Default: unknown };
}
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
  const vueDir = join(workDir, 'vue');
  const emitJsDir = join(workDir, 'emitidos-js');
  const pkgJsDir = join(process.cwd(), '.verify-packages-js');
  const vueJsDir = join(workDir, 'vue-js');
  const angularDir = join(workDir, 'angular');
  const angularPkgDir = join(workDir, 'angular-paquetes');
  const vuePkgDir = join(workDir, 'vue-paquetes');
  execFileSync(
    process.execPath,
    [
      bundlePath, emitDir, pkgDir, vueDir, emitJsDir, pkgJsDir, vueJsDir,
      angularDir, angularPkgDir, vuePkgDir,
    ],
    { stdio: 'inherit' },
  );

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

  /*
    3bis) Los mismos componentes en JSX.

    `checkJs` va apagado a propósito: en JavaScript no hay tipos que comprobar,
    y encenderlo convertiría la inferencia de tsc en un requisito que el
    lenguaje destino no impone. Lo que sí demuestra este paso es que el JSX
    PARSEA —paréntesis, llaves, JSX bien cerrado, nada de sintaxis inválida—,
    que es exactamente lo que puede romperse al quitar las anotaciones. Que no
    quede sintaxis de TypeScript dentro lo afirma el guion de emisión, porque
    `allowJs` la aceptaría sin protestar.
  */
  const jsNames = JSON.parse(readFileSync(join(emitJsDir, 'manifest.json'), 'utf8'));
  const jsFailures = [];
  for (const name of jsNames) {
    writeFileSync(join(emitJsDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        allowJs: true,
        checkJs: false,
        noEmit: true,
        skipLibCheck: true,
      },
      include: [`${name}.jsx`],
    }, null, 2), 'utf8');

    try {
      execFileSync(
        process.execPath,
        [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
        { cwd: emitJsDir, stdio: 'pipe' },
      );
    } catch (err) {
      jsFailures.push({ name, output: (err.stdout?.toString() || err.message).trim() });
    }
  }

  console.log(`Componentes JSX (sintaxis): ${jsNames.length - jsFailures.length}/${jsNames.length}`);

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

  /*
    4bis) Los paquetes en JavaScript, CON `checkJs`.

    Aquí sí se comprueban los tipos, y es la diferencia importante con los
    componentes sueltos: el contrato del paquete está escrito en JSDoc, así que
    hay algo que verificar. Con `checkJs` encendido, un `@typedef` mal escrito o
    un `import('./types')` que apunte a un tipo inexistente falla — que es
    justamente lo que hace que el JSDoc valga de algo y no sea un comentario.
  */
  const pkgJsNames = JSON.parse(readFileSync(join(pkgJsDir, 'manifest.json'), 'utf8'));
  writeFileSync(join(pkgJsDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      allowJs: true,
      checkJs: true,
      strict: true,
      // `noImplicitAny` apagado, y no por comodidad: exigirlo sería pedirle al
      // JavaScript que anotara sus parámetros, que es exactamente lo que se ha
      // ido a buscar al no emitir TypeScript. Lo que sigue comprobándose es lo
      // que sí es responsabilidad del paquete: que los `@typedef` existan, que
      // los `import('./types')` resuelvan y que nadie use un nombre inexistente.
      noImplicitAny: false,
      noEmit: true,
      skipLibCheck: true,
    },
    include: pkgJsNames,
  }, null, 2), 'utf8');

  const pkgJsFailures = [];
  try {
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
      { cwd: pkgJsDir, stdio: 'pipe' },
    );
  } catch (err) {
    pkgJsFailures.push((err.stdout?.toString() || err.message).trim());
  }

  console.log(`Paquetes JS (JSDoc comprobado): ${pkgJsFailures.length === 0 ? `${pkgJsNames.length}/${pkgJsNames.length}` : 'con fallos'}`);

  // 5) Los SFC de Vue se compilan con el compilador de Vue.
  //
  //    Es una red distinta de `tsc`: `parse` valida la estructura del fichero y
  //    `compileTemplate` valida la plantilla Y las expresiones de cada atributo,
  //    que es exactamente donde vive la traducción de React a Vue. Un `.value`
  //    de menos o un setter sin traducir no rompen el SFC, así que el guion de
  //    emisión los afirma aparte; aquí se caza lo que sí es sintaxis inválida.
  const vueNames = JSON.parse(readFileSync(join(vueDir, 'manifest.json'), 'utf8'));
  const { parse, compileTemplate, compileScript } = await import('@vue/compiler-sfc');

  const vueFailures = [];
  for (const name of vueNames) {
    const source = readFileSync(join(vueDir, `${name}.vue`), 'utf8');
    const { descriptor, errors } = parse(source, { filename: `${name}.vue` });

    if (errors.length > 0) {
      vueFailures.push({ name, output: errors.map((e) => e.message).join('\n') });
      continue;
    }

    const problems = [];
    if (descriptor.template) {
      const compiled = compileTemplate({
        id: name,
        source: descriptor.template.content,
        filename: `${name}.vue`,
      });
      problems.push(...compiled.errors.map((e) => (typeof e === 'string' ? e : e.message)));
    }
    if (descriptor.scriptSetup) {
      try {
        compileScript(descriptor, { id: name });
      } catch (err) {
        problems.push(err.message);
      }
    }

    if (problems.length > 0) vueFailures.push({ name, output: problems.join('\n') });
  }

  console.log(`SFC de Vue (compilador de Vue): ${vueNames.length - vueFailures.length}/${vueNames.length}`);

  // 5bis) Los SFC en JavaScript, por el mismo compilador. Un `defineProps`
  //       genérico o un `interface` sin `lang="ts"` los rechaza el propio Vue.
  const vueJsNames = JSON.parse(readFileSync(join(vueJsDir, 'manifest.json'), 'utf8'));
  const vueJsFailures = [];
  for (const name of vueJsNames) {
    const source = readFileSync(join(vueJsDir, `${name}.vue`), 'utf8');
    const { descriptor, errors } = parse(source, { filename: `${name}.vue` });

    if (errors.length > 0) {
      vueJsFailures.push({ name, output: errors.map((e) => e.message).join('\n') });
      continue;
    }

    const problems = [];
    if (descriptor.template) {
      const compiled = compileTemplate({ id: name, source: descriptor.template.content, filename: `${name}.vue` });
      problems.push(...compiled.errors.map((e) => (typeof e === 'string' ? e : e.message)));
    }
    if (descriptor.scriptSetup) {
      try { compileScript(descriptor, { id: name }); } catch (err) { problems.push(err.message); }
    }
    if (problems.length > 0) vueJsFailures.push({ name, output: problems.join('\n') });
  }

  console.log(`SFC de Vue en JS (compilador de Vue): ${vueJsNames.length - vueJsFailures.length}/${vueJsNames.length}`);

  /*
    6) Angular, compilado contra un stub de `@angular/core`.

    El proyecto no tiene Angular instalado, así que se declara el módulo con la
    forma mínima de lo que el emisor usa —el mismo truco que el harness emplea
    con React y sus hooks. No es una comprobación de juguete: con el stub, `tsc`
    caza lo que de verdad se rompe aquí, que es el `this.` olvidado dentro de un
    método, una señal leída sin llamarla y un tipo que no cuadra con la interfaz
    del modelo. Lo que no puede validar es la PLANTILLA, que viaja como cadena;
    de eso se ocupan las afirmaciones del guion de emisión.
  */
  const ngNames = JSON.parse(readFileSync(join(angularDir, 'manifest.json'), 'utf8'));
  writeFileSync(join(angularDir, 'angular-core.d.ts'), ANGULAR_STUB, 'utf8');
  writeFileSync(join(angularDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      experimentalDecorators: true,
      strict: true,
      noUnusedLocals: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: [...ngNames.map((n) => `${n}.ts`), 'angular-core.d.ts'],
  }, null, 2), 'utf8');

  const ngFailures = [];
  try {
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
      { cwd: angularDir, stdio: 'pipe' },
    );
  } catch (err) {
    ngFailures.push((err.stdout?.toString() || err.message).trim());
  }

  console.log(`Angular (clase con stub de @angular/core): ${ngFailures.length === 0 ? `${ngNames.length}/${ngNames.length}` : 'con fallos'}`);

  /*
    7) El paquete de carpeta de Angular, con la clase ya separada de su plantilla.

    Se compila igual que el fichero único y por la misma razón, pero sobre el
    artefacto que de verdad se descarga. Aquí la clase importa `templateUrl`, así
    que un error de reparto —un miembro que se quedó en la plantilla, un import
    que sobra al salir el marcado— aparece como error de compilación y no como
    una carpeta que solo falla al abrirla en un proyecto Angular de verdad.
  */
  const ngPkgNames = JSON.parse(readFileSync(join(angularPkgDir, 'manifest.json'), 'utf8'));
  writeFileSync(join(angularPkgDir, 'angular-core.d.ts'), ANGULAR_STUB, 'utf8');
  writeFileSync(join(angularPkgDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      experimentalDecorators: true,
      strict: true,
      noUnusedLocals: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: [...ngPkgNames.map((n) => `${n}.ts`), 'angular-core.d.ts'],
  }, null, 2), 'utf8');

  const ngPkgFailures = [];
  try {
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
      { cwd: angularPkgDir, stdio: 'pipe' },
    );
  } catch (err) {
    ngPkgFailures.push((err.stdout?.toString() || err.message).trim());
  }

  console.log(`Paquetes de Angular (carpeta compilada): ${ngPkgFailures.length === 0 ? `${ngPkgNames.length}/${ngPkgNames.length}` : 'con fallos'}`);

  /*
    8) El paquete de carpeta de Vue: el SFC ya separado de su contrato.

    Dos redes, porque aquí hay dos cosas distintas que romper.

    La primera es el SFC, con el compilador de Vue **y acceso al sistema de
    ficheros**. Es la diferencia con el fichero único: dentro de la carpeta el
    contrato vive en `types.ts` y el SFC lo usa como genérico de `defineProps`,
    así que el compilador tiene que ABRIR ese fichero para resolver el tipo. Sin
    la opción `fs` no puede, y lo dice con un error propio; con ella, un tipo que
    no exista o una interfaz mal escrita salen aquí y no en el proyecto ajeno.

    La segunda es `tsc` sobre los ficheros hermanos —`types.ts`, `constants.ts`,
    `utils.ts` e `index.ts`—, que el compilador de Vue ni mira. El `.vue` se
    declara con un módulo comodín, como hace cualquier proyecto Vue con
    TypeScript, porque `tsc` por sí solo no sabe leer un SFC.
  */
  const vuePkgNames = JSON.parse(readFileSync(join(vuePkgDir, 'manifest.json'), 'utf8'));
  const fsParaVue = {
    fileExists: (f) => existsSync(f),
    readFile: (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined),
    realpath: (f) => realpathSync(f),
  };

  const vuePkgFailures = [];
  for (const rel of vuePkgNames) {
    const file = join(vuePkgDir, rel);
    const source = readFileSync(file, 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });

    if (errors.length > 0) {
      vuePkgFailures.push({ name: rel, output: errors.map((e) => e.message).join('\n') });
      continue;
    }

    const problems = [];
    if (descriptor.template) {
      const compiled = compileTemplate({ id: rel, source: descriptor.template.content, filename: file });
      problems.push(...compiled.errors.map((e) => (typeof e === 'string' ? e : e.message)));
    }
    if (descriptor.scriptSetup || descriptor.script) {
      try {
        compileScript(descriptor, { id: rel, fs: fsParaVue });
      } catch (err) {
        problems.push(err.message);
      }
    }
    if (problems.length > 0) vuePkgFailures.push({ name: rel, output: problems.join('\n') });
  }

  console.log(`Paquetes de Vue (SFC con su contrato resuelto): ${vuePkgNames.length - vuePkgFailures.length}/${vuePkgNames.length}`);

  // Los ficheros hermanos de los paquetes de TypeScript, por `tsc`.
  const vueTsDir = join(vuePkgDir, 'vue3-ts');
  const hermanos = [];
  const recorre = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) recorre(full);
      else if (entry.name.endsWith('.ts')) hermanos.push(relative(vuePkgDir, full).split('\\').join('/'));
    }
  };
  recorre(vueTsDir);
  recorre(join(vuePkgDir, 'vue2-ts'));

  writeFileSync(join(vuePkgDir, 'vue-shim.d.ts'), "declare module '*.vue' {\n  const component: unknown;\n  export default component;\n}\n", 'utf8');
  writeFileSync(join(vuePkgDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noUnusedLocals: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: [...hermanos, 'vue-shim.d.ts'],
  }, null, 2), 'utf8');

  const vueTsFailures = [];
  try {
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), '-p', '.'],
      { cwd: vuePkgDir, stdio: 'pipe' },
    );
  } catch (err) {
    vueTsFailures.push((err.stdout?.toString() || err.message).trim());
  }

  console.log(`Paquetes de Vue (ficheros hermanos por tsc): ${vueTsFailures.length === 0 ? `${hermanos.length}/${hermanos.length}` : 'con fallos'}`);

  if (failures.length > 0) {
    console.error(`\nFallos de componentes (${failures.length}):\n`);
    for (const f of failures) console.error(`── ${f.name} ──\n${f.output}\n`);
  }
  if (pkgFailures.length > 0) {
    console.error(`\nFallos de paquetes:\n${pkgFailures.join('\n')}\n`);
  }
  if (vueFailures.length > 0) {
    console.error(`\nFallos de SFC (${vueFailures.length}):\n`);
    for (const f of vueFailures) console.error(`── ${f.name} ──\n${f.output}\n`);
  }
  if (jsFailures.length > 0) {
    console.error(`\nFallos de componentes JSX (${jsFailures.length}):\n`);
    for (const f of jsFailures) console.error(`── ${f.name} ──\n${f.output}\n`);
  }
  if (pkgJsFailures.length > 0) {
    console.error(`\nFallos de paquetes JS:\n${pkgJsFailures.join('\n')}\n`);
  }
  if (ngFailures.length > 0) {
    console.error(`\nFallos de Angular:\n${ngFailures.join('\n')}\n`);
  }
  if (ngPkgFailures.length > 0) {
    console.error(`\nFallos de paquetes de Angular:\n${ngPkgFailures.join('\n')}\n`);
  }
  if (vuePkgFailures.length > 0) {
    console.error(`\nFallos de paquetes de Vue (${vuePkgFailures.length}):\n`);
    for (const f of vuePkgFailures) console.error(`── ${f.name} ──\n${f.output}\n`);
  }
  if (vueTsFailures.length > 0) {
    console.error(`\nFallos de tipos en paquetes de Vue:\n${vueTsFailures.join('\n')}\n`);
  }
  if (vueJsFailures.length > 0) {
    console.error(`\nFallos de SFC en JS (${vueJsFailures.length}):\n`);
    for (const f of vueJsFailures) console.error(`── ${f.name} ──\n${f.output}\n`);
  }
  if (failures.length > 0 || pkgFailures.length > 0 || vueFailures.length > 0
    || jsFailures.length > 0 || pkgJsFailures.length > 0 || vueJsFailures.length > 0
    || ngFailures.length > 0 || ngPkgFailures.length > 0
    || vuePkgFailures.length > 0 || vueTsFailures.length > 0) {
    process.exit(1);
  }

  console.log('\nTodo lo emitido compila.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
  rmSync(join(process.cwd(), '.verify-packages'), { recursive: true, force: true });
  rmSync(join(process.cwd(), '.verify-packages-js'), { recursive: true, force: true });
}
