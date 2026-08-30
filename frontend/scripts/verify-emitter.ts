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
import { reactEmitter, reactJsEmitter } from '../src/builder/emit-react';
import { vue2Emitter, vue2JsEmitter, vueEmitter, vueJsEmitter } from '../src/builder/emit-vue';
import { angular21Emitter, angular22Emitter } from '../src/builder/emit-angular';
import { emitAngularPackage, toFileBase } from '../src/builder/emit-angular-package';
import { emitPackage, toComponentName, type PackageFile } from '../src/builder/emit-package';
// El paquete de Vue se pide por el registro y no directamente a su emisor: así
// se comprueba de paso el enrutado, que es donde los cuatro dialectos de Vue
// llevaban devolviendo `null`.
import { packageFor } from '../src/builder/emitters';
import type { StateVar } from '../src/builder/actions';
import type { BuilderBlock } from '../src/builder/types';
import { SEED_LIBRARY } from '../src/libraries/seed-library';
import { TEMPLATES } from '../src/builder/templates';
import { componentLayer } from '../src/builder/cascade';
import { themeCss } from '../src/builder/theme';

const outDir = process.argv[2] ?? 'dist-emit-check';
const packageDir = process.argv[3];
const vueDir = process.argv[4];
/*
  Los mismos casos, reemitidos en JavaScript.

  No es una comprobación de cortesía: el JSX y el TSX salen del MISMO recorrido
  del árbol, así que lo único que puede fallar es la frontera —una anotación que
  se coló, un `import type` que quedó, un `defineProps` genérico en un SFC sin
  `lang="ts"`— y eso no se ve leyendo el emisor, porque el emisor es el mismo.
  Se ve compilando las dos salidas.
*/
const outJsDir = process.argv[5];
const packageJsDir = process.argv[6];
const vueJsDir = process.argv[7];
const angularDir = process.argv[8];
/*
  El paquete de carpeta de Angular.

  Va aparte del componente de fichero único porque es OTRO artefacto: la clase
  pierde la plantilla en línea y gana `templateUrl`, y el reparto en ficheros es
  justo donde puede romperse sin que el fichero único se entere.
*/
const angularPkgDir = process.argv[9];
/*
  El paquete de carpeta de Vue.

  Es el artefacto que faltaba: cuatro de los ocho destinos solo sabían entregarse
  como un SFC suelto. Va aparte del fichero único por el mismo motivo que el de
  Angular —el reparto en ficheros es justo donde puede romperse sin que el SFC de
  un fichero se entere— y además tiene aquí una comprobación que el otro no
  necesita: dentro de la carpeta, el SFC IMPORTA su contrato, sus datos y sus
  validadores, así que un import que sobra o que falta se ve compilando, no
  leyendo.
*/
const vuePkgDir = process.argv[10];
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

/*
  Las plantillas, por los mismos carriles que todo lo demás.

  Son la primera pantalla de quien abre el constructor sin saber qué construir,
  y hasta ahora no las miraba nadie: ni el emisor, ni las hojas de estilo, ni el
  compilador. Se registran como casos, así que a partir de aquí las cuatro se
  compilan en los ocho destinos y se empaquetan como carpeta igual que cualquier
  componente de la semilla.

  Y se afirma aparte lo que compilar no distingue, porque son fallos que solo se
  ven al abrirlas:

    · un tipo de bloque que ya no está en la paleta se pinta como «Bloque sin
      esquema» y compila igual;
    · un hijo que apunta a un id inexistente desaparece del árbol sin ruido;
    · un bloque que no es raíz ni hijo de nadie no llega nunca al lienzo;
    · una prop que el bloque declara y la plantilla no trae sale sin valor;
    · y un color escrito a mano ignora el tema de la librería, que es el fallo
      que traían las cuatro: cambiar el color de marca repintaba los componentes
      de la semilla y dejaba azules los nacidos de una plantilla.
*/
const tiposDePaleta = new Set(BLOCK_DEFINITIONS.map((d) => d.type));
/** Colores fijos de la paleta de Tailwind: lo que el tema debería decidir. */
const COLOR_FIJO = /\b(?:bg|text|border|ring|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

for (const plantilla of TEMPLATES) {
  const problemas: string[] = [];
  const referenciados = new Set(Object.values(plantilla.blocks).flatMap((b) => b.children ?? []));

  for (const raiz of plantilla.rootIds) {
    if (!plantilla.blocks[raiz]) problemas.push(`la raíz «${raiz}» no existe`);
  }

  for (const b of Object.values(plantilla.blocks)) {
    const def = BLOCK_DEFINITIONS.find((d) => d.type === b.type);
    if (!tiposDePaleta.has(b.type)) {
      problemas.push(`«${b.id}» usa el tipo «${b.type}», que ya no está en la paleta`);
    }
    for (const hijo of b.children ?? []) {
      if (!plantilla.blocks[hijo]) problemas.push(`«${b.id}» referencia al hijo inexistente «${hijo}»`);
    }
    if (!plantilla.rootIds.includes(b.id) && !referenciados.has(b.id)) {
      problemas.push(`«${b.id}» (${b.type}) no es raíz ni hijo de nadie: no llega al lienzo`);
    }
    if (def) {
      for (const prop of Object.keys(def.defaultProps)) {
        if (!(prop in (b.props ?? {}))) {
          problemas.push(`«${b.id}» (${b.type}) no trae la prop «${prop}»`);
        }
      }
    }
    const clases = String(b.props?.className ?? '');
    const fijo = COLOR_FIJO.exec(clases);
    if (fijo) problemas.push(`«${b.id}» fija el color «${fijo[0]}» en vez de usar el tema`);
  }

  // Una variable enlazada tiene que existir, o el campo se queda sin enlazar y
  // el envío del formulario no comprueba nada.
  const declaradas = new Set((plantilla.stateVars ?? []).map((v) => v.name));
  for (const b of Object.values(plantilla.blocks)) {
    const bind = b.props?.bindTo;
    if (bind && !declaradas.has(String(bind))) {
      problemas.push(`«${b.id}» enlaza con «${bind}», que la plantilla no declara`);
    }
    for (const accion of (b.events ?? []).flatMap((e) => e.actions)) {
      const destino = (accion as { target?: string }).target;
      if (accion.kind !== 'call' && destino && !declaradas.has(destino)) {
        problemas.push(`«${b.id}» actúa sobre «${destino}», que la plantilla no declara`);
      }
    }
  }

  if (problemas.length > 0) {
    console.error(`\nPlantilla «${plantilla.label}» incorrecta:`);
    for (const p of problemas) console.error(`  ✗ ${p}`);
    process.exit(1);
  }

  const codigo = addCase(`plantilla_${plantilla.id}`, {
    blocks: plantilla.blocks,
    rootIds: plantilla.rootIds,
    vars: plantilla.stateVars ?? [],
    name: plantilla.label,
  });

  /*
    Y el MARCADO EMITIDO tampoco puede llevar la marca escrita a mano.

    Mirar solo las props de la plantilla se queda corto: la mitad del color lo
    pone el esquema del bloque, no la plantilla. Fue así como el bloque `cta` de
    la plantilla «Landing Page» seguía pintándose con un degradado azul fijo
    mientras el resto del componente ya obedecía al tema — se veía en el lienzo y
    no lo detectaba ninguna comprobación.

    Se permiten los colores SEMÁNTICOS —verde, ámbar y rojo son éxito, aviso y
    error, y no cambian con la marca— y el azul solo donde una variante se llama
    así. Lo que no se permite es que la marca esté escrita a mano.
  */
  const marcaFija = codigo.match(/\b(?:bg|text|border|ring|from|via|to)-(?:blue|indigo|violet|purple|sky)-\d{2,3}\b/g);
  if (marcaFija) {
    console.error(`\nPlantilla «${plantilla.label}»: color de marca escrito a mano en lo emitido.`);
    for (const c of [...new Set(marcaFija)]) console.error(`  ✗ ${c}`);
    console.error('El color de marca lo pone el tema: usa var(--vz-primario) y sus roles.');
    process.exit(1);
  }
}

// La plantilla del formulario promete validación en su propia descripción, así
// que se comprueba que la trae: era un `card` con campos sueltos, sin `form`,
// sin reglas y sin envío, y la descripción llevaba meses mintiendo.
const plantillaForm = TEMPLATES.find((t) => t.id === 'form')!;
const bloquesForm = Object.values(plantillaForm.blocks);
const fallosForm: [string, boolean][] = [
  ['la raíz es un form, no un div', bloquesForm.some((b) => b.type === 'form')],
  ['tiene campos con reglas', bloquesForm.filter((b) => (b.validations ?? []).length > 0).length >= 4],
  ['el envío hace algo', bloquesForm.some((b) => (b.events ?? []).some((e) => e.event === 'submit'))],
  ['declara el estado que usa', (plantillaForm.stateVars ?? []).length > 0],
  ['hay un estado de éxito', bloquesForm.some((b) => b.visibleIf?.var === 'enviado')],
];
const rotosForm = fallosForm.filter(([, ok]) => !ok);
if (rotosForm.length > 0) {
  console.error('\nLa plantilla «Formulario» no cumple lo que promete:');
  for (const [what] of rotosForm) console.error(`  ✗ ${what}`);
  process.exit(1);
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

/*
  El mismo catálogo, pero con identidad y con foto.

  Cubre las dos decisiones que el de arriba no puede cubrir porque su modelo no
  las declara: que la clave de la lista salga del `id` en vez de la posición, y
  que una imagen pueda venir del dato. Se deja el de arriba tal cual —sin `id`—
  para que el caso de respaldo (clave por índice) siga verificándose: son dos
  comportamientos distintos y hacen falta los dos casos.
*/
const catalogoConId: Record<string, BuilderBlock> = {
  'block-1': block('block-1', 'div', { children: ['block-2'] }),
  'block-2': block('block-2', 'card', {
    children: ['block-3', 'block-4'],
    props: { ...block('block-2', 'card').props, repeatOver: 'true' },
  }),
  'block-3': block('block-3', 'img', {
    props: { ...block('block-3', 'img').props, bindField: 'foto', alt: 'Foto del producto' },
  }),
  'block-4': block('block-4', 'span', {
    props: { ...block('block-4', 'span').props, bindField: 'nombre' },
  }),
};
const catalogoConIdInput = {
  blocks: catalogoConId,
  rootIds: ['block-1'],
  vars: [],
  model: {
    name: 'Articulo',
    sampleRows: 3,
    fields: [
      { name: 'id', type: 'text' as const, sample: 'a-1' },
      { name: 'nombre', type: 'text' as const, sample: 'Teclado' },
      { name: 'foto', type: 'image' as const, sample: 'https://example.com/a.png' },
    ],
  },
};
const catalogoConIdCode = addCase('identidad_y_foto', catalogoConIdInput);

// La asociación etiqueta/control es del esquema, así que sale en los tres
// destinos; se afirma también sobre React, que es donde se emite primero.
for (const [what, ok] of [
  ['React asocia la etiqueta con htmlFor', /<label[^>]*htmlFor="vz-[^"]+"/.test(validatedCode)],
  ['React pone el id en el control', /<input[^>]*id="vz-[^"]+"/.test(validatedCode)],
] as const) {
  if (!ok) {
    console.error(`
Accesibilidad incorrecta: falta ${what}`);
    console.error(validatedCode);
    process.exit(1);
  }
}

for (const [what, needle] of [
  ['la clave sale del id, no del índice', 'key={item.id}'],
  ['el índice ya no se declara si no se usa', '.map((item) =>'],
  ['la imagen viene del dato', 'src={String(item.foto ?? \'\')}'],
] as const) {
  if (!catalogoConIdCode.includes(needle)) {
    console.error(`\nIdentidad/foto incorrecta: falta ${what} (${needle})`);
    console.error(catalogoConIdCode);
    process.exit(1);
  }
}

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

// ── Los mismos árboles en JavaScript ──
if (outJsDir) {
  mkdirSync(outJsDir, { recursive: true });
  for (const { name, input } of inputs) {
    writeFileSync(join(outJsDir, `${name}.jsx`), reactJsEmitter.emit(input), 'utf8');
  }
  writeFileSync(join(outJsDir, 'manifest.json'), JSON.stringify(inputs.map((c) => c.name), null, 2), 'utf8');
  console.log(`Emitidos ${inputs.length} componentes JSX en ${outJsDir}`);
}

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
  const vueConId = vueEmitter.emit(catalogoConIdInput);
  for (const [what, needle] of [
    ['la :key sale del id', ':key="item.id"'],
    ['la imagen viene del dato', ':src="String(item.foto ?? \'\')"'],
  ] as const) {
    if (!vueConId.includes(needle)) {
      console.error(`\nVue incorrecto: falta ${what} (${needle})`);
      console.error(vueConId);
      process.exit(1);
    }
  }

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

if (vueJsDir) {
  mkdirSync(vueJsDir, { recursive: true });
  for (const { name, input } of inputs) {
    writeFileSync(join(vueJsDir, `${name}.vue`), vueJsEmitter.emit(input), 'utf8');
  }
  writeFileSync(join(vueJsDir, 'manifest.json'), JSON.stringify(inputs.map((c) => c.name), null, 2), 'utf8');

  const datosVueJs = vueJsEmitter.emit(inputs.find((c) => c.name === 'reglas_de_negocio')!.input);
  const checksJs: [string, boolean][] = [
    ['el SFC no declara lang="ts"', !datosVueJs.includes('lang="ts"')],
    ['las props se declaran en runtime', datosVueJs.includes('defineProps({')],
    ['no queda ningún defineProps genérico', !datosVueJs.includes('defineProps<')],
    ['la colección lleva valor por defecto', datosVueJs.includes('default: () => MOCK_ITEMS')],
    ['el aviso se declara como prop', datosVueJs.includes('onComprar: { type: Function')],
    ['no queda ninguna interfaz', !datosVueJs.includes('interface ')],
  ];
  const rotos = checksJs.filter(([, ok]) => !ok);
  if (rotos.length > 0) {
    console.error('\nSFC de Vue en JavaScript incorrecto:');
    for (const [what] of rotos) console.error(`  ✗ ${what}`);
    process.exit(1);
  }

  console.log(`Emitidos ${inputs.length} SFC de Vue (JS) en ${vueJsDir}`);

  // ── Vue 2, en los dos lenguajes, en el mismo directorio ──
  //
  // Comparten el compilador con Vue 3: `@vue/compiler-sfc` valida igual un SFC
  // de opciones. Lo que cambia —el objeto de opciones frente a `<script setup>`—
  // se afirma aquí, porque compilar no distingue un dialecto del otro.
  for (const { name, input } of inputs) {
    writeFileSync(join(vueJsDir, `v2_${name}.vue`), vue2Emitter.emit(input), 'utf8');
    writeFileSync(join(vueJsDir, `v2js_${name}.vue`), vue2JsEmitter.emit(input), 'utf8');
  }
  writeFileSync(join(vueJsDir, 'manifest.json'), JSON.stringify(
    inputs.flatMap((c) => [c.name, `v2_${c.name}`, `v2js_${c.name}`]), null, 2), 'utf8');

  const datosV2 = vue2Emitter.emit(inputs.find((c) => c.name === 'comportamiento')!.input);
  // El formulario validado es el único caso que EXTRAE manejadores al script,
  // que es donde vive la diferencia entre los dos dialectos. En el otro todos
  // caben en la plantilla y no habría `methods` que mirar.
  const validadoV2 = vue2Emitter.emit(inputs.find((c) => c.name === 'formulario_validado')!.input);
  const checksV2: [string, boolean][] = [
    ['exporta un objeto de opciones', datosV2.includes('export default {')],
    ['el estado vive en data()', datosV2.includes('data() {')],
    ['no usa script setup', !datosV2.includes('<script setup')],
    ['no declara ningún ref', !datosV2.includes('ref(')],
    ['no importa nada de vue', !datosV2.includes("from 'vue'")],
    ['la plantilla sigue usando v-if', datosV2.includes('v-if=')],
    ['los manejadores van en methods', validadoV2.includes('methods: {')],
    ['dentro del script el estado se lee con this.', validadoV2.includes('this.correo')],
    // Solo el  de los  de Vue 3. El de  es DOM y
    // tiene que seguir estando: confundirlos era la afirmación, no el emisor.
    ['ninguna variable de estado se lee como ref', !/(correo|enviado)\.value/.test(validadoV2)],
  ];
  const rotosV2 = checksV2.filter(([, ok]) => !ok);
  if (rotosV2.length > 0) {
    console.error('\nSFC de Vue 2 incorrecto:');
    for (const [what] of rotosV2) console.error(`  ✗ ${what}`);
    console.error(`${datosV2}
──────
${validadoV2}`);
    process.exit(1);
  }

  console.log(`Emitidos ${inputs.length * 2} SFC de Vue 2 en ${vueJsDir}`);
}

// ── Angular: las dos versiones ──
//
// Se emiten con NOMBRE, porque una clase de Angular se llama de algo y ese
// nombre forma parte del artefacto: es el primer destino donde el componente no
// es anónimo.
if (angularDir) {
  mkdirSync(angularDir, { recursive: true });
  const nombres: string[] = [];

  for (const { name, input } of inputs) {
    const clase = `C${name.replace(/[^A-Za-z0-9]/g, '')}`;
    for (const [sufijo, emisor] of [['ng22', angular22Emitter], ['ng21', angular21Emitter]] as const) {
      const fichero = `${sufijo}_${name}`;
      writeFileSync(
        join(angularDir, `${fichero}.ts`),
        emisor.emit({ ...input, name: `${clase}${sufijo}` }),
        'utf8',
      );
      nombres.push(fichero);
    }
  }
  writeFileSync(join(angularDir, 'manifest.json'), JSON.stringify(nombres, null, 2), 'utf8');

  // Las reglas de negocio, adaptadas a Angular. Compilar la clase no demuestra
  // que la PLANTILLA diga lo que debe: eso se afirma sobre el texto.
  const reglas = inputs.find((c) => c.name === 'reglas_de_negocio')!.input;
  const ng22 = angular22Emitter.emit({ ...reglas, name: 'TablaCatalogo' });
  const ng21 = angular21Emitter.emit({ ...reglas, name: 'TablaCatalogo' });
  const validado = angular22Emitter.emit({
    ...inputs.find((c) => c.name === 'formulario_validado')!.input,
    name: 'FormularioValidado',
  });

  const checksNg: [string, boolean][] = [
    ['el repetidor usa @for con track', ng22.includes('@for (item of items(); track $index)')],
    ['con id declarado, el track es el id', angular22Emitter.emit({ ...catalogoConIdInput, name: 'Articulos' }).includes('track item.id')],
    ['la imagen se enlaza sin String(', angular22Emitter.emit({ ...catalogoConIdInput, name: 'Articulos' }).includes('[src]="item.foto"')],
    ['la colección entra por input()', ng22.includes('readonly items = input<Producto[]>(MOCK_ITEMS);')],
    ['la condición sobre el campo usa @if', ng22.includes('@if (item.stock > 0)')],
    ['el estilo condicional se enlaza con [class]', ng22.includes('[class]=')],
    ['el estilo condicional no usa literal de plantilla', !/\[class\]="[^"]*`/.test(ng22)],
    ['el aviso es un output()', ng22.includes('readonly onComprar = output<Producto>();')],
    ['el aviso se emite con this.', ng22.includes('this.onComprar.emit(item);')],
    ['el manejador sale a un método de la clase', ng22.includes('(click)="alPulsar(item)"')],
    // El campo de texto: evento correcto y valor tipado, no el `$event` entero.
    ['un campo de texto usa (input), no (change)', validado.includes('(input)="')],
    ['ningún campo de texto queda en (change)', !/<input(?![^>]*type="(checkbox|radio|file|range)")[^>]*\(change\)=/.test(validado)],
    ['al método le llega el valor, no el evento', validado.includes('$any($event.target).value')],
    ['el parámetro se tipa como valor', /\(valor: (string|boolean)\)/.test(validado)],
    ['ya no se tipa a mano el target del DOM', !validado.includes('e: { target:')],
    // Accesibilidad: la etiqueta tiene que apuntar a su control.
    ['la etiqueta se asocia con for', /<label[^>]*for="vz-[^"]+"/.test(validado)],
    ['el control lleva ese mismo id', /<input[^>]*id="vz-[^"]+"/.test(validado)],
    ['la interfaz del elemento se emite', ng22.includes('export interface Producto')],
    ['el selector sigue la convención', ng22.includes("selector: 'vz-tabla-catalogo'")],
    ['no queda ningún className', !ng22.includes('className')],
    ['no queda ningún String( en la plantilla', !/template: `[\s\S]*String\(/.test(ng22)],
    ['no queda ningún onClick', !ng22.includes('onClick')],
    // Lo único que separa a las dos versiones.
    ['la 21 declara OnPush', ng21.includes('changeDetection: ChangeDetectionStrategy.OnPush')],
    ['la 22 no lo declara', !ng22.includes('ChangeDetectionStrategy')],
    ['la 21 lo importa y la 22 no', ng21.includes('ChangeDetectionStrategy,') && !ng22.includes('ChangeDetectionStrategy,')],
    // Estado y validación en el destino donde de verdad aparecen.
    ['el estado son señales', validado.includes('signal(')],
    ['las señales se escriben con .set(', validado.includes('.set(')],
    ['los validadores son métodos de la clase', /^\s{2}validate\w+\(/m.test(validado)],
  ];

  const rotosNg = checksNg.filter(([, ok]) => !ok);
  if (rotosNg.length > 0) {
    console.error('\nAngular incorrecto:');
    for (const [what] of rotosNg) console.error(`  ✗ ${what}`);
    console.error(ng22);
    process.exit(1);
  }

  console.log(`Emitidos ${nombres.length} componentes de Angular en ${angularDir}`);
}

// ── Angular: el paquete de carpeta ──
//
// La clase se compila igual que la del fichero único, pero aquí importa además
// el REPARTO: que la plantilla salga a su `.html`, que el decorador la apunte
// con `templateUrl` y no la lleve dentro, y que los nombres de fichero sigan la
// convención de Angular. Nada de eso lo ve un `tsc` sobre el fichero único.
if (angularPkgDir) {
  mkdirSync(angularPkgDir, { recursive: true });
  const nombresPkg: string[] = [];

  for (const { name, input } of inputs) {
    const clase = `C${name.replace(/[^A-Za-z0-9]/g, '')}`;
    const ficheros = emitAngularPackage({ ...input, name: clase, version: 22 });
    for (const f of ficheros) {
      const destino = join(angularPkgDir, f.path);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, f.contents, 'utf8');
    }
    nombresPkg.push(`${clase}/${toFileBase(clase)}.component`);
  }
  writeFileSync(join(angularPkgDir, 'manifest.json'), JSON.stringify(nombresPkg, null, 2), 'utf8');

  const reglas = inputs.find((c) => c.name === 'reglas_de_negocio')!.input;
  const pkg = emitAngularPackage({ ...reglas, name: 'TablaCatalogo', version: 22 });
  const rutas = pkg.map((f) => f.path);
  const clase = pkg.find((f) => f.path.endsWith('.component.ts'))!.contents;
  const plantilla = pkg.find((f) => f.path.endsWith('.component.html'))!.contents;

  const checksPkg: [string, boolean][] = [
    ['la clase va en tabla-catalogo.component.ts', rutas.includes('TablaCatalogo/tabla-catalogo.component.ts')],
    ['la plantilla va en tabla-catalogo.component.html', rutas.includes('TablaCatalogo/tabla-catalogo.component.html')],
    ['hay punto de entrada', rutas.includes('TablaCatalogo/index.ts')],
    ['hay README', rutas.includes('TablaCatalogo/README.md')],
    ['la clase apunta a la plantilla con templateUrl', clase.includes("templateUrl: './tabla-catalogo.component.html'")],
    ['la clase ya no lleva la plantilla dentro', !clase.includes('template: `')],
    ['la plantilla conserva el repetidor', plantilla.includes('@for (item of items(); track $index)')],
    ['la plantilla no queda sangrada de más', !plantilla.startsWith('    ')],
    ['el barril exporta la clase', pkg.find((f) => f.path.endsWith('index.ts'))!.contents.includes("export { TablaCatalogo } from './tabla-catalogo.component';")],
    /*
      El contrato de datos y los mock, en sus ficheros.

      En el fichero único viven delante de la clase porque no hay dónde ponerlos;
      en la carpeta son otra cosa: `types.ts` es lo que importa quien integra el
      componente, y `constants.ts` lo que sustituye por datos reales. Con los dos
      dentro del `.component.ts`, usar el tipo obligaba a importar del fichero de
      la clase.
    */
    ['el contrato va en types.ts', rutas.includes('TablaCatalogo/types.ts')],
    ['los datos van en constants.ts', rutas.includes('TablaCatalogo/constants.ts')],
    ['la interfaz sale del fichero de la clase', !clase.includes('export interface Producto')],
    ['los mock salen del fichero de la clase', !/^const MOCK_ITEMS/m.test(clase)],
    ['la clase importa el tipo de types', clase.includes("import type { Producto } from './types';")],
    ['la clase importa los mock de constants', clase.includes("import { MOCK_ITEMS } from './constants';")],
    ['el barril exporta también el tipo', pkg.find((f) => f.path.endsWith('index.ts'))!.contents.includes("export type { Producto } from './types';")],
    /*
      Y los validadores NO salen a un `utils.ts`, al revés que en React y en Vue.

      La plantilla de Angular solo resuelve nombres contra la instancia, así que
      un validador fuera de la clase compilaría y luego no existiría al
      renderizar. Se afirma que siguen siendo métodos para que nadie los mueva
      «por consistencia» con los otros dos destinos.
    */
    ['los validadores no salen a utils.ts', !rutas.includes('TablaCatalogo/utils.ts')],
  ];

  const rotosPkg = checksPkg.filter(([, ok]) => !ok);
  if (rotosPkg.length > 0) {
    console.error('\nPaquete de Angular incorrecto:');
    for (const [what] of rotosPkg) console.error(`  ✗ ${what}`);
    console.error(clase);
    process.exit(1);
  }

  console.log(`Emitidos ${nombresPkg.length} paquetes de Angular en ${angularPkgDir}`);
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

  /*
    Convenciones del paquete, por lenguaje.

    Compilar demuestra que el código es válido, no que esté BIEN HECHO: un
    paquete con todo en un fichero, con el componente en minúsculas o con el
    hook sin el prefijo `use` compila igual y es inservible como pieza de una
    librería. Lo que se afirma aquí es lo que hace que un paquete se reconozca
    como tal en su ecosistema: las capas, los nombres y el idioma de cada una.
  */
  function verificaConvenciones(caso: string, nombre: string, ficheros: PackageFile[], lang: 'ts' | 'js') {
    const rutas = ficheros.map((f) => f.path);
    const vista = lang === 'ts' ? 'tsx' : 'jsx';
    const modulo = lang === 'ts' ? 'ts' : 'js';
    const busca = (p: string) => ficheros.find((f) => f.path === p)?.contents ?? '';

    const problemas: string[] = [];
    const exige = (cond: boolean, que: string) => { if (!cond) problemas.push(que); };

    // ── Capas: una carpeta por componente, y un fichero por responsabilidad ──
    exige(rutas.every((r) => r.startsWith(`${nombre}/`)), 'todo cuelga de la carpeta del componente');
    exige(rutas.includes(`${nombre}/index.${modulo}`), `existe index.${modulo} como única puerta pública`);
    exige(rutas.includes(`${nombre}/${nombre}.${vista}`), `la vista se llama ${nombre}.${vista}`);
    exige(rutas.includes(`${nombre}/types.${modulo}`), `el contrato vive en types.${modulo}`);
    exige(rutas.includes(`${nombre}/README.md`), 'lleva README');

    // ── Nomenclatura: PascalCase el componente, `use` + PascalCase el hook ──
    exige(/^[A-Z][A-Za-z0-9]*$/.test(nombre), 'el componente va en PascalCase');
    const hook = rutas.find((r) => r.includes('/hooks/'));
    if (hook) {
      exige(hook === `${nombre}/hooks/use${nombre}.${modulo}`, 'el hook se llama use + el componente');
      exige(busca(hook).includes(`export function use${nombre}(`), 'el hook exporta una función con ese nombre');
    }

    // ── El componente es una función exportada con su nombre ──
    const vistaSrc = busca(`${nombre}/${nombre}.${vista}`);
    if (vistaSrc) {
      exige(vistaSrc.includes(`export function ${nombre}(`), 'la vista exporta una función con el nombre del componente');
      exige(!vistaSrc.includes('export default'), 'no usa export default (el índice reexporta por nombre)');
    }

    // ── El contrato, en el idioma de cada lenguaje ──
    const contrato = busca(`${nombre}/types.${modulo}`);
    if (lang === 'ts') {
      exige(contrato.includes(`export interface ${nombre}Props`), 'el contrato es una interfaz exportada');
    } else {
      exige(contrato.includes(`@typedef {object} ${nombre}Props`), 'el contrato es un @typedef de JSDoc');
      exige(contrato.includes('export {}'), 'types.js es un módulo, para poder referenciarlo con import()');
    }

    /*
      ── Las funciones puras, en `utils`; los datos, en `constants` ──

      Es la separación que faltaba: los validadores salían mezclados con los mock
      y las listas de clases en un único `constants.ts`. Compilaba igual, y ese
      es justo el motivo de afirmarlo aquí: quien recibe el paquete abre
      `constants` para cambiar los datos de ejemplo, y se encontraba dentro las
      reglas del formulario.
    */
    const utils = busca(`${nombre}/utils.${modulo}`);
    const constantes = busca(`${nombre}/constants.${modulo}`);
    if (utils) {
      exige(utils.includes('export const validate'), 'utils exporta sus validadores');
      exige(!/MOCK_ITEMS|_CLASSES/.test(utils), 'utils no lleva datos ni listas de clases');
    }
    exige(!/^export const validate/m.test(constantes), 'constants no lleva validadores');

    // Y lo que un fichero nombra, lo importa: un nombre suelto no compila en
    // destino, y es la forma característica de romperse al repartir en ficheros.
    for (const ruta of rutas.filter((r) => /\.[jt]sx?$/.test(r))) {
      const src = busca(ruta);
      const cuerpo = src.split('\n').filter((l) => !l.startsWith('import ')).join('\n');
      for (const validador of new Set(cuerpo.match(/\bvalidate[A-Z]\w*/g) ?? [])) {
        if (ruta.endsWith(`utils.${modulo}`)) continue;
        exige(
          new RegExp(`import \\{[^}]*\\b${validador}\\b[^}]*\\} from '\\.{1,2}/utils';`).test(src),
          `${ruta} importa ${validador} de utils`,
        );
      }
    }

    // ── Ningún fichero con la extensión del otro lenguaje ──
    const ajena = lang === 'ts' ? /\.(jsx|js)$/ : /\.(tsx|ts)$/;
    exige(!rutas.some((r) => ajena.test(r)), 'ningún fichero lleva la extensión del otro lenguaje');

    if (problemas.length > 0) {
      console.error(`\nConvenciones del paquete «${caso}» (${lang}):`);
      for (const p of problemas) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
  }

  const emitted: string[] = [];
  for (const pkg of packages) {
    const ficherosTs = emitPackage(pkg.input);
    verificaConvenciones(pkg.name, toComponentName(pkg.input.name), ficherosTs, 'ts');
    for (const file of ficherosTs) {
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

  // ── Los mismos paquetes en JavaScript ──
  if (packageJsDir) {
    const emittedJs: string[] = [];
    const restos: string[] = [];

    for (const pkg of packages) {
      const ficherosJs = emitPackage({ ...pkg.input, lang: 'js' });
      verificaConvenciones(pkg.name, toComponentName(pkg.input.name), ficherosJs, 'js');
      for (const file of ficherosJs) {
        const dest = join(packageJsDir, pkg.name, file.path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, file.contents, 'utf8');
        if (file.language === 'jsx') emittedJs.push(`${pkg.name}/${file.path}`);

        /*
          Un `.js` con sintaxis de TypeScript dentro es el fallo característico
          de este camino, y el más caro: `tsc` con `allowJs` lo TRAGA —acepta
          anotaciones en ficheros JS sin rechistar— así que compilar no lo
          detecta. Solo se ve al abrirlo en un proyecto JavaScript de verdad,
          donde Babel o esbuild lo rechazan. Se afirma aquí, sobre el texto.
        */
        if (file.language !== 'jsx' && file.language !== 'js') continue;
        for (const [que, patron] of [
          ['una interfaz', /\binterface\s+\w+\s*\{/],
          ['un import de tipos', /\bimport\s+type\b/],
          ['una exportación de tipos', /\bexport\s+type\b/],
          ['una aserción `as`', /\bas\s+[A-Z(]/],
          // Una anotación de parámetro o de retorno. Se descartan los dos puntos
          // de un objeto literal exigiendo que delante haya un identificador
          // pegado a un `(`, `,` o `)`, que es la forma de una firma.
          ['una anotación de tipo', /\)\s*:\s*(string|number|boolean|void)\b|\(\s*\w+\s*:\s*(string|number|boolean|\{)/],
        ] as const) {
          if (patron.test(file.contents)) restos.push(`${pkg.name}/${file.path}: ${que}`);
        }
      }
    }

    if (restos.length > 0) {
      console.error('\nSintaxis de TypeScript en un paquete de JavaScript:');
      for (const r of restos) console.error(`  ✗ ${r}`);
      process.exit(1);
    }

    writeFileSync(join(packageJsDir, 'manifest.json'), JSON.stringify(emittedJs, null, 2), 'utf8');
    console.log(`Emitidos ${emittedJs.length} paquetes JS en ${packageJsDir}`);
  }
}

// ── Vue: el paquete de carpeta ──
//
// Se emiten los MISMOS casos que el SFC de un fichero, en los cuatro dialectos,
// y se afirma lo que compilar no distingue: que cada responsabilidad esté en su
// fichero, que el SFC importe exactamente lo que nombra y que ninguno de los dos
// lenguajes se cuele en el paquete del otro.
if (vuePkgDir) {
  mkdirSync(vuePkgDir, { recursive: true });

  const dialectos = [
    { carpeta: 'vue3-ts', target: 'vue3', dialecto: 3 as const, lang: 'ts' as const },
    { carpeta: 'vue3-js', target: 'vue3-js', dialecto: 3 as const, lang: 'js' as const },
    { carpeta: 'vue2-ts', target: 'vue2', dialecto: 2 as const, lang: 'ts' as const },
    { carpeta: 'vue2-js', target: 'vue2-js', dialecto: 2 as const, lang: 'js' as const },
  ];

  /**
   * Convenciones del paquete de Vue.
   *
   * Compilar demuestra que el SFC es válido, no que la carpeta esté BIEN HECHA:
   * un paquete con todo dentro del `.vue`, sin punto de entrada o con el
   * contrato duplicado compila igual y no sirve como pieza de una librería.
   */
  const verificaVue = (
    caso: string,
    nombre: string,
    ficheros: PackageFile[],
    d: (typeof dialectos)[number],
    vacio: boolean,
  ) => {
    const rutas = ficheros.map((f) => f.path);
    const modulo = d.lang === 'ts' ? 'ts' : 'js';
    const busca = (p: string) => ficheros.find((f) => f.path === p)?.contents ?? '';
    const sfc = busca(`${nombre}/${nombre}.vue`);

    const problemas: string[] = [];
    const exige = (cond: boolean, que: string) => { if (!cond) problemas.push(que); };

    /*
      Un lienzo sin bloques entrega el esqueleto, no la carpeta completa.

      Es lo mismo que hace el paquete de Angular y por el mismo motivo: no hay
      componente que repartir, y emitir un `types.ts` con `export {}` y un README
      describiendo la nada sería peor que decir que todavía no hay nada. Se
      afirma que es EXACTAMENTE eso, para que el esqueleto no sirva de coartada a
      un paquete incompleto de verdad.
    */
    if (vacio) {
      exige(rutas.length === 2, 'el esqueleto no trae más que el SFC y su índice');
      exige(rutas.includes(`${nombre}/${nombre}.vue`), 'el esqueleto trae el SFC');
      exige(rutas.includes(`${nombre}/index.${modulo}`), 'el esqueleto trae el índice');
      if (problemas.length > 0) {
        console.error(`\nEsqueleto de Vue «${caso}» (${d.carpeta}):`);
        for (const p of problemas) console.error(`  ✗ ${p}`);
        process.exit(1);
      }
      return;
    }

    // ── Capas: una carpeta por componente, un fichero por responsabilidad ──
    exige(rutas.every((r) => r.startsWith(`${nombre}/`)), 'todo cuelga de la carpeta del componente');
    exige(rutas.includes(`${nombre}/${nombre}.vue`), `el componente se llama ${nombre}.vue`);
    exige(rutas.includes(`${nombre}/index.${modulo}`), `existe index.${modulo} como única puerta pública`);
    exige(rutas.includes(`${nombre}/types.${modulo}`), `el contrato vive en types.${modulo}`);
    exige(rutas.includes(`${nombre}/README.md`), 'lleva README');

    // ── El barril reexporta el SFC por nombre ──
    exige(
      busca(`${nombre}/index.${modulo}`).includes(`export { default as ${nombre} } from './${nombre}.vue';`),
      'el índice reexporta el componente por su nombre',
    );

    // ── Nada de lo repartido se queda además dentro del SFC ──
    exige(!sfc.includes('export interface '), 'el contrato no se duplica dentro del SFC');
    exige(!/^const MOCK_ITEMS/m.test(sfc), 'los datos de ejemplo no se quedan dentro del SFC');
    exige(!/^const validate\w+ =/m.test(sfc), 'los validadores no se quedan dentro del SFC');

    // ── Y lo que el SFC nombra, lo importa ──
    if (sfc.includes('MOCK_ITEMS')) {
      exige(sfc.includes("import { MOCK_ITEMS } from './constants';"), 'importa los datos de ejemplo');
      exige(rutas.includes(`${nombre}/constants.${modulo}`), `los datos viven en constants.${modulo}`);
    }
    for (const validador of new Set(sfc.match(/\bvalidate[A-Z]\w*/g) ?? [])) {
      exige(
        new RegExp(`import \\{[^}]*\\b${validador}\\b[^}]*\\} from './utils';`).test(sfc),
        `importa ${validador} de utils`,
      );
    }
    if (rutas.includes(`${nombre}/utils.${modulo}`)) {
      exige(busca(`${nombre}/utils.${modulo}`).includes('export const validate'), 'utils exporta sus validadores');
    }

    /*
      Ningún import sin usar.

      No es un detalle de estilo: en cualquier proyecto con `noUnusedLocals` —que
      es donde va a acabar este paquete— un import que sobra tumba la
      compilación. Ya pasó con el tipo de las props en Vue 2, que declara sus
      props en runtime y no lo nombra.
    */
    const finDeImports = sfc.lastIndexOf('import ');
    const cuerpo = finDeImports === -1 ? sfc : sfc.slice(sfc.indexOf('\n', finDeImports));
    for (const [, nombres] of sfc.matchAll(/import (?:type )?\{([^}]+)\} from '\.\/[\w.]+';/g)) {
      for (const ident of nombres.split(',').map((n) => n.trim()).filter(Boolean)) {
        exige(new RegExp(`\\b${ident}\\b`).test(cuerpo), `${ident} se importa y se usa`);
      }
    }

    // ── El dialecto correcto, y el lenguaje correcto ──
    if (d.dialecto === 3) {
      exige(!sfc.includes('export default {'), 'Vue 3 no usa el objeto de opciones');
    } else {
      exige(!sfc.includes('<script setup'), 'Vue 2 no usa script setup');
      exige(!sfc.includes('defineProps'), 'Vue 2 no usa defineProps');
    }
    const ajena = d.lang === 'ts' ? /\.(jsx|js)$/ : /\.(tsx|ts)$/;
    exige(!rutas.some((r) => ajena.test(r)), 'ningún fichero lleva la extensión del otro lenguaje');
    if (d.lang === 'js') {
      exige(!sfc.includes('lang="ts"'), 'el SFC de JavaScript no declara lang="ts"');
      exige(!sfc.includes('defineProps<'), 'no queda ningún defineProps genérico');
      for (const f of ficheros) {
        if (f.language !== 'js' && f.language !== 'vue') continue;
        exige(!/\binterface\s+\w+\s*\{/.test(f.contents), `${f.path} no lleva una interfaz`);
        exige(!/\bimport\s+type\b/.test(f.contents), `${f.path} no lleva un import de tipos`);
        exige(!/\bexport\s+type\b/.test(f.contents), `${f.path} no lleva una exportación de tipos`);
      }
    }

    if (problemas.length > 0) {
      console.error(`\nConvenciones del paquete de Vue «${caso}» (${d.carpeta}):`);
      for (const p of problemas) console.error(`  ✗ ${p}`);
      console.error(sfc);
      process.exit(1);
    }
  };

  const emitidos: string[] = [];
  for (const d of dialectos) {
    for (const { name, input } of inputs) {
      const clase = `C${name.replace(/[^A-Za-z0-9]/g, '')}`;
      const ficheros = packageFor(d.target, { ...input, name: clase })!;
      verificaVue(name, clase, ficheros, d, input.rootIds.length === 0);
      for (const f of ficheros) {
        const destino = join(vuePkgDir, d.carpeta, f.path);
        mkdirSync(dirname(destino), { recursive: true });
        writeFileSync(destino, f.contents, 'utf8');
        if (f.language === 'vue') emitidos.push(`${d.carpeta}/${f.path}`);
      }
    }
  }
  writeFileSync(join(vuePkgDir, 'manifest.json'), JSON.stringify(emitidos, null, 2), 'utf8');

  /*
    El caso con modelo, validación y aviso, mirado de cerca.

    Es el que ejercita los cuatro ficheros a la vez, y por tanto el único donde
    se puede afirmar el reparto completo: el contrato con nombre en `types.ts`,
    el genérico de `defineProps` apuntando a él en vez de repetir la lista, los
    datos en `constants.ts` y el enlace a los estilos desde el propio SFC.
  */
  const reglas = inputs.find((c) => c.name === 'reglas_de_negocio')!.input;
  const pkg = packageFor('vue3', {
    ...reglas,
    name: 'TablaCatalogo',
    customStyles: '.extra { color: red; }',
    stylesLanguage: 'css',
  })!;
  const rutas = pkg.map((f) => f.path);
  const leer = (p: string) => pkg.find((f) => f.path === p)?.contents ?? '';
  const sfc = leer('TablaCatalogo/TablaCatalogo.vue');
  const tipos = leer('TablaCatalogo/types.ts');

  const checksVuePkg: [string, boolean][] = [
    ['el SFC va en TablaCatalogo.vue', rutas.includes('TablaCatalogo/TablaCatalogo.vue')],
    ['el contrato va en types.ts', rutas.includes('TablaCatalogo/types.ts')],
    ['los datos van en constants.ts', rutas.includes('TablaCatalogo/constants.ts')],
    ['los estilos van en styles/', rutas.includes('TablaCatalogo/styles/TablaCatalogo.css')],
    ['hay punto de entrada', rutas.includes('TablaCatalogo/index.ts')],
    ['hay README', rutas.includes('TablaCatalogo/README.md')],
    ['el contrato es una interfaz con nombre', tipos.includes('export interface TablaCatalogoProps')],
    ['la interfaz del elemento se emite', tipos.includes('export interface Producto')],
    ['defineProps usa el tipo con nombre', sfc.includes('defineProps<TablaCatalogoProps>()')],
    ['no repite la lista de props dentro del SFC', !sfc.includes('items?: Producto[]')],
    ['los mock llegan por import', sfc.includes("import { MOCK_ITEMS } from './constants';")],
    ['la colección conserva su valor por defecto', sfc.includes('withDefaults(')],
    ['el repetidor sigue en la plantilla', sfc.includes('v-for="(item, index) in items"')],
    ['los estilos se enlazan desde el SFC', sfc.includes('<style src="./styles/TablaCatalogo.css"></style>')],
    ['los estilos no van scoped', !sfc.includes('<style scoped')],
    ['el índice exporta el tipo del elemento', leer('TablaCatalogo/index.ts').includes('Producto')],
  ];

  /*
    Vue 2 con validación: el fallo que este carril existe para no repetir.

    La plantilla de Vue 2 resuelve los nombres contra la INSTANCIA. Los
    validadores se emitían como constantes de módulo, así que el SFC compilaba y
    luego, al montarse, el `@blur` de cualquier campo validado reventaba con
    «Property or method "validateCorreo" is not defined on the instance». Ni el
    compilador de Vue ni `tsc` lo ven: hay que afirmarlo.
  */
  const v2 = packageFor('vue2', {
    ...inputs.find((c) => c.name === 'formulario_validado')!.input,
    name: 'FormularioValidado',
  })!;
  const sfcV2 = v2.find((f) => f.path.endsWith('.vue'))!.contents;
  const metodosV2 = /methods: \{\n([\s\S]*?)\n  \},/.exec(sfcV2)?.[1] ?? '';
  checksVuePkg.push(
    ['en Vue 2 el validador se expone en methods', /^\s+validateCorreo,$/m.test(metodosV2)],
    ['en Vue 2 el validador se llama con this. desde el script', sfcV2.includes('this.validateCorreo(')],
    ['en Vue 2 la plantilla lo llama sin this.', /@blur="error\d* = validateCorreo\(/.test(sfcV2)],
    [
      'en Vue 2 el validador llega por import',
      /import \{[^}]*\bvalidateCorreo\b[^}]*\} from '\.\/utils';/.test(sfcV2),
    ],
  );

  const rotosVue = checksVuePkg.filter(([, ok]) => !ok);
  if (rotosVue.length > 0) {
    console.error('\nPaquete de Vue incorrecto:');
    for (const [what] of rotosVue) console.error(`  ✗ ${what}`);
    console.error(sfc);
    console.error('──────');
    console.error(sfcV2);
    process.exit(1);
  }

  console.log(`Emitidos ${emitidos.length} paquetes de Vue en ${vuePkgDir}`);
}
