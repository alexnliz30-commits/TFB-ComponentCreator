/**
 * Verifica que el lienzo puede pintar de verdad todo lo que el editor promete.
 *
 * El CSS del editor se compila en build-time, así que una clase que nadie
 * escribió literalmente en las fuentes no tiene regla y el navegador la ignora
 * SIN AVISAR. Ese fue el fallo que dejaba los componentes de la IA sin
 * espaciado, sin rejilla y sin breakpoints en el lienzo mientras se veían bien
 * en Preview y en el paquete exportado.
 *
 * Aquí se genera el CSS con la configuración real del proyecto y se comprueba
 * clase por clase. Cubre además un modo de fallo silencioso propio de Tailwind:
 * una entrada del `safelist` que no sea una utilidad válida (un dedazo, una
 * utilidad de otra versión) **se descarta sin error**, así que basta con
 * enumerarla en el vocabulario para creerse cubierto sin estarlo.
 *
 * Uso: `npm run verify:styles`
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { SAFELIST, VOCABULARY_CLASSES, VOCABULARY_GROUPS } from '../src/builder/style-vocabulary.js';

/** Delimitadores que cierran un nombre de clase dentro de un selector. */
const SELECTOR_DELIMITERS = new Set([' ', '.', '#', '>', '~', '+', ',', ':', '[', ']', '(', ')', '*', '\t', '\n']);

/**
 * Nombres de clase de un selector, deshaciendo el escapado de CSS.
 *
 * Hace falta un recorrido carácter a carácter y no una expresión regular porque
 * `.hover\:bg-\[var\(--vz-primario\)\]:hover` mezcla dos puntos escapados (parte
 * del nombre) con uno sin escapar (la pseudoclase), y lo mismo con corchetes y
 * paréntesis de los valores arbitrarios.
 */
function classesInSelector(selector) {
  const found = [];
  for (let i = 0; i < selector.length; i++) {
    if (selector[i] !== '.' || selector[i - 1] === '\\') continue;
    let name = '';
    let j = i + 1;
    while (j < selector.length) {
      const ch = selector[j];
      if (ch === '\\') {
        name += selector[j + 1] ?? '';
        j += 2;
        continue;
      }
      if (SELECTOR_DELIMITERS.has(ch)) break;
      name += ch;
      j++;
    }
    if (name) found.push(name);
    i = j - 1;
  }
  return found;
}

const workDir = mkdtempSync(join(tmpdir(), 'visualiza-styles-'));
let failures = 0;

function check(label, missing, total) {
  if (missing.length === 0) {
    console.log(`  ✓ ${label}: ${total}/${total}`);
    return;
  }
  failures += missing.length;
  console.log(`  ✗ ${label}: faltan ${missing.length} de ${total}`);
  for (const cls of missing.slice(0, 25)) console.log(`      ${cls}`);
  if (missing.length > 25) console.log(`      … y ${missing.length - 25} más`);
}

try {
  // 1) Recolectar las clases que el editor puede escribir. Se empaqueta con
  //    esbuild porque `defaults.ts` y `style-utils.ts` son TypeScript.
  const bundlePath = join(workDir, 'collect.mjs');
  const collectedPath = join(workDir, 'collected.json');
  await build({
    entryPoints: ['scripts/verify-styles.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    logLevel: 'silent',
  });
  execFileSync(process.execPath, [bundlePath, collectedPath], { stdio: 'inherit' });
  const collected = JSON.parse(readFileSync(collectedPath, 'utf8'));

  // 2) Generar el CSS con la configuración real del proyecto (la misma que usa
  //    el build) y quedarse con el conjunto de clases que tienen regla.
  const css = await postcss([tailwindcss('./tailwind.config.js')])
    .process('@tailwind utilities;', { from: undefined });

  const generated = new Set();
  css.root.walkRules((rule) => {
    for (const cls of classesInSelector(rule.selector)) generated.add(cls);
  });

  const has = (cls) => generated.has(cls);

  console.log(`\nCSS de utilidades: ${(css.css.length / 1024).toFixed(0)} KB, ${generated.size} clases con regla.`);
  console.log(`Vocabulario: ${VOCABULARY_CLASSES.length} clases base en ${VOCABULARY_GROUPS.length} grupos → ${SAFELIST.length} entradas de safelist.\n`);

  // 3) Las tres procedencias de un `className` en el lienzo.
  check('valores por defecto de los 85 bloques', collected.defaults.filter((c) => !has(c)), collected.defaults.length);
  check('opciones del panel de propiedades', collected.panel.filter((c) => !has(c)), collected.panel.length);
  check('roles del tema que promete el prompt', collected.theme.filter((c) => !has(c)), collected.theme.length);

  // 4) El safelist entero: una entrada inválida se descarta en silencio, y esta
  //    es la única forma de enterarse.
  check('entradas del safelist', SAFELIST.filter((c) => !has(c)), SAFELIST.length);

  console.log(failures === 0
    ? '\nTodo lo que el editor puede escribir tiene regla en el lienzo.'
    : `\n${failures} clases sin regla: se escribirían en el bloque y no se verían.`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
