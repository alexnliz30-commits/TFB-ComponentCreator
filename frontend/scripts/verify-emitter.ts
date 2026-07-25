/**
 * Verificación del emisor del builder.
 *
 * Emite componentes que cubren los 85 tipos de la paleta, los contenedores
 * anidados y el modelo de acciones, y los escribe a disco para que
 * `verify-emitter.mjs` los pase por el mismo `tsc` que usa el harness KR1.
 *
 * Existe porque el build del builder solo demuestra que *el builder* compila,
 * no que compile lo que el builder *genera*, que es lo que de verdad importa.
 *
 * Uso: `npm run verify:emitter`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_DEFINITIONS } from '../src/builder/defaults';
import { reactEmitter } from '../src/builder/emit-react';
import { emitPackage } from '../src/builder/emit-package';
import type { StateVar } from '../src/builder/actions';
import type { BuilderBlock } from '../src/builder/types';

const outDir = process.argv[2] ?? 'dist-emit-check';
const packageDir = process.argv[3];
mkdirSync(outDir, { recursive: true });

function block(id: string, type: string, extra: Partial<BuilderBlock> = {}): BuilderBlock {
  const def = BLOCK_DEFINITIONS.find((d) => d.type === type);
  if (!def) throw new Error(`Tipo desconocido en el guion de verificación: ${type}`);
  return { id, type, props: { ...def.defaultProps }, children: [], ...extra };
}

function bound(id: string, type: string, varName: string): BuilderBlock {
  const b = block(id, type);
  return { ...b, props: { ...b.props, bindTo: varName } };
}

const cases: { name: string; code: string }[] = [];

// 1) Cada tipo de la paleta, aislado. Detecta cualquier bloque sin esquema.
for (const def of BLOCK_DEFINITIONS) {
  const b = block('block-1', def.type);
  cases.push({
    name: `solo_${def.type.replace(/-/g, '_')}`,
    code: reactEmitter.emit({ blocks: { 'block-1': b }, rootIds: ['block-1'], vars: [] }),
  });
}

// 2) Todos los tipos en un mismo árbol.
const all: Record<string, BuilderBlock> = {};
const allIds: string[] = [];
BLOCK_DEFINITIONS.forEach((def, i) => {
  const id = `block-${i}`;
  all[id] = block(id, def.type);
  allIds.push(id);
});
cases.push({ name: 'todos_los_bloques', code: reactEmitter.emit({ blocks: all, rootIds: allIds, vars: [] }) });

// 3) Contenedores anidados: comprueba que el `slot` resuelve los hijos.
const nested: Record<string, BuilderBlock> = {
  'block-1': block('block-1', 'card', { children: ['block-2', 'block-3'] }),
  'block-2': block('block-2', 'h2'),
  'block-3': block('block-3', 'grid', { children: ['block-4', 'block-5'] }),
  'block-4': block('block-4', 'stat'),
  'block-5': block('block-5', 'form', { children: ['block-6'] }),
  'block-6': block('block-6', 'input'),
};
cases.push({ name: 'anidado', code: reactEmitter.emit({ blocks: nested, rootIds: ['block-1'], vars: [] }) });

// 4) Estado, acciones, visibilidad y bloques enlazados.
const vars: StateVar[] = [
  { name: 'modalAbierto', type: 'boolean', initial: 'false' },
  { name: 'pestana', type: 'number', initial: '0' },
  { name: 'valoracion', type: 'number', initial: '3' },
  { name: 'progreso', type: 'number', initial: '40' },
  { name: 'nombre', type: 'string', initial: 'hola' },
];
const behaviour: Record<string, BuilderBlock> = {
  'block-1': block('block-1', 'button', {
    events: [{ event: 'click', actions: [{ kind: 'toggle', target: 'modalAbierto' }] }],
  }),
  'block-2': block('block-2', 'modal', {
    visibleIf: { var: 'modalAbierto', op: 'is', value: 'true' },
    children: ['block-3'],
  }),
  'block-3': block('block-3', 'button', {
    events: [{
      event: 'click',
      actions: [
        { kind: 'set', target: 'modalAbierto', value: 'false' },
        { kind: 'increment', target: 'pestana', by: '1' },
      ],
    }],
  }),
  'block-4': bound('block-4', 'tabs', 'pestana'),
  'block-5': bound('block-5', 'rating', 'valoracion'),
  'block-6': bound('block-6', 'progress', 'progreso'),
  'block-7': bound('block-7', 'switch', 'modalAbierto'),
  'block-8': bound('block-8', 'accordion', 'pestana'),
  'block-9': bound('block-9', 'slider', 'progreso'),
  'block-10': bound('block-10', 'pagination', 'pestana'),
  'block-11': bound('block-11', 'stepper', 'pestana'),
  'block-12': block('block-12', 'form', {
    children: ['block-13'],
    events: [{ event: 'submit', actions: [{ kind: 'reset' }] }],
  }),
  'block-13': block('block-13', 'input'),
  'block-14': block('block-14', 'p', { visibleIf: { var: 'nombre', op: 'not', value: '' } }),
};
cases.push({
  name: 'comportamiento',
  code: reactEmitter.emit({
    blocks: behaviour,
    // block-3 y block-13 son hijos; no van en la raíz.
    rootIds: Object.keys(behaviour).filter((k) => k !== 'block-3' && k !== 'block-13'),
    vars,
  }),
});

// 5) Variable declarada pero nunca referenciada: no debe emitirse, o `tsc`
//    fallaría con noUnusedLocals.
cases.push({
  name: 'variable_sin_usar',
  code: reactEmitter.emit({
    blocks: { 'block-1': block('block-1', 'h1') },
    rootIds: ['block-1'],
    vars: [{ name: 'jamasUsada', type: 'boolean', initial: 'false' }],
  }),
});

// 6) Texto con caracteres que romperían el JSX si no se escapan.
const tricky = block('block-1', 'p');
tricky.props.text = 'Llaves {a} y ángulos <b> y "comillas"';
cases.push({
  name: 'texto_con_simbolos',
  code: reactEmitter.emit({ blocks: { 'block-1': tricky }, rootIds: ['block-1'], vars: [] }),
});

// 7) Lienzo vacío.
cases.push({ name: 'vacio', code: reactEmitter.emit({ blocks: {}, rootIds: [], vars: [] }) });

// 8) Variable que SOLO se escribe: ningún bloque la lee, así que no aparece por
//    su nombre en el código emitido, únicamente a través del setter. El caso
//    `comportamiento` no lo cubre porque allí las variables también se leen
//    (`visibleIf`, `bindTo`) y eso las rescataba. Sin mirar el setter, el
//    `useState` se omitía y el componente no compilaba.
const writeOnly = block('block-1', 'button', {
  events: [{ event: 'click', actions: [{ kind: 'set', target: 'enviado', value: 'true' }] }],
});
cases.push({
  name: 'variable_solo_escrita',
  code: reactEmitter.emit({
    blocks: { 'block-1': writeOnly },
    rootIds: ['block-1'],
    vars: [{ name: 'enviado', type: 'boolean', initial: 'false' }],
  }),
});

for (const { name, code } of cases) {
  writeFileSync(join(outDir, `${name}.tsx`), code, 'utf8');
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(cases.map((c) => c.name), null, 2), 'utf8');

console.log(`Emitidos ${cases.length} componentes en ${outDir}`);

// ── Paquetes de carpeta ──
//
// Se verifican aparte porque son otro artefacto: llevan imports reales de React
// y se compilan contra `@types/react`, no contra el stub del harness.
if (packageDir) {
  mkdirSync(packageDir, { recursive: true });

  const packages: { name: string; input: Parameters<typeof emitPackage>[0] }[] = [
    {
      name: 'con_estado',
      input: {
        blocks: behaviour,
        rootIds: Object.keys(behaviour).filter((k) => k !== 'block-3' && k !== 'block-13'),
        vars,
        name: 'Panel de Control',
        customStyles: '.extra { color: red; }',
        stylesLanguage: 'css',
      },
    },
    {
      name: 'sin_estado',
      input: { blocks: nested, rootIds: ['block-1'], vars: [], name: 'tarjeta simple' },
    },
    {
      name: 'nombre_raro',
      input: { blocks: { 'block-1': block('block-1', 'h1') }, rootIds: ['block-1'], vars: [], name: '3 años ñandú!' },
    },
    {
      name: 'vacio',
      input: { blocks: {}, rootIds: [], vars: [], name: 'Vacio' },
    },
  ];

  const emitted: string[] = [];
  for (const pkg of packages) {
    for (const file of emitPackage(pkg.input)) {
      // Se aplana la ruta: el verificador compila todo en un mismo directorio.
      const flat = `${pkg.name}__${file.path.replace(/\//g, '__')}`;
      writeFileSync(join(packageDir, flat), file.contents, 'utf8');
      if (file.language === 'tsx') emitted.push(flat);
    }
  }
  writeFileSync(join(packageDir, 'manifest.json'), JSON.stringify(emitted, null, 2), 'utf8');
  console.log(`Emitidos ${emitted.length} paquetes en ${packageDir}`);
}
