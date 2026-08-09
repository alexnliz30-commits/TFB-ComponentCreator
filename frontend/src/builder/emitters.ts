/**
 * Registro de emisores de código.
 *
 * El builder visual emite React hoy. Añadir Vue 3, Vue 2 o Angular consiste en
 * implementar `CodeEmitter` sobre la misma IR y registrarlo aquí: ni el esquema
 * de bloques ni el lienzo se tocan.
 *
 * Nota: el harness `TsxCompilationChecker` y la previsualización en sandbox solo
 * cubren React + TS. Un emisor con `verifiable: false` se exporta sin verificar,
 * y la interfaz debe decirlo en vez de aparentar que compila (misma semántica
 * que el campo `verified` de la API de generación).
 */

import { reactEmitter, reactJsEmitter, type CodeEmitter, type EmitInput } from './emit-react';
import { vue2Emitter, vue2JsEmitter, vueEmitter, vueJsEmitter } from './emit-vue';
import { angular21Emitter, angular22Emitter } from './emit-angular';
import type { BuilderState } from './types';

export type { CodeEmitter, EmitInput };

/**
 * Los ocho destinos, todos sobre la misma IR.
 *
 * React, Vue 3 y Vue 2 en los dos lenguajes; Angular solo en TypeScript, porque
 * sus decoradores no son JavaScript estándar y la invariante ya vivía en el
 * dominio del backend.
 *
 * Las claves de los históricos (`react`, `vue3`) se conservan porque son las que
 * llevan escritas los proyectos ya guardados; añadirles el lenguaje los habría
 * dejado apuntando a un emisor inexistente.
 */
export const EMITTERS: Record<string, CodeEmitter> = {
  [reactEmitter.key]: reactEmitter,
  [reactJsEmitter.key]: reactJsEmitter,
  [vueEmitter.key]: vueEmitter,
  [vueJsEmitter.key]: vueJsEmitter,
  [vue2Emitter.key]: vue2Emitter,
  [vue2JsEmitter.key]: vue2JsEmitter,
  [angular22Emitter.key]: angular22Emitter,
  [angular21Emitter.key]: angular21Emitter,
};

export const DEFAULT_FRAMEWORK = reactEmitter.key;

export function getEmitter(framework: string): CodeEmitter {
  return EMITTERS[framework] ?? reactEmitter;
}

export function availableEmitters(): CodeEmitter[] {
  return Object.values(EMITTERS);
}

/**
 * Código vigente del lienzo: el editado a mano si lo hay, o el emitido desde el
 * árbol de bloques. Centralizado porque lo consumen el editor, el chat de IA y
 * la exportación, y antes cada uno repetía la misma expresión.
 */
export function currentCode(state: BuilderState): string {
  if (state.codeOverride !== null) return state.codeOverride;
  return getEmitter(state.framework).emit({
    blocks: state.blocks,
    rootIds: state.rootIds,
    vars: state.stateVars,
    model: state.model,
    callbacks: state.callbacks,
    // El nombre solo lo usan los destinos cuyo artefacto lo lleva dentro (la
    // clase de Angular); los demás lo ignoran.
    name: state.componentName,
    // El lenguaje no se pasa: lo pone el propio emisor, que es quien lo define.
    // Dejarlo aquí abriría la puerta a pedirle JSX al emisor de TypeScript.
  });
}
