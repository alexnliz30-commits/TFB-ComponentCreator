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
import { join, dirname} from 'node:path';
import { BLOCK_DEFINITIONS } from '../src/builder/defaults';
import { buildNode } from '../src/builder/schema';
import { reactEmitter } from '../src/builder/emit-react';
import { vueEmitter } from '../src/builder/emit-vue';
import { emitPackage } from '../src/builder/emit-package';
import type { StateVar } from '../src/builder/actions';
import type { BuilderBlock } from '../src/builder/types';
import { SEED_LIBRARY } from '../src/libraries/seed-library';
import { componentLayer } from '../src/builder/cascade';
import { themeCss } from '../src/builder/theme';

const outDir = process.argv[2] ?? 'dist-emit-check';
const packageDir = process.argv[3];
const vueDir = process.argv[4];
mkdirSync(outDir, { recursive: true });

/**
 * Entradas del emisor de cada caso, para poder reemitirlas con Vue.
 *
 * Se guardan aparte del código React porque el segundo emisor tiene que partir
 * del MISMO árbol: comparar dos salidas construidas con entradas distintas no
 * demostraría que ambos derivan de la misma IR, que es justo lo que se verifica.
 */
const inputs: { name: string; input: Parameters<typeof reactEmitter.emit>[0] }[] = [];

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

/**
 * Registra un caso: emite React y guarda la entrada para reemitirla con Vue.
 * Todo caso debe pasar por aquí, o el segundo emisor no lo vería.
 */
function addCase(name: string, input: Parameters<typeof reactEmitter.emit>[0]): string {
  const code = reactEmitter.emit(input);
  cases.push({ name, code });
  inputs.push({ name, input });
  return code;
}

// 1) Cada tipo de la paleta, aislado. Detecta cualquier bloque sin esquema.
for (const def of BLOCK_DEFINITIONS) {
  const b = block('block-1', def.type);
  addCase(`solo_${def.type.replace(/-/g, '_')}`, { blocks: { 'block-1': b }, rootIds: ['block-1'], vars: [] });
}

// 2) Todos los tipos en un mismo árbol.
const all: Record<string, BuilderBlock> = {};
const allIds: string[] = [];
BLOCK_DEFINITIONS.forEach((def, i) => {
  const id = `block-${i}`;
  all[id] = block(id, def.type);
  allIds.push(id);
});
addCase('todos_los_bloques', { blocks: all, rootIds: allIds, vars: [] });

// 3) Contenedores anidados: comprueba que el `slot` resuelve los hijos.
const nested: Record<string, BuilderBlock> = {
  'block-1': block('block-1', 'card', { children: ['block-2', 'block-3'] }),
  'block-2': block('block-2', 'h2'),
  'block-3': block('block-3', 'grid', { children: ['block-4', 'block-5'] }),
  'block-4': block('block-4', 'stat'),
  'block-5': block('block-5', 'form', { children: ['block-6'] }),
  'block-6': block('block-6', 'input'),
};
addCase('anidado', { blocks: nested, rootIds: ['block-1'], vars: [] });

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
addCase('comportamiento', {
  blocks: behaviour,
  // block-3 y block-13 son hijos; no van en la raíz.
  rootIds: Object.keys(behaviour).filter((k) => k !== 'block-3' && k !== 'block-13'),
  vars,
});

// 5) Variable declarada pero nunca referenciada: no debe emitirse, o `tsc`
//    fallaría con noUnusedLocals.
addCase('variable_sin_usar', {
  blocks: { 'block-1': block('block-1', 'h1') },
  rootIds: ['block-1'],
  vars: [{ name: 'jamasUsada', type: 'boolean', initial: 'false' }],
});

// 6) Texto con caracteres que romperían el JSX si no se escapan.
const tricky = block('block-1', 'p');
tricky.props.text = 'Llaves {a} y ángulos <b> y "comillas"';
addCase('texto_con_simbolos', { blocks: { 'block-1': tricky }, rootIds: ['block-1'], vars: [] });

// 7) Lienzo vacío.
addCase('vacio', { blocks: {}, rootIds: [], vars: [] });

// 8) Variable que SOLO se escribe: ningún bloque la lee, así que no aparece por
//    su nombre en el código emitido, únicamente a través del setter. El caso
//    `comportamiento` no lo cubre porque allí las variables también se leen
//    (`visibleIf`, `bindTo`) y eso las rescataba. Sin mirar el setter, el
//    `useState` se omitía y el componente no compilaba.
const writeOnly = block('block-1', 'button', {
  events: [{ event: 'click', actions: [{ kind: 'set', target: 'enviado', value: 'true' }] }],
});
addCase('variable_solo_escrita', {
  blocks: { 'block-1': writeOnly },
  rootIds: ['block-1'],
  vars: [{ name: 'enviado', type: 'boolean', initial: 'false' }],
});

// 9) Utilidades de hueco sobre bloques que envuelven su contenido.
//    `input` con etiqueta se emite como `<div><label/><input/></div>`, así que
//    el tamaño y la posición tienen que acabar en el `div` y el estilo en el
//    `input`. Antes un `w-full` estiraba el campo pero no el bloque, y un
//    `absolute` lo habría posicionado dentro de su propio envoltorio.
const wrapped = block('block-1', 'input');
wrapped.props.label = 'Correo';
wrapped.props.className = 'w-full absolute top-4 border-2';
const layoutCode = addCase('hueco_izado_a_la_raiz', {
  blocks: { 'block-1': wrapped },
  rootIds: ['block-1'],
  vars: [],
});

// La compilación no puede comprobar en QUÉ elemento cayó cada clase, así que
// eso se afirma aquí y el guion falla si el izado deja de funcionar.
const outer = layoutCode.match(/<div className="([^"]*)"[^>]*>\s*<label/);
const inner = layoutCode.match(/<input className="([^"]*)"/);
// Este bloque NO se pliega, y es intencionado: `absolute top-4` sin
// desplazamiento horizontal fijo se queda donde lo ponga su contenedor, así que
// ya se adapta solo. Plegarlo cambiaría un diseño que estaba bien.
for (const [label, got, expected] of [
  ['envoltorio', outer?.[1] ?? '', ['w-full', 'absolute', 'top-4']],
  ['campo', inner?.[1] ?? '', ['border-2']],
] as const) {
  const missing = expected.filter((c) => !got.split(/\s+/).includes(c));
  if (missing.length > 0) {
    console.error(`Izado de utilidades de hueco: al ${label} le faltan ${missing.join(' ')} (tiene "${got}")`);
    process.exit(1);
  }
}
if (outer?.[1].includes('border-2')) {
  console.error('Izado de utilidades de hueco: el estilo del campo se subió al envoltorio.');
  process.exit(1);
}

// 9bis) Un bloque colocado en píxeles sobre un lienzo ancho SÍ se pliega, y el
//       umbral sale de dónde acaba el bloque, no de una constante: con un `md:`
//       fijo para todos, un bloque en `left-[820px]` volvía a salirse 325 px
//       justo en el tramo de tablet, porque 768 no da para 820.
const colocado = block('block-1', 'card');
colocado.props.className = 'absolute left-[820px] top-[40px] w-[240px] h-[60px] p-4';
const colocadoCode = addCase('colocacion_plegada', {
  blocks: { 'block-1': colocado },
  rootIds: ['block-1'],
  vars: [],
});
for (const clase of ['xl:absolute', 'xl:left-[820px]', 'xl:top-[40px]', 'xl:h-[60px]']) {
  if (!colocadoCode.includes(clase)) {
    console.error(`Plegado: falta ${clase} (820+240 solo cabe a partir de xl). Emitido: ${colocadoCode}`);
    process.exit(1);
  }
}
// Sin prefijo no puede quedar ninguna: bastaría con que `absolute` sobreviviera
// suelta para que el bloque siguiera fuera del flujo en móvil.
if (/(?:^|["\s])(?:absolute|left-\[820px\]|top-\[40px\])/.test(colocadoCode)) {
  console.error(`Plegado: la colocación se emitió también sin prefijo. Emitido: ${colocadoCode}`);
  process.exit(1);
}
// El ancho NO se pliega: `max-w-full` ya lo encoge donde no cabe, y plegarlo
// dejaría el bloque a todo lo ancho en móvil.
if (!colocadoCode.includes('w-[240px]') || !colocadoCode.includes('max-w-full')) {
  console.error(`Plegado: el ancho debía conservarse con su tope. Emitido: ${colocadoCode}`);
  process.exit(1);
}

// 9quater) Un mínimo fijo DENTRO de un contenedor desplazable NO se pliega.
//          Ahí lo que sobra se desplaza dentro de la caja en vez de desbordar la
//          página, y es el patrón estándar de una tabla ancha. Plegarlo sería el
//          error contrario: en móvil la tabla perdería su ancho mínimo y sus
//          columnas se comprimirían hasta ser ilegibles. Lo destapó la IA, que
//          escribió exactamente este patrón al generar un panel de facturas.
const dentroDeScroll = block('block-2', 'div');
dentroDeScroll.props.className = 'min-w-[720px] w-full';
const scrollCode = addCase('minimo_fijo_en_contenedor_desplazable', {
  blocks: {
    'block-1': (() => {
      const c = block('block-1', 'div', { children: ['block-2'] });
      c.props.className = 'w-full overflow-x-auto';
      return c;
    })(),
    'block-2': dentroDeScroll,
  },
  rootIds: ['block-1'],
  vars: [],
});
if (!/(?:^|["\s])min-w-\[720px\]/.test(scrollCode) || scrollCode.includes('md:min-w-[720px]')) {
  console.error(`Plegado: bajo \`overflow-x-auto\` el mínimo fijo debe conservarse tal cual. Emitido: ${scrollCode}`);
  process.exit(1);
}

// 9-seed) La librería de ejemplo: sus componentes se emiten y compilan como
//         cualquier otro caso. Es lo que impide que la semilla se pudra —usa
//         tipos de bloque, validaciones y acciones reales, y si alguno cambia de
//         forma, esto lo detecta aquí y no al abrir la aplicación.
for (const componente of SEED_LIBRARY.components) {
  const code = addCase(`semilla_${componente.name}`, {
    blocks: componente.blocks,
    rootIds: componente.rootIds,
    vars: componente.stateVars,
    name: componente.name,
  });
  if (!code.includes('export function App')) {
    console.error(`Semilla: «${componente.name}» no emitió un componente.`);
    process.exit(1);
  }
}

// El desvío declarado tiene que traducirse a algo que de verdad gane. Sin esto,
// `!propio` sería CSS inválido que el navegador tira en silencio: la regla
// desaparecería y nadie se enteraría.
const conDesvio = SEED_LIBRARY.components.find((c) => c.customStyles?.includes('!propio'));
if (!conDesvio) {
  console.error('Semilla: ningún componente recorre el camino del desvío `!propio`.');
  process.exit(1);
}
const hojaPropia = componentLayer(conDesvio.customStyles!);
// Los COMENTARIOS se dejan intactos a propósito: si también se tradujeran, la
// hoja exportada explicaría una marca que no existe justo donde alguien iría a
// aprenderla. Así que la comprobación mira solo las declaraciones.
const sinComentarios = hojaPropia.replace(/\/\*[\s\S]*?\*\//g, '');
if (!sinComentarios.includes('!important')) {
  console.error(`Semilla: el desvío no se tradujo a \`!important\`. Emitido: ${hojaPropia}`);
  process.exit(1);
}
if (sinComentarios.includes('!propio')) {
  console.error(`Semilla: quedó un \`!propio\` sin traducir en una declaración. Emitido: ${hojaPropia}`);
  process.exit(1);
}
if (!hojaPropia.includes('!propio')) {
  console.error('Semilla: la traducción se comió la marca dentro de los comentarios.');
  process.exit(1);
}
if (!hojaPropia.includes('@layer vz-componente')) {
  console.error('Semilla: la hoja propia debe ir en la capa del componente.');
  process.exit(1);
}
// Y la global en la suya, DECLARADA DESPUÉS: es el orden lo que decide, no la
// especificidad, así que si se invirtiera el kit dejaría de mandar.
const hojaGlobal = themeCss(SEED_LIBRARY.theme, '.visualiza-component', SEED_LIBRARY.globalStyles);
if (!hojaGlobal.includes('@layer vz-componente, vz-global;')) {
  console.error('Semilla: falta la declaración de orden de capas en la hoja global.');
  process.exit(1);
}
if (!hojaGlobal.includes('--vz-primario: #0f766e')) {
  console.error('Semilla: el tema de la librería no llegó a su hoja global.');
  process.exit(1);
}

// 9bis-2) Hermanos colocados en el mismo contenedor se pliegan TODOS a la vez.
//         Uno en `left-[40px]` cabe de sobra en un móvil y por sí solo no se
//         plegaría; si se queda absoluto mientras el de `left-[700px]` vuelve al
//         flujo, acaban uno encima del otro. El plegado cambia de régimen, no de
//         posición, así que el umbral es del grupo y lo marca el que más pide.
const cabe = block('block-2', 'card');
cabe.props.className = 'absolute left-[40px] top-[30px] w-[280px] p-4';
const noCabe = block('block-3', 'card');
noCabe.props.className = 'absolute left-[700px] top-[30px] w-[280px] p-4';
const grupoCode = addCase('hermanos_plegados_a_la_vez', {
  blocks: {
    'block-1': block('block-1', 'div', { children: ['block-2', 'block-3'] }),
    'block-2': cabe,
    'block-3': noCabe,
  },
  rootIds: ['block-1'],
  vars: [],
});
// El hermano de más a la derecha acaba en 700+280 = 980 y, con el margen que se
// reserva para el relleno del contenedor, pide 1028: se pasa de `lg` (1024) por
// cuatro píxeles, así que el grupo ENTERO —incluido el que cabía en un móvil— se
// pliega en `xl`.
for (const clase of ['xl:left-[40px]', 'xl:left-[700px]']) {
  if (!grupoCode.includes(clase)) {
    console.error(`Plegado por grupo: falta ${clase}; los hermanos deben plegarse al mismo umbral. Emitido: ${grupoCode}`);
    process.exit(1);
  }
}
if (/(?:^|["\s])absolute/.test(grupoCode)) {
  console.error(`Plegado por grupo: quedó un \`absolute\` sin prefijo, así que ese hermano no se pliega. Emitido: ${grupoCode}`);
  process.exit(1);
}

// 9ter) Un ancho MÍNIMO fijo se pliega aunque el bloque esté en el flujo: en CSS
//       `min-width` gana a `max-width`, así que es el único ancho que el tope
//       `max-w-full` no puede contener en una pantalla estrecha.
const minimo = block('block-1', 'card');
minimo.props.className = 'min-w-[600px] p-4';
const minimoCode = addCase('minimo_fijo_plegado', {
  blocks: { 'block-1': minimo },
  rootIds: ['block-1'],
  vars: [],
});
if (!minimoCode.includes('md:min-w-[600px]') || /(?:^|["\s])min-w-\[600px\]/.test(minimoCode)) {
  console.error(`Plegado: \`min-w-[600px]\` debía emitirse como \`md:min-w-[600px]\`. Emitido: ${minimoCode}`);
  process.exit(1);
}

// 9ter) La tabla se emite dentro de un contenedor desplazable: una celda no
//       encoge por debajo de su contenido, así que sin él una tabla de varias
//       columnas desborda la página entera en un móvil.
const tabla = block('block-1', 'table');
tabla.props.cols = '6';
const tablaCode = addCase('tabla_desplazable', {
  blocks: { 'block-1': tabla },
  rootIds: ['block-1'],
  vars: [],
});
if (!/<div className="[^"]*overflow-x-auto[^"]*">\s*<table/.test(tablaCode)) {
  console.error('Tabla: falta el contenedor con `overflow-x-auto` alrededor de la tabla.');
  process.exit(1);
}

// 10) Formulario con campos validados: cada tipo de campo con reglas, el envío
//     debe validar antes de ejecutar las acciones y los mensajes deben salir.
const validatedForm: Record<string, BuilderBlock> = {
  'block-1': block('block-1', 'form', {
    children: ['block-2', 'block-3', 'block-4', 'block-5', 'block-6', 'block-7', 'block-8'],
    events: [{ event: 'submit', actions: [{ kind: 'set', target: 'enviado', value: 'true' }] }],
  }),
  'block-8': (() => {
    const b = block('block-8', 'button');
    b.props.buttonType = 'submit';
    return b;
  })(),
  'block-2': block('block-2', 'input', {
    validations: [
      { kind: 'required' },
      { kind: 'minLength', value: '3', message: 'Al menos 3 caracteres' },
    ],
  }),
  'block-3': block('block-3', 'input', {
    props: { ...block('block-3', 'input').props, bindTo: 'correo' },
    validations: [{ kind: 'required' }, { kind: 'email' }],
  }),
  'block-4': block('block-4', 'select', { validations: [{ kind: 'required' }] }),
  'block-5': block('block-5', 'checkbox', {
    validations: [{ kind: 'required', message: 'Debes aceptar las condiciones' }],
  }),
  'block-6': block('block-6', 'date-picker', { validations: [{ kind: 'required' }] }),
  'block-7': block('block-7', 'textarea', {
    validations: [{ kind: 'maxLength', value: '200' }, { kind: 'pattern', value: '^[^0-9]*$' }],
  }),
};
const validatedCode = addCase('formulario_validado', {
  blocks: validatedForm,
  rootIds: ['block-1'],
  vars: [
    { name: 'enviado', type: 'boolean', initial: 'false' },
    { name: 'correo', type: 'string', initial: '' },
  ],
});

// La compilación demuestra que el código es correcto, no que la validación
// esté cableada: eso se afirma aquí.
for (const [what, needle] of [
  ['el validador del campo enlazado', 'const validateCorreo'],
  ['la validación previa al envío', 'mensajes.some((mensaje) =>'],
  ['el mensaje bajo el campo', "!== '' && ("],
  ['el aria-invalid vivo', 'aria-invalid={'],
  ['el mensaje personalizado', 'Debes aceptar las condiciones'],
  ['el botón que envía', 'type="submit"'],
] as const) {
  if (!validatedCode.includes(needle)) {
    console.error(`Formulario validado: falta ${what} en el código emitido.`);
    process.exit(1);
  }
}

// 10bis) El gemelo del lienzo. Lo anterior solo mira el código EMITIDO; el
// intérprete que corre en el canvas es otro camino y puede quedarse atrás sin
// que nada falle: compila igual, y el formulario simplemente se envía sin
// validar. Pasó de verdad (el lienzo dejó de pasar `blocks` al esquema), así
// que aquí se ejecuta el cierre `run` del envío y se afirma el resultado.
{
  const implicit: StateVar[] = [];
  const node = buildNode(validatedForm['block-1'], {
    vars: [
      { name: 'enviado', type: 'boolean', initial: 'false' },
      { name: 'correo', type: 'string', initial: '' },
    ],
    blocks: validatedForm,
    collect: (v) => implicit.push(v),
  });

  const submit =
    node.kind === 'el' && node.attrs.onSubmit?.kind === 'event'
      ? node.attrs.onSubmit.run
      : undefined;
  if (!submit) {
    console.error('Lienzo: el formulario validado no expone manejador de envío ejecutable.');
    process.exit(1);
  }

  // Todos los campos vacíos: `required` debe impedir el envío.
  const store: Record<string, unknown> = { enviado: false, correo: '' };
  for (const v of implicit) store[v.name] = v.type === 'boolean' ? false : '';
  submit({ get: (n) => store[n], set: (n, value) => { store[n] = value; } }, { preventDefault() {} });

  const pintados = Object.entries(store).filter(
    ([name, value]) => /^error/.test(name) && typeof value === 'string' && value !== '',
  );
  if (store.enviado !== false || pintados.length === 0) {
    console.error(
      'Lienzo: el envío no validó a sus campos — el intérprete del canvas ha divergido del emisor.',
    );
    process.exit(1);
  }
}

// 11) Campo validado fuera de un formulario: valida al salir del campo.
const looseField = block('block-1', 'input', {
  validations: [{ kind: 'email' }],
});
const looseCode = addCase('campo_validado_suelto', {
  blocks: { 'block-1': looseField },
  rootIds: ['block-1'],
  vars: [],
});
if (!looseCode.includes('onBlur=')) {
  console.error('Campo validado suelto: falta el onBlur que valida al salir del campo.');
  process.exit(1);
}

// 12) Eventos nuevos: ratón sobre el bloque entero y doble clic.
const hoverCard = block('block-1', 'card', {
  children: ['block-2'],
  events: [
    { event: 'mouseenter', actions: [{ kind: 'set', target: 'resaltado', value: 'true' }] },
    { event: 'mouseleave', actions: [{ kind: 'set', target: 'resaltado', value: 'false' }] },
    { event: 'dblclick', actions: [{ kind: 'toggle', target: 'resaltado' }] },
  ],
});
const hoverInner = block('block-2', 'p', { visibleIf: { var: 'resaltado', op: 'is', value: 'true' } });
const hoverCode = addCase('eventos_de_raton', {
  blocks: { 'block-1': hoverCard, 'block-2': hoverInner },
  rootIds: ['block-1'],
  vars: [{ name: 'resaltado', type: 'boolean', initial: 'false' }],
});
for (const attr of ['onMouseEnter=', 'onMouseLeave=', 'onDoubleClick=']) {
  if (!hoverCode.includes(attr)) {
    console.error(`Eventos de ratón: falta ${attr} en el código emitido.`);
    process.exit(1);
  }
}

/*
  11) Componente CON modelo de datos, en los dos emisores.

  Ningún caso de esta lista tenía modelo: el repetidor solo se ejercitaba en los
  paquetes, que es otro artefacto y otro emisor. El hueco costó caro — el SFC de
  Vue traducía el `v-for` correctamente pero **nadie declaraba `items`**, así que
  todo componente de datos exportado a Vue referenciaba un nombre inexistente. El
  compilador de Vue no lo vio porque valida la plantilla, no los nombres; se veía
  solo al pegar el SFC en un proyecto de verdad.

  Va con las tres reglas de negocio a la vez para que cada emisor tenga que
  resolver el elemento actual en sus tres sitios: el texto enlazado, la condición
  y el aviso.
*/
const catalogo: Record<string, BuilderBlock> = {
  'block-1': block('block-1', 'table-c', { children: ['block-2'] }),
  'block-2': block('block-2', 'tbody-c', { children: ['block-3'] }),
  'block-3': block('block-3', 'tr', {
    children: ['block-4', 'block-6'],
    props: { ...block('block-3', 'tr').props, repeatOver: 'true' },
    styleRules: [
      { when: { var: '', field: 'stock', op: 'lt', value: '1' }, className: 'bg-red-50' },
    ],
  }),
  'block-4': block('block-4', 'td', { children: ['block-5'] }),
  'block-5': block('block-5', 'span', {
    props: { ...block('block-5', 'span').props, bindField: 'nombre' },
  }),
  'block-6': block('block-6', 'td', { children: ['block-7'] }),
  'block-7': block('block-7', 'button', {
    visibleIf: { var: '', field: 'stock', op: 'gt', value: '0' },
    events: [{ event: 'click', actions: [{ kind: 'call', target: 'onComprar' }] }],
  }),
};
const catalogoInput = {
  blocks: catalogo,
  rootIds: ['block-1'],
  vars: [],
  callbacks: [{ name: 'onComprar', passesItem: true }],
  model: {
    name: 'Producto',
    sampleRows: 3,
    fields: [
      { name: 'nombre', type: 'text' as const, sample: 'Teclado' },
      { name: 'stock', type: 'number' as const, sample: '0' },
    ],
  },
};
const catalogoCode = addCase('reglas_de_negocio', catalogoInput);

// Compilar no demuestra que las reglas signifiquen lo que dicen: eso, aquí.
for (const [what, needle] of [
  ['la colección de ejemplo', 'const items = ['],
  ['el repetidor', '.map((item'],
  ['la condición sobre el campo', 'item.stock > 0'],
  ['el estilo condicional', "item.stock < 1 ? ' bg-red-50' : ''"],
  ['el aviso con el elemento', 'onComprar?.(item)'],
  ['el aviso declarado en el artefacto', 'const onComprar = undefined as'],
] as const) {
  if (!catalogoCode.includes(needle)) {
    console.error(`Reglas de negocio: falta ${what} en el código emitido.\n${catalogoCode}`);
    process.exit(1);
  }
}

for (const { name, code } of cases) {
  writeFileSync(join(outDir, `${name}.tsx`), code, 'utf8');
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(cases.map((c) => c.name), null, 2), 'utf8');

console.log(`Emitidos ${cases.length} componentes en ${outDir}`);

// ── Segundo emisor: Vue 3 ──
//
// Los MISMOS árboles reemitidos como SFC. El compilador de Vue es una red de
// seguridad distinta de `tsc`: valida la plantilla y las expresiones que hay
// dentro de cada atributo, que es justo donde vive la traducción de React a Vue
// (setters a asignaciones, `.value`, nombres de evento) y donde un fallo no se
// vería hasta ejecutarlo.
if (vueDir) {
  mkdirSync(vueDir, { recursive: true });

  for (const { name, input } of inputs) {
    writeFileSync(join(vueDir, `${name}.vue`), vueEmitter.emit(input), 'utf8');
  }
  writeFileSync(join(vueDir, 'manifest.json'), JSON.stringify(inputs.map((c) => c.name), null, 2), 'utf8');

  // Afirmaciones sobre la traducción: compilar demuestra que el SFC es válido,
  // no que signifique lo mismo que su gemelo React.
  const behaviourVue = vueEmitter.emit(inputs.find((c) => c.name === 'comportamiento')!.input);
  const validatedVue = vueEmitter.emit(inputs.find((c) => c.name === 'formulario_validado')!.input);
  const hoverVue = vueEmitter.emit(inputs.find((c) => c.name === 'eventos_de_raton')!.input);
  const datosVue = vueEmitter.emit(inputs.find((c) => c.name === 'reglas_de_negocio')!.input);

  const checks: [string, boolean][] = [
    ['el estado se declara con ref()', behaviourVue.includes('const modalAbierto = ref(false);')],
    ['className se traduce a class', behaviourVue.includes('class="')],
    ['no queda ningún className', !behaviourVue.includes('className')],
    ['los eventos usan la sintaxis @', behaviourVue.includes('@click="')],
    ['no queda ningún onClick', !behaviourVue.includes('onClick')],
    ['los setters pasan a asignación', behaviourVue.includes('modalAbierto = !modalAbierto')],
    ['la visibilidad se traduce a v-if', behaviourVue.includes('v-if="modalAbierto"')],
    ['los eventos de ratón se traducen', hoverVue.includes('@mouseenter="') && hoverVue.includes('@dblclick="')],
    ['no queda ningún setter sin traducir', !/\bset[A-Z]\w*\(/.test(behaviourVue + validatedVue + hoverVue)],
    ['el envío validado sale como función', validatedVue.includes('function manejarEnvio()')],
    ['el envío usa el modificador .prevent', validatedVue.includes('@submit.prevent=')],
    ['dentro del script los ref llevan .value', validatedVue.includes('.value')],
    ['el validador se declara una vez', (validatedVue.match(/const validateCorreo/g) ?? []).length === 1],
    ['el campo de texto escucha @input', validatedVue.includes('@input="')],
    ['los atributos SVG van con guiones', behaviourVue.includes('stroke-width=') || !behaviourVue.includes('strokeWidth')],
    // Contrato del componente de datos: sin esto el SFC compila y no funciona.
    ['la colección se declara como prop', datosVue.includes(`${'items'}?: Producto[];`)],
    ['la colección tiene datos por defecto', datosVue.includes('withDefaults(')],
    ['la interfaz del elemento se emite', datosVue.includes('export interface Producto')],
    ['el repetidor usa v-for sobre la prop', datosVue.includes('v-for="(item, index) in items"')],
    ['el aviso se declara como prop', datosVue.includes('onComprar?: (item: Producto) => void;')],
    ['el aviso se llama con el elemento', datosVue.includes('onComprar?.(item)')],
    ['la condición sobre el campo va a v-if', datosVue.includes('v-if="item.stock > 0"')],
  ];

  const broken = checks.filter(([, passed]) => !passed);
  if (broken.length > 0) {
    console.error('\nTraducción a Vue incorrecta:');
    for (const [what] of broken) console.error(`  ✗ ${what}`);
    process.exit(1);
  }

  console.log(`Emitidos ${inputs.length} SFC de Vue en ${vueDir}`);
}

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
      name: 'formulario_validado',
      input: {
        blocks: validatedForm,
        rootIds: ['block-1'],
        vars: [
          { name: 'enviado', type: 'boolean', initial: 'false' },
          { name: 'correo', type: 'string', initial: '' },
        ],
        name: 'Formulario Validado',
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
    /*
      Paquete CON modelo de datos.

      Faltaba, y por ese hueco se colaron dos fallos que el verificador daba por
      buenos: el componente usaba `MOCK_ITEMS` sin importarlo, y `constants.ts`
      tipaba los mock con una interfaz que tampoco importaba. Los dos rompen la
      compilación en el proyecto de destino, que es exactamente lo que este
      guion existe para impedir.
    */
    /*
      Repetidor CON paginación.

      Su expresión de colección referencia una variable de estado
      (`items.slice(page * 5, …)`), y ese camino no lo cubría ningún caso: el
      análisis de estado no miraba la expresión de la lista, así que la variable
      no se declaraba y el componente no compilaba por un nombre inexistente.
    */
    {
      name: 'paginado',
      input: {
        blocks: {
          t: { id: 't', type: 'table-c', props: {}, children: ['b'] },
          b: { id: 'b', type: 'tbody-c', props: {}, children: ['r'] },
          r: {
            id: 'r', type: 'tr',
            props: { repeatOver: 'true', paginate: 'true', pageSize: '5', pageVar: 'page' },
            children: ['c'],
          },
          c: { id: 'c', type: 'td', props: {}, children: ['s'] },
          s: { id: 's', type: 'span', props: { bindField: 'cliente' }, children: [] },
        },
        rootIds: ['t'],
        vars: [{ name: 'page', type: 'number' as const, initial: '0' }],
        name: 'TablaPaginada',
        model: {
          name: 'Pedido', sampleRows: 8,
          fields: [{ name: 'cliente', type: 'text' as const, sample: 'Ana' }],
        },
      },
    },
    /*
      Reglas de negocio: condición sobre un campo, estilo condicional y aviso.

      Los tres caminos nuevos pasan por sitios que ya han fallado antes por lo
      mismo —un nombre emitido que en su destino no existe— y cada uno tiene su
      propia forma de romperse:
        · la condición sobre campo nombra `item`, que solo existe dentro del
          repetidor;
        · el estilo condicional convierte `className` en literal de plantilla,
          que es donde se cuela una comilla mal cerrada;
        · el aviso nombra una prop que el artefacto de verificación no tiene y
          el paquete tiene que desestructurar en el fichero correcto.
      Van juntos en un caso porque además se estorban entre sí: el aviso vive en
      un botón dentro de la fila condicionada.
    */
    {
      name: 'reglas_de_negocio',
      input: {
        blocks: {
          t: { id: 't', type: 'table-c', props: {}, children: ['b'] },
          b: { id: 'b', type: 'tbody-c', props: {}, children: ['r'] },
          r: {
            id: 'r',
            type: 'tr',
            props: { repeatOver: 'true' },
            children: ['c', 'c2'],
            // Estilo condicional sobre un campo: la fila agotada se pinta distinta.
            styleRules: [
              { when: { var: '', field: 'stock', op: 'lt', value: '1' }, className: 'bg-red-50 text-red-700' },
            ],
          },
          c: { id: 'c', type: 'td', props: {}, children: ['s'] },
          s: { id: 's', type: 'span', props: { bindField: 'nombre' }, children: [] },
          c2: { id: 'c2', type: 'td', props: {}, children: ['btn'] },
          // Botón que avisa a la app con el elemento de SU fila, y que solo
          // aparece si queda stock: condición y aviso sobre el mismo dato.
          btn: {
            id: 'btn',
            type: 'button',
            props: { text: 'Comprar' },
            children: [],
            visibleIf: { var: '', field: 'stock', op: 'gt', value: '0' },
            events: [{ event: 'click', actions: [{ kind: 'call', target: 'onComprar' }] }],
          },
        },
        rootIds: ['t'],
        vars: [],
        callbacks: [{ name: 'onComprar', passesItem: true }],
        name: 'TablaCatalogo',
        model: {
          name: 'Producto',
          sampleRows: 3,
          fields: [
            { name: 'nombre', type: 'text' as const, sample: 'Teclado' },
            { name: 'stock', type: 'number' as const, sample: '0' },
          ],
        },
      },
    },
    /*
      Aviso SIN repetidor.

      Es el caso que separa la firma del contrato de la llamada emitida: aquí no
      hay `item` que pasar, así que la prop tiene que tiparse sin parámetro. Con
      la firma equivocada el paquete compila igual —TypeScript admite pasar de
      menos— pero el contrato promete un dato que nunca llega.
    */
    {
      name: 'aviso_suelto',
      input: {
        blocks: {
          btn: {
            id: 'btn',
            type: 'button',
            props: { text: 'Guardar' },
            children: [],
            events: [{ event: 'click', actions: [{ kind: 'call', target: 'onGuardar' }] }],
          },
        },
        rootIds: ['btn'],
        vars: [],
        callbacks: [{ name: 'onGuardar', passesItem: true }],
        name: 'BotonGuardar',
      },
    },
    {
      name: 'con_modelo',
      input: {
        blocks: {
          t: { id: 't', type: 'table-c', props: {}, children: ['b'] },
          b: { id: 'b', type: 'tbody-c', props: {}, children: ['r'] },
          r: { id: 'r', type: 'tr', props: { repeatOver: 'true' }, children: ['c'] },
          c: { id: 'c', type: 'td', props: {}, children: ['s'] },
          s: { id: 's', type: 'span', props: { bindField: 'cliente' }, children: [] },
        },
        rootIds: ['t'],
        vars: [],
        name: 'TablaPedidos',
        model: {
          name: 'Pedido',
          sampleRows: 2,
          fields: [
            { name: 'cliente', type: 'text' as const, sample: 'Ana Ruiz' },
            { name: 'total', type: 'number' as const, sample: '120' },
          ],
        },
      },
    },
  ];

  const emitted: string[] = [];
  for (const pkg of packages) {
    for (const file of emitPackage(pkg.input)) {
      /*
        Se escribe la estructura REAL, con sus carpetas.

        Antes se aplanaba a `caso__Carpeta__Fichero.tsx` porque el paquete cabía
        en un fichero y daba igual. Con el paquete repartido en `types.ts`,
        `constants.ts` y `hooks/`, aplanar rompe todos los imports relativos y el
        verificador fallaba con «Cannot find module './types'» — un fallo del
        harness que se leía como un fallo del código emitido. Compilar la carpeta
        tal cual es además lo que de verdad hace quien se lleva el paquete.
      */
      const dest = join(packageDir, pkg.name, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, file.contents, 'utf8');
      if (file.language === 'tsx') emitted.push(`${pkg.name}/${file.path}`);
    }
  }
  writeFileSync(join(packageDir, 'manifest.json'), JSON.stringify(emitted, null, 2), 'utf8');
  console.log(`Emitidos ${emitted.length} paquetes en ${packageDir}`);
}
