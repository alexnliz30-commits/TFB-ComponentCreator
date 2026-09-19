/**
 * Registro de emisores de código.
 *
 * El builder visual emite React hoy. Añadir Vue 3, Vue 2 o Angular consiste en
 * implementar `CodeEmitter` sobre la misma IR y registrarlo aquí: ni el esquema
 * de bloques ni el lienzo se tocan.
 *
 * Nota: el harness `TsxCompilationChecker` solo cubre React + TS. Un emisor con
 * `verifiable: false` se exporta sin verificar, y la interfaz debe decirlo en vez
 * de aparentar que compila (misma semántica que el campo `verified` de la API de
 * generación). No dice nada sobre la vista previa, que **sí** cubre los ocho
 * destinos: son dos preguntas distintas —«¿lo compila el harness?» y «¿se puede
 * ver funcionando?»— y confundirlas es lo que tenía a Vue y Angular sin vista.
 */

import { reactEmitter, reactJsEmitter, type CodeEmitter, type EmitInput } from './emit-react';
import { vue2Emitter, vue2JsEmitter, vueEmitter, vueJsEmitter } from './emit-vue';
import { angular21Emitter, angular22Emitter } from './emit-angular';
import { emitPackage, type PackageFile, type PackageInput } from './emit-package';
import { emitAngularPackage } from './emit-angular-package';
import { emitVuePackage } from './emit-vue-package';
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
 * `true` si el destino sabe entregarse como carpeta y, por tanto, publicarse.
 *
 * Publicar en el catálogo un destino sin paquete dejaría entradas que no se
 * pueden exportar como librería: el zip solo sabría poner su fuente suelto.
 * Es la condición que antes cumplía `verifiable`, que respondía a otra pregunta
 * —«¿lo compila el harness?»— y por eso dejaba Angular fuera sin motivo.
 */
export function puedePublicarse(framework: string): boolean {
  return packageFor(framework, { blocks: {}, rootIds: [], vars: [], name: 'X' }) !== null;
}

/**
 * El paquete de carpeta del destino, o `null` si ese destino aún no tiene uno.
 *
 * Se decide aquí y no en la vista porque la pregunta «¿este destino sabe
 * entregarse como carpeta?» es del registro de emisores, no de quien la pinta.
 * Devolver `null` en vez de caer al paquete de React es deliberado: enseñar una
 * carpeta de TSX con otro destino seleccionado sería la misma mentira que el
 * esquema único vino a quitar del lienzo.
 *
 * Los tres emisores de paquete reparten la MISMA estructura, con los mismos
 * nombres de fichero, para que conocer un paquete sea conocerlos todos:
 *
 *   - `index` — la única puerta pública;
 *   - la vista — `X.tsx`, `X.vue` o `x.component.ts|html`;
 *   - `types` — el contrato: props y tipo del elemento de la colección;
 *   - `constants` — los datos de ejemplo y las listas de clases repetidas;
 *   - `utils` — las funciones puras (los validadores);
 *   - `styles/` y `README.md`.
 *
 * Cada fichero aparece solo si el componente tiene algo que poner en él, y hay
 * dos diferencias que NO son inconsistencias sino cómo funciona cada framework:
 * el estado y los manejadores de React salen a `hooks/useX`, que es la unidad
 * que ese ecosistema tiene para eso; y Angular no tiene `utils` porque su
 * plantilla solo resuelve nombres contra la instancia, así que los validadores
 * son métodos de la clase o no existen al renderizar.
 */
export function packageFor(framework: string, input: PackageInput): PackageFile[] | null {
  if (framework === 'angular22') return emitAngularPackage({ ...input, version: 22 });
  if (framework === 'angular21') return emitAngularPackage({ ...input, version: 21 });
  const emisor = getEmitter(framework);
  if (emisor.key === reactEmitter.key || emisor.key === reactJsEmitter.key) {
    return emitPackage({ ...input, lang: emisor.lang });
  }
  if (emisor.frameworkName === 'Vue3' || emisor.frameworkName === 'Vue2') {
    return emitVuePackage({
      ...input,
      lang: emisor.lang,
      dialecto: emisor.frameworkName === 'Vue3' ? 3 : 2,
    });
  }
  return null;
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
