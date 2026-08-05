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

import { reactEmitter, type CodeEmitter, type EmitInput } from './emit-react';
import { vueEmitter } from './emit-vue';
import type { BuilderState } from './types';

export type { CodeEmitter, EmitInput };

export const EMITTERS: Record<string, CodeEmitter> = {
  [reactEmitter.key]: reactEmitter,
  [vueEmitter.key]: vueEmitter,
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
  });
}
