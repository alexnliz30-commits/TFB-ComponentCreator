/**
 * Emisor de Vue 3 (SFC con `<script setup>`) a partir de la misma IR.
 *
 * Es la prueba de que el registro de emisores era pluggable de verdad: el
 * esquema de los 85 bloques, el lienzo y el modelo de acciones no se tocan.
 *
 * Lo que sí hay que traducir
 * --------------------------
 * La IR es agnóstica en estructura pero no en el *código* que transporta: los
 * atributos dinámicos y los manejadores se escribieron para React, con setters
 * (`setAbierto(...)`) y nombres de evento de JSX. Aquí viven las tres únicas
 * reglas que hacen falta para llevarlo a Vue:
 *
 *   1. **Setters → asignación.** `setX(v)` pasa a `x = v`, y la forma funcional
 *      `setX((n) => n + 1)` a `x = x + 1`. Los nombres de setter no se adivinan:
 *      salen de las variables de estado, así que el conjunto es cerrado.
 *   2. **`.value` solo en el script.** En la plantilla los `ref` se desenvuelven
 *      solos; dentro de `<script setup>` no. La misma expresión necesita las dos
 *      formas, de ahí que la traducción sepa en cuál de los dos sitios va.
 *   3. **Nombres de atributo.** `className` → `class`, `onClick` → `@click`, y
 *      los atributos SVG camelCase de JSX a su forma con guiones.
 *
 * La sustitución se hace con un recorrido que distingue código de cadenas —no
 * con un `replace` global— porque los `className` calculados son literales de
 * plantilla: un reemplazo ciego tocaría también el texto entrecomillado.
 */

import type { BuilderBlock } from './types';
import { initialLiteral, setterName } from './actions';
import { buildNode, collectImplicitVars, type SchemaCtx } from './schema';
import { VOID_TAGS, type Attr, type UiNode } from './ui-node';
import { ROOT_LAYOUT, analyzeStateUsage, type CodeEmitter, type EmitInput } from './emit-react';

const EMPTY_COMPONENT =
  '<template>\n  <div class="p-4 text-slate-400">Vacío</div>\n</template>\n';

export const vueEmitter: CodeEmitter = {
  key: 'vue3',
  label: 'Vue 3 + TypeScript',
  extension: 'vue',
  language: 'vue',
  // El harness KR1 (`tsc --noEmit`) y el sandbox de Babel solo saben de React+TS.
  // Un SFC se exporta sin verificación de compilación, y la interfaz lo dice.
  verifiable: false,
  emit(input) {
    if (input.rootIds.length === 0) return EMPTY_COMPONENT;
    return emitSfc(input);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Contexto de la emisión
// ─────────────────────────────────────────────────────────────────────────────

interface VueCtx {
  blocks: Record<string, BuilderBlock>;
  /** El mismo contexto de esquema para toda la emisión, como en el emisor React. */
  schema: SchemaCtx;
  /** Nombres de las variables de estado; son los `ref` del componente. */
  refs: Set<string>;
  /** Setter → variable, para deshacer las llamadas de React. */
  setters: Map<string, string>;
  /** Funciones auxiliares (validadores) recogidas del esquema. */
  helpers: Map<string, string>;
  /** Manejadores extraídos al script porque no caben en la plantilla. */
  handlers: string[];
  /** Identificadores ya ocupados, para no pisar los del usuario. */
  taken: Set<string>;
}

function emitSfc(input: EmitInput): string {
  const { blocks, rootIds, vars } = input;
  const { usedVars } = analyzeStateUsage(blocks, rootIds, vars);
  const implicitVars = collectImplicitVars(blocks, rootIds, vars);
  const allVars = [...usedVars, ...implicitVars];

  const helpers = new Map<string, string>();
  const schema: SchemaCtx = {
    vars,
    blocks,
    collectHelper: (name, code) => {
      if (!helpers.has(name)) helpers.set(name, code);
    },
  };

  const ctx: VueCtx = {
    blocks,
    schema,
    refs: new Set(allVars.map((v) => v.name)),
    setters: new Map(allVars.map((v) => [setterName(v.name), v.name])),
    helpers,
    handlers: [],
    taken: new Set(allVars.flatMap((v) => [v.name, setterName(v.name)])),
  };

  const body = rootIds
    .map((id) => {
      const block = blocks[id];
      return block ? emitNode(buildNode(block, schema), ctx, 2, block.children) : '';
    })
    .filter(Boolean)
    .join('\n');

  const template = `<template>\n  <div class="${ROOT_LAYOUT}">\n${body}\n  </div>\n</template>\n`;

  // El script se compone al final: los validadores y los manejadores solo se
  // conocen tras recorrer el árbol, que es quien los solicita.
  const declarations = allVars.map((v) => `const ${v.name} = ref(${initialLiteral(v)});`);
  const parts = [
    [...ctx.helpers.values()].join('\n\n'),
    declarations.join('\n'),
    ctx.handlers.join('\n\n'),
  ].filter((part) => part.length > 0);

  if (parts.length === 0) return template;

  const script = `<script setup lang="ts">\nimport { ref } from 'vue';\n\n${parts.join('\n\n')}\n</script>\n`;
  return `${script}\n${template}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Traducción de expresiones
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'template' | 'script';

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * Traduce una expresión de React a Vue.
 *
 * Recorre el código distinguiendo las zonas de código de las de cadena: los
 * `className` calculados son literales de plantilla, y un reemplazo global
 * también tocaría el texto entrecomillado, que no es código.
 *
 * `param` es el nombre del parámetro del manejador original; en la plantilla se
 * sustituye por `$event`, y en el script se conserva.
 */
function translate(code: string, ctx: VueCtx, mode: Mode, param?: string | null): string {
  let out = '';
  let i = 0;

  const suffix = mode === 'script' ? '.value' : '';

  while (i < code.length) {
    const ch = code[i];

    // Cadenas: se copian tal cual, salvo las interpolaciones de una plantilla.
    if (ch === "'" || ch === '"') {
      const end = skipQuoted(code, i, ch);
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '`') {
      const { text, end } = translateTemplateLiteral(code, i, ctx, mode, param);
      out += text;
      i = end;
      continue;
    }

    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < code.length && IDENT_PART.test(code[j])) j++;
      const ident = code.slice(i, j);

      // Acceso a propiedad (`e.target`): el nombre no es una variable nuestra.
      const prevChar = lastNonSpace(out);
      if (prevChar === '.') {
        out += ident;
        i = j;
        continue;
      }

      const target = ctx.setters.get(ident);
      if (target && nextNonSpace(code, j) === '(') {
        const call = readCall(code, code.indexOf('(', j));
        out += translateSetterCall(target, call.arg, ctx, mode, param);
        i = call.end;
        continue;
      }

      if (param && ident === param) {
        out += mode === 'template' ? '$event' : ident;
        i = j;
        continue;
      }

      out += ident + (ctx.refs.has(ident) ? suffix : '');
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/** Fin de una cadena entrecomillada, respetando los escapes. */
function skipQuoted(code: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === quote) return i + 1;
    i++;
  }
  return code.length;
}

/**
 * Literal de plantilla: el texto se copia y solo se traduce lo que hay dentro
 * de cada `${…}`, que es la única parte que es código.
 */
function translateTemplateLiteral(
  code: string,
  start: number,
  ctx: VueCtx,
  mode: Mode,
  param?: string | null,
): { text: string; end: number } {
  let out = '`';
  let i = start + 1;

  while (i < code.length) {
    if (code[i] === '\\') { out += code.slice(i, i + 2); i += 2; continue; }
    if (code[i] === '`') return { text: out + '`', end: i + 1 };

    if (code[i] === '$' && code[i + 1] === '{') {
      const end = matchBrace(code, i + 1);
      out += '${' + translate(code.slice(i + 2, end), ctx, mode, param) + '}';
      i = end + 1;
      continue;
    }

    out += code[i];
    i++;
  }

  return { text: out, end: i };
}

/** Índice de la llave que cierra la que abre en `open`. */
function matchBrace(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i;
  }
  return code.length;
}

/** Argumento y final de una llamada cuyo paréntesis abre en `open`. */
function readCall(code: string, open: number): { arg: string; end: number } {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) {
      return { arg: code.slice(open + 1, i), end: i + 1 };
    }
  }
  return { arg: '', end: code.length };
}

/**
 * `setX(arg)` → `x = arg`.
 *
 * La forma funcional de React (`setX((n) => n + 1)`) se resuelve sustituyendo el
 * parámetro por la propia variable: en Vue no existe el «valor previo» como
 * argumento porque el `ref` ya lo es.
 */
function translateSetterCall(
  target: string,
  arg: string,
  ctx: VueCtx,
  mode: Mode,
  param?: string | null,
): string {
  const ref = target + (mode === 'script' ? '.value' : '');
  const functional = /^\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*=>\s*([\s\S]+)$/.exec(arg.trim());

  if (functional) {
    const [, previous, expression] = functional;
    // El parámetro pasa a ser la variable misma antes de traducir, para que la
    // sustitución de `.value` lo alcance igual que a cualquier otra aparición.
    const replaced = renameIdentifier(expression, previous, target);
    return `${ref} = ${translate(replaced, ctx, mode, param)}`;
  }

  return `${ref} = ${translate(arg, ctx, mode, param)}`;
}

/** Renombra un identificador respetando cadenas y accesos a propiedad. */
function renameIdentifier(code: string, from: string, to: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'" || ch === '"') {
      const end = skipQuoted(code, i, ch);
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < code.length && IDENT_PART.test(code[j])) j++;
      const ident = code.slice(i, j);
      out += ident === from && lastNonSpace(out) !== '.' ? to : ident;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function lastNonSpace(text: string): string {
  for (let i = text.length - 1; i >= 0; i--) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return '';
}

function nextNonSpace(code: string, from: number): string {
  for (let i = from; i < code.length; i++) {
    if (!/\s/.test(code[i])) return code[i];
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejadores
// ─────────────────────────────────────────────────────────────────────────────

interface Handler {
  /** Parámetro del manejador original, si lo tenía. */
  param: string | null;
  body: string;
  /** `true` si el cuerpo era un bloque `{ … }` y no una única expresión. */
  block: boolean;
}

/** Descompone `(e: T) => …` en parámetro y cuerpo. */
function parseHandler(code: string): Handler | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith('(')) return null;

  const close = readCall(trimmed, 0).end;
  const arrow = trimmed.slice(close).trimStart();
  if (!arrow.startsWith('=>')) return null;

  const params = trimmed.slice(1, close - 1).trim();
  // El tipo estructural del parámetro no viaja a Vue: la plantilla usa `$event`.
  const param = params ? params.split(':')[0].trim() || null : null;

  let body = arrow.slice(2).trim();
  const block = body.startsWith('{');
  if (block) body = body.slice(1, body.lastIndexOf('}')).trim();

  return { param, body, block };
}

/**
 * Un manejador con declaraciones locales o control de flujo no cabe en un
 * atributo de plantilla: sale al script como función con nombre.
 */
function needsFunction(body: string): boolean {
  return /\bconst\b|\blet\b|\bif\b|\breturn\b/.test(body);
}

const HANDLER_NAMES: Record<string, string> = {
  click: 'manejarClic',
  submit: 'manejarEnvio',
  change: 'manejarCambio',
  input: 'manejarEntrada',
  blur: 'manejarSalida',
  focus: 'manejarFoco',
  mouseenter: 'manejarEntradaRaton',
  mouseleave: 'manejarSalidaRaton',
  dblclick: 'manejarDobleClic',
};

function reserveName(base: string, taken: Set<string>): string {
  let name = base;
  let n = 2;
  while (taken.has(name)) name = `${base}${n++}`;
  taken.add(name);
  return name;
}

/**
 * Traduce un manejador al par «nombre de atributo, valor».
 *
 * `preventDefault` desaparece del cuerpo y se convierte en el modificador
 * `.prevent`, que es como Vue expresa lo mismo sin tocar el evento a mano.
 */
function emitHandler(event: string, attr: Attr & { kind: 'event' }, ctx: VueCtx): [string, string] {
  const parsed = parseHandler(attr.code);
  const raw = parsed?.body ?? attr.code;

  const prevents = /\bpreventDefault\s*\(\s*\)/.test(raw);
  const body = raw
    .replace(/[A-Za-z_$][A-Za-z0-9_$]*\.preventDefault\s*\(\s*\)\s*;?/g, '')
    .trim();

  const name = `@${event}${prevents ? '.prevent' : ''}`;

  if (needsFunction(body)) {
    const fnName = reserveName(HANDLER_NAMES[event] ?? 'manejarEvento', ctx.taken);
    const translated = translate(body, ctx, 'script', parsed?.param)
      .split('\n')
      .map((line) => (line.trim() ? `  ${line.trim()}` : ''))
      .join('\n');
    ctx.handlers.push(`function ${fnName}() {\n${translated}\n}`);
    return [name, fnName];
  }

  return [name, translate(body, ctx, 'template', parsed?.param).replace(/;\s*$/, '')];
}

// ─────────────────────────────────────────────────────────────────────────────
// Atributos
// ─────────────────────────────────────────────────────────────────────────────

/** Atributo de JSX → atributo de plantilla Vue. */
const ATTR_NAMES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  fillRule: 'fill-rule',
  clipRule: 'clip-rule',
  strokeDasharray: 'stroke-dasharray',
  readOnly: 'readonly',
  autoPlay: 'autoplay',
  tabIndex: 'tabindex',
  colSpan: 'colspan',
  rowSpan: 'rowspan',
  maxLength: 'maxlength',
  // `viewBox` se queda como está: en SVG es sensible a mayúsculas y el
  // compilador de SFC preserva el nombre tal cual se escribe.
};

/** `onClick` → `click`; `null` si el atributo no es un evento. */
function eventName(attrName: string): string | null {
  if (!/^on[A-Z]/.test(attrName)) return null;
  const name = attrName.slice(2).toLowerCase();
  return name === 'doubleclick' ? 'dblclick' : name;
}

/**
 * Eventos de campo: React normaliza `onChange` al teclear, Vue no.
 *
 * Traducirlo a `@change` en un campo de texto cambiaría el comportamiento —Vue
 * lo dispara al salir del campo—, así que ahí va a `@input`. En `select` y en
 * las casillas, `change` es el evento correcto en ambos.
 */
function fieldEvent(tag: string, event: string, attrs: Record<string, Attr>): string {
  if (event !== 'change') return event;
  if (tag === 'select') return 'change';
  if (tag === 'textarea') return 'input';
  if (tag === 'input') {
    const type = attrs.type;
    const value = type?.kind === 'static' ? type.value : '';
    return value === 'checkbox' || value === 'radio' || value === 'file' || value === 'range'
      ? 'change'
      : 'input';
  }
  return event;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function emitAttrs(node: Extract<UiNode, { kind: 'el' }>, ctx: VueCtx): string {
  const out: string[] = [];

  for (const [name, attr] of Object.entries(node.attrs)) {
    const event = eventName(name);

    if (event) {
      if (attr.kind !== 'event') continue;
      const [attrName, value] = emitHandler(fieldEvent(node.tag, event, node.attrs), attr, ctx);
      out.push(`${attrName}="${escapeAttr(value)}"`);
      continue;
    }

    const vueName = ATTR_NAMES[name] ?? name;

    if (attr.kind === 'static') {
      // Atributo booleano de HTML: `controls="true"` no es lo mismo que
      // `controls` en ninguno de los dos, pero el esquema lo expresa así.
      if (attr.value === 'true' && BOOLEAN_ATTRS.has(vueName)) {
        out.push(vueName);
        continue;
      }
      out.push(`${vueName}="${escapeAttr(attr.value)}"`);
      continue;
    }

    if (attr.kind === 'expr') {
      out.push(`:${vueName}="${escapeAttr(translate(attr.code, ctx, 'template'))}"`);
    }
  }

  return out.length > 0 ? ' ' + out.join(' ') : '';
}

const BOOLEAN_ATTRS = new Set(['controls', 'disabled', 'checked', 'readonly', 'autoplay', 'loop', 'muted', 'selected']);

// ─────────────────────────────────────────────────────────────────────────────
// Nodos
// ─────────────────────────────────────────────────────────────────────────────

const indent = (level: number) => '  '.repeat(level);

/**
 * Texto seguro dentro de una plantilla Vue.
 *
 * `{{` abriría una interpolación y `<` un elemento, así que ese texto se emite
 * como literal interpolado en lugar de escaparse a mano: se lee mejor y no
 * depende de acertar con todas las entidades.
 */
function templateText(value: string): string {
  return /[<>&]|\{\{|\}\}/.test(value) ? `{{ ${JSON.stringify(value)} }}` : value;
}

function emitNode(node: UiNode, ctx: VueCtx, level: number, childIds: string[] = []): string {
  const pad = indent(level);

  switch (node.kind) {
    case 'text':
      return node.value ? `${pad}${templateText(node.value)}` : '';

    case 'expr':
      return `${pad}{{ ${translate(node.code, ctx, 'template')} }}`;

    case 'slot':
      return childIds
        .map((id) => {
          const child = ctx.blocks[id];
          return child
            ? emitNode(buildNode(child, ctx.schema), ctx, level, child.children)
            : '';
        })
        .filter(Boolean)
        .join('\n');

    case 'when': {
      const test = translate(node.test, ctx, 'template');
      const inner = node.children
        .map((c) => emitNode(c, ctx, level + 1, childIds))
        .filter(Boolean)
        .join('\n');
      if (!inner) return '';
      // `<template v-if>` no deja rastro en el DOM, así que envolver no cambia
      // el resultado aunque el condicional tenga varios hijos.
      return `${pad}<template v-if="${escapeAttr(test)}">\n${inner}\n${pad}</template>`;
    }

    case 'el': {
      const attrs = emitAttrs(node, ctx);
      const children = node.children
        .map((c) => emitNode(c, ctx, level + 1, childIds))
        .filter(Boolean);

      if (VOID_TAGS.has(node.tag)) return `${pad}<${node.tag}${attrs} />`;
      if (children.length === 0) return `${pad}<${node.tag}${attrs}></${node.tag}>`;

      const singleLine =
        children.length === 1 &&
        (node.children[0].kind === 'text' || node.children[0].kind === 'expr');

      if (singleLine) {
        return `${pad}<${node.tag}${attrs}>${children[0].trimStart()}</${node.tag}>`;
      }

      return `${pad}<${node.tag}${attrs}>\n${children.join('\n')}\n${pad}</${node.tag}>`;
    }
  }
}
