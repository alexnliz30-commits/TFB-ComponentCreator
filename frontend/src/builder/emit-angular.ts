/**
 * Emisor de Angular (componente standalone con señales) sobre la misma IR.
 *
 * Tercer framework sobre el mismo árbol de bloques, y el que más lejos queda de
 * React: no es una sustitución de nombres como en Vue, porque **una plantilla de
 * Angular no es JavaScript**. Sus expresiones viven en un lenguaje propio y
 * acotado que, entre otras cosas, no puede llamar funciones globales: `String(x)`
 * o `Number(e.target.value)` —que el esquema emite sin pensarlo, porque para
 * React son JavaScript corriente— sencillamente no compilan ahí.
 *
 * De esa restricción salen las tres decisiones de este módulo:
 *
 *   1. **Todo manejador es un método de la clase.** Dentro de la clase sí hay
 *      TypeScript completo, así que `Number(...)` funciona; y llamar a un método
 *      desde la plantilla es además lo idiomático en Angular. Los manejadores que
 *      necesitan el elemento del repetidor lo reciben por parámetro.
 *   2. **Las interpolaciones se simplifican en vez de traducirse.** `{{ x }}` ya
 *      convierte a texto y pinta vacío lo que sea nulo, que es exactamente lo que
 *      hacía el `String(x ?? '')` de React: se quita el envoltorio en lugar de
 *      buscarle un equivalente.
 *   3. **Los literales de plantilla pasan a concatenación.** Angular los admite
 *      desde hace poco, pero `'a' + (c ? 'b' : '')` vale en todas las versiones
 *      que este emisor declara soportar, y aquí no se gana nada arriesgando.
 *
 * El estado son señales: `x()` para leer y `x.set(…)` / `x.update(…)` para
 * escribir. Los avisos a la aplicación son `output()`, que es literalmente el
 * mismo contrato —alguien puede escuchar o no— con el nombre de Angular.
 */

import type { BuilderBlock } from './types';
import { initialLiteral, setterName } from './actions';
import { ITEM_PARAM, mockRowsLiteral, modelInterface } from './data-model';
import { ITEMS_PROP, buildNode, collectImplicitVars, type SchemaCtx } from './schema';
import { VOID_TAGS, type Attr, type UiNode } from './ui-node';
import {
  ROOT_LAYOUT, analyzeStateUsage, arrowAMetodo, itemTypeOf, usedCallbacks,
  type CodeEmitter, type EmitInput,
} from './emit-react';
import { toComponentName } from './emit-package';

/**
 * Versiones soportadas: la actual y la anterior.
 *
 * Se declaran las dos porque un equipo rara vez está en la última el día que
 * sale: ofrecer solo la actual obliga a quien va una versión por detrás a
 * arreglar a mano lo que el generador ya sabía hacer.
 */
export type AngularVersion = 21 | 22;

const EMPTY_COMPONENT = `import { Component } from '@angular/core';

@Component({
  selector: 'vz-componente',
  template: '<div class="p-4 text-slate-400">Vacío</div>',
})
export class Componente {}
`;

function emisorAngular(version: AngularVersion): CodeEmitter {
  return {
    key: `angular${version}`,
    label: `Angular ${version} + TypeScript`,
    extension: 'ts',
    language: 'ts',
    /*
      Angular solo en TypeScript, y no por falta de ganas.

      Un componente se declara con decoradores (`@Component`), que no son
      JavaScript estándar: sin TypeScript —o sin un build configurado para
      decoradores heredados— el fichero no es válido en ningún proyecto Angular.
      La invariante ya vivía en el dominio del backend antes que este emisor, y
      esto la respeta en lugar de contradecirla desde el otro lado.
    */
    lang: 'ts',
    frameworkName: 'Angular',
    // Solo el harness KR1: la vista previa compila este componente en el
    // navegador con el JIT de Angular y lo arranca como una aplicación.
    verifiable: false,
    emit: (input) => emitAngular(input, version),
  };
}

export const angular22Emitter = emisorAngular(22);
export const angular21Emitter = emisorAngular(21);

// ─────────────────────────────────────────────────────────────────────────────
// Contexto de la emisión
// ─────────────────────────────────────────────────────────────────────────────

interface NgCtx {
  blocks: Record<string, BuilderBlock>;
  schema: SchemaCtx;
  /** Nombres de las variables de estado; son las señales del componente. */
  signals: Set<string>;
  /** Setter → variable, para deshacer las llamadas de React. */
  setters: Map<string, string>;
  /** Props de función declaradas, que se emiten como `output()`. */
  callbacks: Set<string>;
  /** Validadores recogidos del esquema; van como métodos de la clase. */
  helpers: Map<string, string>;
  /** Métodos extraídos de los manejadores, en orden de aparición. */
  methods: string[];
  /** Identificadores ya ocupados, para no pisar los del usuario. */
  taken: Set<string>;
  /** `true` mientras se emite dentro de un repetidor: `item` está en ámbito. */
  enRepetidor: boolean;
}

/**
 * Las partes de un componente de Angular, antes de decidir en cuántos ficheros van.
 *
 * Existen porque el mismo componente se entrega de dos formas: como fichero
 * único —lo que enseña la vista de código— y como carpeta con la plantilla y los
 * estilos aparte, que es la convención de Angular y lo que espera un proyecto
 * real. Componer dos veces el mismo texto con dos funciones distintas acabaría
 * con las dos formas divergiendo; aquí se emite una vez y se reparte después.
 */
export interface PiezasAngular {
  /** Nombre de la clase, en PascalCase. */
  nombre: string;
  /** `vz-product-catalog`. */
  selector: string;
  /** Línea `import { … } from '@angular/core';`. */
  imports: string;
  /**
   * Interfaz del modelo; vacía si el componente no repite nada.
   *
   * Va separada de los datos de ejemplo porque en el paquete de carpeta son dos
   * ficheros distintos —el contrato y el contenido— y una sola cadena no se
   * puede repartir sin volver a partirla por texto, que es justo el tipo de
   * recorte que este emisor dejó de hacer.
   */
  modelo: string;
  /** `const MOCK_ITEMS: T[] = […];`; vacío si el componente no repite nada. */
  mock: string;
  /** Modelo y datos juntos, que es como los lleva el fichero único. */
  declaraciones: string;
  /** Contenido de la plantilla, ya sangrado, sin el envoltorio `template:`. */
  plantilla: string;
  /** Cuerpo de la clase: señales, `input()`, `output()` y métodos. */
  cuerpoClase: string;
  /** `changeDetection: OnPush`, solo en Angular 21. */
  onPush: boolean;
}

export function piezasAngular(input: EmitInput, version: AngularVersion): PiezasAngular | null {
  if (input.rootIds.length === 0) return null;

  const { blocks, rootIds, vars } = input;
  const { usedVars } = analyzeStateUsage(blocks, rootIds, vars, input.model, input.callbacks);
  const implicitVars = collectImplicitVars(blocks, rootIds, vars);
  const allVars = [...usedVars, ...implicitVars];

  const helpers = new Map<string, string>();
  const schema: SchemaCtx = {
    vars,
    blocks,
    model: input.model,
    callbacks: input.callbacks,
    lang: 'ts',
    collectHelper: (name, code) => {
      if (!helpers.has(name)) helpers.set(name, code);
    },
  };

  const ctx: NgCtx = {
    blocks,
    schema,
    signals: new Set(allVars.map((v) => v.name)),
    setters: new Map(allVars.map((v) => [setterName(v.name), v.name])),
    callbacks: new Set((input.callbacks ?? []).map((c) => c.name)),
    helpers,
    methods: [],
    taken: new Set(allVars.flatMap((v) => [v.name, setterName(v.name)])),
    enRepetidor: false,
  };

  const body = rootIds
    .map((id) => {
      const block = blocks[id];
      return block ? emitNode(buildNode(block, schema), ctx, 3, block.children) : '';
    })
    .filter(Boolean)
    .join('\n');

  const nombre = toComponentName(input.name ?? 'MiComponente');
  const itemType = itemTypeOf(input);
  const llamadas = usedCallbacks(input.callbacks, `${body}\n${ctx.methods.join('\n')}`);

  // ── Miembros de la clase ──────────────────────────────────────────────────
  const miembros: string[] = [];
  if (itemType) {
    // La colección entra por `input()` con los datos de ejemplo por defecto: el
    // mismo contrato que en React y en Vue, escrito con la API de Angular.
    miembros.push(`  readonly ${ITEMS_PROP} = input<${itemType}[]>(MOCK_ITEMS);`);
  }
  for (const cb of llamadas) {
    /*
      Un aviso a la aplicación es un `output()`.

      Es el mismo contrato que la prop de función de React —quien integra el
      componente escucha si quiere, y si no escucha no pasa nada— con la forma
      que Angular le da. Por eso no se emite como `input()` de tipo función:
      sería traducir la letra en vez del significado.
    */
    const tipo = cb.passesItem && itemType ? `<${itemType}>` : '<void>';
    miembros.push(`  readonly ${cb.name} = output${tipo}();`);
  }
  for (const v of allVars) {
    miembros.push(`  readonly ${v.name} = signal(${initialLiteral(v)});`);
  }

  const cuerpoClase = [
    miembros.join('\n'),
    /*
      Los validadores son métodos de la clase, no funciones de módulo.

      No es una preferencia de estilo: la plantilla de Angular solo resuelve
      nombres contra la instancia, y el manejador de salida de un campo
      (`(blur)="error.set(validateCorreo(correo()))"`) vive en la plantilla. Como
      constante de módulo compilaría y luego no existiría al renderizar. Es la
      razón por la que el paquete de Angular no tiene `utils.ts` y los de React y
      Vue sí.
    */
    [...ctx.helpers.values()].map((h) => reindentar(arrowAMetodo(h))).join('\n\n'),
    ctx.methods.join('\n\n'),
  ].filter((p) => p.length > 0).join('\n\n');

  // ── Imports: solo lo que se usa ───────────────────────────────────────────
  const desdeCore = [
    // `ChangeDetectionStrategy` solo cuando hay que declararla (ver más abajo).
    ...(version === 21 ? ['ChangeDetectionStrategy'] : []),
    'Component',
    ...(itemType ? ['input'] : []),
    ...(llamadas.length > 0 ? ['output'] : []),
    ...(allVars.length > 0 ? ['signal'] : []),
  ];

  const modelo = itemType ? modelInterface(input.model!) : '';
  const mock = itemType ? `const MOCK_ITEMS: ${itemType}[] = ${mockRowsLiteral(input.model!)};` : '';
  const declaraciones = [modelo, mock].filter(Boolean).join('\n\n');

  /*
    `OnPush` se declara SOLO en Angular 21.

    Es la única diferencia de código real entre las dos versiones que este
    emisor produce: en Angular 22 pasó a ser el valor por defecto de todo
    componente nuevo, así que escribirlo sería ruido; en 21 hay que pedirlo, y
    no pedirlo dejaría un componente de señales revisándose entero en cada
    ciclo. Todo lo demás que usamos —standalone implícito, señales, `input()`,
    `output()` y el control de flujo `@if`/`@for`— es idéntico en las dos.
  */
  return {
    nombre,
    selector: selectorDe(nombre),
    imports: `import { ${desdeCore.join(', ')} } from '@angular/core';`,
    modelo,
    mock,
    declaraciones,
    plantilla: [`    <div class="${ROOT_LAYOUT}">`, body, '    </div>'].join('\n'),
    cuerpoClase,
    onPush: version === 21,
  };
}

function emitAngular(input: EmitInput, version: AngularVersion): string {
  const p = piezasAngular(input, version);
  if (!p) return EMPTY_COMPONENT;

  const opciones = [
    `  selector: '${p.selector}',`,
    ...(p.onPush ? ['  changeDetection: ChangeDetectionStrategy.OnPush,'] : []),
    '  template: `',
    p.plantilla,
    '  `,',
  ];

  return `${p.imports}\n\n`
    + (p.declaraciones ? `${p.declaraciones}\n\n` : '')
    + `@Component({\n${opciones.join('\n')}\n})\n`
    + `export class ${p.nombre} {\n${p.cuerpoClase}\n}\n`;
}

/** `TablaCatalogo` → `vz-tabla-catalogo`, que es la convención de selector. */
function selectorDe(nombre: string): string {
  const guiones = nombre
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  return `vz-${guiones}`;
}

/** Sangra un bloque de código al nivel de los miembros de la clase. */
function reindentar(codigo: string): string {
  return codigo.split('\n').map((l) => (l.trim() ? `  ${l}` : '')).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Traducción de expresiones
//
// Se recorre el código distinguiendo las zonas de cadena de las de código, igual
// que en el emisor de Vue y por el mismo motivo: los `className` calculados son
// literales de plantilla, y un reemplazo global tocaría también el texto
// entrecomillado, que no es código.
// ─────────────────────────────────────────────────────────────────────────────

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/** Dónde acaba la expresión: la plantilla lee señales, la clase también. */
type Destino = 'plantilla' | 'clase';

/**
 * Cómo se nombra un miembro del componente según dónde se lea.
 *
 * En la plantilla, por su nombre: Angular resuelve contra la instancia. Dentro
 * de un método hay que escribir `this.`, y olvidarlo no da un aviso sino un
 * error de compilación —o algo peor, si existe una variable local con ese
 * nombre. Es la diferencia que separa los dos destinos.
 */
function miembro(nombre: string, destino: Destino): string {
  return destino === 'clase' ? `this.${nombre}` : nombre;
}

/**
 * Traduce una expresión de React a Angular.
 *
 * El destino no cambia cómo se leen las señales —llamándolas, en los dos
 * sitios— pero sí cómo se nombran (`this.` dentro de la clase) y qué se puede
 * usar: en un método hay TypeScript completo y las llamadas globales se
 * conservan; en la plantilla no existen, y quien emita una tiene que haberla
 * eliminado antes.
 */
function traducir(code: string, ctx: NgCtx, destino: Destino): string {
  let out = '';
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    if (ch === "'" || ch === '"') {
      const end = saltarCadena(code, i, ch);
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '`') {
      const { text, end } = literalAConcatenacion(code, i, ctx, destino);
      out += text;
      i = end;
      continue;
    }

    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < code.length && IDENT_PART.test(code[j])) j++;
      const ident = code.slice(i, j);

      // Acceso a propiedad (`e.target`): el nombre no es una variable nuestra.
      if (ultimoNoEspacio(out) === '.') {
        out += ident;
        i = j;
        continue;
      }

      // `setX(...)` → `x.set(...)` o `x.update(...)`.
      const destinoSetter = ctx.setters.get(ident);
      if (destinoSetter && siguienteNoEspacio(code, j) === '(') {
        const llamada = leerLlamada(code, code.indexOf('(', j));
        out += traducirSetter(destinoSetter, llamada.arg, ctx, destino);
        i = llamada.end;
        continue;
      }

      // `onX?.(arg)` → `onX.emit(arg)`; sin argumento, `emit()`.
      if (ctx.callbacks.has(ident)) {
        const abre = code.indexOf('(', j);
        if (abre !== -1 && code.slice(j, abre).trim() === '?.') {
          const llamada = leerLlamada(code, abre);
          const arg = llamada.arg.trim();
          out += `${miembro(ident, destino)}.emit(${arg ? traducir(arg, ctx, destino) : ''})`;
          i = llamada.end;
          continue;
        }
      }

      // Una señal se LEE llamándola. También la colección, que es un `input()`.
      if (ctx.signals.has(ident) || ident === ITEMS_PROP) {
        out += `${miembro(ident, destino)}()`;
        i = j;
        continue;
      }

      // Los validadores acabaron siendo métodos de la clase, así que llamarlos
      // desde otro método también pasa por `this.`.
      out += ctx.helpers.has(ident) ? miembro(ident, destino) : ident;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * `setX(v)` → `x.set(v)`; `setX((n) => n + 1)` → `x.update((n) => n + 1)`.
 *
 * La forma funcional se conserva tal cual en vez de resolverse, porque `update`
 * es exactamente eso: recibe el valor previo y devuelve el nuevo. En Vue había
 * que deshacerla —allí no existe el «valor previo» como argumento— y aquí sería
 * el error contrario.
 */
function traducirSetter(target: string, arg: string, ctx: NgCtx, destino: Destino): string {
  const senal = miembro(target, destino);
  const funcional = /^\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*([\s\S]+)$/.exec(arg.trim());
  if (funcional) {
    const [, previo, expresion] = funcional;
    // El parámetro es un valor corriente dentro del `update`, no una señal: se
    // traduce el resto de la expresión pero él se deja como está.
    const sinSenal: NgCtx = { ...ctx, signals: new Set([...ctx.signals].filter((s) => s !== previo)) };
    return `${senal}.update((${previo}) => ${traducir(expresion, sinSenal, destino)})`;
  }
  return `${senal}.set(${traducir(arg, ctx, destino)})`;
}

/**
 * Literal de plantilla → concatenación.
 *
 * Angular admite literales de plantilla en sus expresiones desde hace poco, pero
 * la concatenación vale en todas las versiones que este emisor declara soportar
 * y no cuesta nada. Los trozos de texto vacíos se descartan para que el
 * resultado se pueda leer.
 */
function literalAConcatenacion(
  code: string,
  start: number,
  ctx: NgCtx,
  destino: Destino,
): { text: string; end: number } {
  const partes: string[] = [];
  let texto = '';
  let i = start + 1;

  while (i < code.length) {
    if (code[i] === '\\') { texto += code.slice(i, i + 2); i += 2; continue; }
    if (code[i] === '`') {
      if (texto) partes.push(JSON.stringify(texto));
      i += 1;
      break;
    }
    if (code[i] === '$' && code[i + 1] === '{') {
      if (texto) { partes.push(JSON.stringify(texto)); texto = ''; }
      const fin = cerrarLlave(code, i + 1);
      partes.push(`(${traducir(code.slice(i + 2, fin), ctx, destino)})`);
      i = fin + 1;
      continue;
    }
    texto += code[i];
    i += 1;
  }

  return { text: partes.length > 0 ? partes.join(' + ') : "''", end: i };
}

/** Fin de una cadena entrecomillada, respetando los escapes. */
function saltarCadena(code: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === quote) return i + 1;
    i++;
  }
  return code.length;
}

/** Índice de la llave que cierra la abierta en `start`. */
function cerrarLlave(code: string, start: number): number {
  let nivel = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === '{') nivel++;
    else if (code[i] === '}' && --nivel === 0) return i;
  }
  return code.length;
}

/** Argumento y fin de la llamada que abre en `start`. */
function leerLlamada(code: string, start: number): { arg: string; end: number } {
  let nivel = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === '(') nivel++;
    else if (code[i] === ')' && --nivel === 0) {
      return { arg: code.slice(start + 1, i), end: i + 1 };
    }
  }
  return { arg: '', end: code.length };
}

function ultimoNoEspacio(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) if (!/\s/.test(s[i])) return s[i];
  return '';
}

function siguienteNoEspacio(code: string, from: number): string {
  for (let i = from; i < code.length; i++) if (!/\s/.test(code[i])) return code[i];
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Emisión de la plantilla
// ─────────────────────────────────────────────────────────────────────────────

const sangria = (nivel: number) => '  '.repeat(nivel);

/** Atributo de JSX → atributo de plantilla Angular. */
const NOMBRES_ATRIBUTO: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  fillRule: 'fill-rule',
  clipRule: 'clip-rule',
  strokeDasharray: 'stroke-dasharray',
};

/** Evento de JSX → evento de plantilla Angular. */
const EVENTOS: Record<string, string> = {
  onClick: 'click',
  onChange: 'change',
  onInput: 'input',
  onSubmit: 'submit',
  onBlur: 'blur',
  onFocus: 'focus',
  onMouseEnter: 'mouseenter',
  onMouseLeave: 'mouseleave',
  onDoubleClick: 'dblclick',
};

const NOMBRES_METODO: Record<string, string> = {
  click: 'alPulsar',
  change: 'alCambiar',
  input: 'alEscribir',
  submit: 'alEnviar',
  blur: 'alSalir',
  focus: 'alEntrar',
  mouseenter: 'alPasarRaton',
  mouseleave: 'alRetirarRaton',
  dblclick: 'alDobleClic',
};

/**
 * Cuerpo de una función flecha, descartando su lista de parámetros.
 *
 * Los paréntesis se emparejan contando, y no con una expresión regular, porque
 * el parámetro puede llevar los suyos dentro: el manejador de un envío se tipa
 * como `(e: { preventDefault: () => void }) => …`, y un `[^)]*` se para en el
 * primer cierre y parte la función por la mitad. El síntoma era un método que
 * empezaba por `void }) => {`, que ni siquiera es TypeScript.
 */
function partirArrow(code: string): string {
  if (!code.startsWith('(')) {
    const flecha = code.indexOf('=>');
    return flecha === -1 ? code : code.slice(flecha + 2).trim();
  }

  let nivel = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '(') nivel++;
    else if (code[i] === ')' && --nivel === 0) {
      const resto = code.slice(i + 1).trim();
      return resto.startsWith('=>') ? resto.slice(2).trim() : resto;
    }
  }
  return code;
}

/** Nombre libre para un método, sin pisar los del usuario. */
function reservar(base: string, ctx: NgCtx): string {
  let nombre = base;
  let n = 2;
  while (ctx.taken.has(nombre)) nombre = `${base}${n++}`;
  ctx.taken.add(nombre);
  return nombre;
}

/** Tipo del elemento del modelo dentro del contexto, si lo hay. */
function itemTypeOfCtx(ctx: NgCtx): string | null {
  const modelo = ctx.schema.model;
  if (!modelo || !modelo.name.trim()) return null;
  return toComponentName(modelo.name);
}

/**
 * Manejador → método de la clase, y la llamada que lo invoca desde la plantilla.
 *
 * SIEMPRE se extrae, aunque el cuerpo quepa en una línea. En Angular una
 * expresión de plantilla no puede llamar a `Number` ni a `String`, y el esquema
 * las emite con toda naturalidad porque para React son JavaScript corriente;
 * dejar el cuerpo en el atributo obligaría a decidir caso por caso si esta vez
 * cabe, que es el tipo de decisión que acaba fallando en el bloque número
 * ochenta. Además, llamar a un método es lo que hace un componente Angular
 * normal, así que la regla segura coincide aquí con la idiomática.
 */
function extraerManejador(evento: string, attr: Attr & { kind: 'event' }, ctx: NgCtx): string {
  let cuerpo = partirArrow(attr.code.trim());
  if (cuerpo.startsWith('{')) cuerpo = cuerpo.slice(1, cuerpo.lastIndexOf('}')).trim();

  /*
    Del evento solo interesa el valor, y eso es lo que se le pasa al método.

    Antes viajaba el `$event` entero con el parámetro tipado a mano como
    `{ target: { value: string; checked: boolean } }`, que era la traducción
    literal de lo que hace React. En Angular no compila: con `strictTemplates`
    —lo normal en un proyecto nuevo— `$event` es un `Event` y su `target` es
    `EventTarget | null`, así que asignarlo a esa forma es un error de tipos. Y
    el stub de la verificación no lo cazaba porque no tipa `$event`.

    Pasar el valor es además lo idiomático: el método queda con la firma que de
    verdad necesita (`string` o `boolean`) y el componente sigue sin importar
    nada del DOM.
  */
  const usaChecked = /\be\.target\.checked\b/.test(cuerpo);
  const usaValor = /\be\.target\.value\b/.test(cuerpo);
  const usaEvento = usaChecked || usaValor;
  const propiedad = usaChecked ? 'checked' : 'value';
  const tipoValor = usaChecked ? 'boolean' : 'string';
  const PARAM_VALOR = 'valor';
  if (usaEvento) {
    cuerpo = cuerpo.replace(/\be\.target\.(value|checked)\b/g, PARAM_VALOR);
  }
  /*
    `preventDefault` sale del método y pasa a la plantilla.

    Estaba escrito que sobraba, porque Angular cortaría el envío del formulario
    salvo que el manejador devolviese `true`. No es así: Angular solo llama a
    `preventDefault()` cuando el manejador devuelve **`false`**, y un método
    `void` devuelve `undefined`. El resultado era un formulario que al enviarse
    recargaba la página —se veía en cuanto la vista previa empezó a ejecutar
    Angular de verdad, no antes, porque la verificación compila la clase y no la
    plantilla—. Quitarlo del método sigue siendo lo correcto: así la clase no
    tiene que tipar un evento del DOM. Lo que hacía falta era ponerlo donde el
    evento sí existe, que es la plantilla, con el `$event` que Angular da ahí.
  */
  const cortaPorDefecto = /[A-Za-z_$][\w$]*\.preventDefault\s*\(\s*\)/.test(cuerpo);
  cuerpo = cuerpo.replace(/[A-Za-z_$][\w$]*\.preventDefault\s*\(\s*\)\s*;?/g, '').trim();

  const usaItem = new RegExp(`\\b${ITEM_PARAM}\\b`).test(cuerpo);
  const traducido = traducir(cuerpo, ctx, 'clase');

  const params: string[] = [];
  const argumentos: string[] = [];
  if (usaEvento) {
    params.push(`${PARAM_VALOR}: ${tipoValor}`);
    // `$any` porque `EventTarget` no declara `value` ni `checked`: es la vía que
    // la propia documentación de Angular da para leerlos sin castear a mano el
    // tipo concreto del elemento en cada plantilla.
    argumentos.push(`$any($event.target).${propiedad}`);
  }
  if (usaItem) {
    params.push(`${ITEM_PARAM}: ${itemTypeOfCtx(ctx) ?? 'unknown'}`);
    argumentos.push(ITEM_PARAM);
  }

  const nombre = reservar(NOMBRES_METODO[evento] ?? 'alEvento', ctx);
  const lineas = traducido
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // El manejador de una sola sentencia venía sin punto y coma, porque en React
    // era el cuerpo de una función flecha. Como método ya no lo es.
    .map((l) => `    ${l}${/[;{}]$/.test(l) ? '' : ';'}`)
    .join('\n');
  ctx.methods.push(`  ${nombre}(${params.join(', ')}) {\n${lineas}\n  }`);

  // Una sentencia de plantilla admite varias separadas por `;`, así que el corte
  // del comportamiento por defecto va delante de la llamada al método.
  const llamada = `${nombre}(${argumentos.join(', ')})`;
  return cortaPorDefecto ? `$event.preventDefault(); ${llamada}` : llamada;
}

/** Comillas dobles dentro de un atributo de plantilla. */
function escapar(valor: string): string {
  return valor.split('"').join('&quot;');
}

/**
 * Eventos de campo: React normaliza `onChange` al teclear, Angular no.
 *
 * Es la misma regla que aplica el emisor de Vue, y por el mismo motivo: traducir
 * `onChange` a `(change)` en un campo de texto cambia el comportamiento, porque
 * Angular solo lo dispara al salir del campo. Un buscador que filtra mientras
 * escribes en React pasaba a filtrar al perder el foco en Angular: el mismo
 * árbol de bloques, dos componentes distintos. En `select` y en las casillas
 * `change` sí es el evento correcto en los dos.
 */
function eventoDeCampo(tag: string, evento: string, attrs: Record<string, Attr>): string {
  if (evento !== 'change') return evento;
  if (tag === 'select') return 'change';
  if (tag === 'textarea') return 'input';
  if (tag === 'input') {
    const type = attrs.type;
    const value = type?.kind === 'static' ? type.value : '';
    return value === 'checkbox' || value === 'radio' || value === 'file' || value === 'range'
      ? 'change'
      : 'input';
  }
  return evento;
}

function emitAttrs(node: Extract<UiNode, { kind: 'el' }>, ctx: NgCtx): string {
  const partes: string[] = [];

  for (const [nombre, attr] of Object.entries(node.attrs)) {
    if (attr.kind === 'event') {
      const base = EVENTOS[nombre];
      if (!base) continue;
      const evento = eventoDeCampo(node.tag, base, node.attrs);
      partes.push(`(${evento})="${escapar(extraerManejador(evento, attr, ctx))}"`);
      continue;
    }

    const destino = NOMBRES_ATRIBUTO[nombre] ?? nombre;
    if (attr.kind === 'static') {
      partes.push(`${destino}="${escapar(attr.value)}"`);
      continue;
    }
    /*
      Expresión: enlace por corchetes, que es como Angular ata un valor vivo.

      Se desenvuelve igual que la interpolación. `String` no existe dentro de una
      plantilla de Angular, así que un `[src]="String(item.foto ?? '')"` no es
      «feo pero funciona»: no compila. Lo hacía la interpolación y no el
      atributo, y el fallo solo aparecía al enlazar una imagen a un campo.
    */
    partes.push(`[${destino}]="${escapar(traducir(desenvolver(attr.code), ctx, 'plantilla'))}"`);
  }

  return partes.length > 0 ? ` ${partes.join(' ')}` : '';
}

/**
 * Quita el envoltorio `String(…)` que React necesitaba.
 *
 * La interpolación de Angular ya convierte a texto y pinta vacío lo que sea
 * nulo, así que el envoltorio sobra —y además no compilaría, porque `String` no
 * existe dentro de una plantilla.
 *
 * Se buscaba solo la forma `String(x ?? '')`, que es la del valor de un campo
 * del modelo. El valor de una variable de estado sale del esquema como
 * `String(x)` a secas, y esa se colaba entera: `{{ String(cantidad()) }}`
 * pasaba la verificación —que compila la clase, no la plantilla— y reventaba
 * al renderizar con «String is not a function». Ahora se desenvuelve cualquier
 * conversión que ocupe la expresión completa, y el `?? ''` se quita después si
 * estaba.
 */
function desenvolver(code: string): string {
  const limpio = code.trim();
  const dentro = argumentoDeString(limpio);
  if (dentro === null) return limpio;
  const m = /^([\s\S]+?)\s*\?\?\s*(''|"")$/.exec(dentro);
  return (m ? m[1] : dentro).trim();
}

/**
 * El argumento de `String(…)` cuando la llamada ES toda la expresión.
 *
 * Hay que comprobar que el paréntesis final cierra el de `String(` y no el de
 * una subexpresión: en `String(a) + String(b)` el texto también empieza por
 * `String(` y acaba en `)`, pero ahí no hay ningún envoltorio que quitar. Las
 * comillas se saltan para que un paréntesis dentro de un literal no descuadre
 * la cuenta.
 */
function argumentoDeString(code: string): string | null {
  const ABRE = 'String(';
  if (!code.startsWith(ABRE) || !code.endsWith(')')) return null;

  let nivel = 1;
  let comilla = '';
  for (let i = ABRE.length; i < code.length; i++) {
    const c = code[i];
    if (comilla) {
      if (c === '\\') i++;
      else if (c === comilla) comilla = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') comilla = c;
    else if (c === '(') nivel++;
    else if (c === ')' && --nivel === 0) {
      return i === code.length - 1 ? code.slice(ABRE.length, i) : null;
    }
  }
  return null;
}

function emitNode(node: UiNode, ctx: NgCtx, nivel: number, childIds: string[] = []): string {
  const pad = sangria(nivel);

  switch (node.kind) {
    case 'text':
      return node.value ? `${pad}${node.value}` : '';

    case 'expr':
      return `${pad}{{ ${traducir(desenvolver(node.code), ctx, 'plantilla')} }}`;

    case 'slot':
      return childIds
        .map((id) => {
          const child = ctx.blocks[id];
          return child ? emitNode(buildNode(child, ctx.schema), ctx, nivel, child.children) : '';
        })
        .filter(Boolean)
        .join('\n');

    /*
      Control de flujo integrado: `@if` y `@for`, no `*ngIf` ni `*ngFor`.

      Es la forma recomendada desde Angular 17 y la única que no obliga a
      importar `CommonModule`, que es justo lo que un componente autocontenido no
      debería tener que pedirle a quien lo integra.
    */
    case 'when': {
      const test = traducir(node.test, ctx, 'plantilla');
      const dentro = node.children
        .map((c) => emitNode(c, ctx, nivel + 1, childIds))
        .filter(Boolean)
        .join('\n');
      return `${pad}@if (${test}) {\n${dentro}\n${pad}}`;
    }

    case 'list': {
      const anterior = ctx.enRepetidor;
      ctx.enRepetidor = true;
      const dentro = emitNode(node.item, ctx, nivel + 1, childIds);
      ctx.enRepetidor = anterior;
      // `track` es obligatorio en `@for`. Con el `id` del modelo cuando lo hay;
      // `$index` es el criterio honesto mientras no lo declare.
      const track = node.keyField ? `${ITEM_PARAM}.${node.keyField}` : '$index';
      return `${pad}@for (${ITEM_PARAM} of ${traducir(node.code, ctx, 'plantilla')}; track ${track}) {\n`
        + `${dentro}\n${pad}}`;
    }

    case 'el': {
      const attrs = emitAttrs(node, ctx);
      if (VOID_TAGS.has(node.tag)) return `${pad}<${node.tag}${attrs} />`;

      const hijos = node.children
        .map((c) => emitNode(c, ctx, nivel + 1, childIds))
        .filter(Boolean)
        .join('\n');

      if (!hijos) return `${pad}<${node.tag}${attrs}></${node.tag}>`;
      // Un solo hijo de texto se queda en la misma línea, como se escribiría.
      if (node.children.length === 1 && node.children[0].kind === 'text') {
        return `${pad}<${node.tag}${attrs}>${hijos.trim()}</${node.tag}>`;
      }
      return `${pad}<${node.tag}${attrs}>\n${hijos}\n${pad}</${node.tag}>`;
    }
  }
}
