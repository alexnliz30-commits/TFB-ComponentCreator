/**
 * Lenguaje del código emitido: TypeScript o JavaScript.
 *
 * El árbol de bloques no sabe de lenguajes —la IR describe *qué* es la interfaz,
 * no cómo se escribe— así que todo lo que separa un TSX de un JSX cabe en este
 * módulo: unas anotaciones de tipo, unas firmas de parámetro y la forma de
 * declarar un contrato. Ese es justamente el motivo de que exista un solo sitio
 * para decidirlo.
 *
 * Lo que NO se hace aquí es transpilar. Emitir TypeScript y luego quitarle los
 * tipos con expresiones regulares parece más barato hasta que un genérico o un
 * literal de plantilla con dos puntos dentro se lleva por delante media línea;
 * y el fallo aparecería en el proyecto de destino, no aquí. Cada emisión sabe
 * desde el principio en qué lenguaje escribe, y escribe eso.
 */

export type Lang = 'ts' | 'js';

/**
 * Anotación de tipo, o nada en JavaScript.
 *
 * `anot('ts', 'string')` → `': string'`; en JS, `''`. Se devuelve con los dos
 * puntos incluidos para que quien la use no tenga que acordarse de ponerlos solo
 * a veces, que es donde se cuelan los `: ` sueltos en el código emitido.
 */
export function anot(lang: Lang, tipo: string): string {
  return lang === 'ts' ? `: ${tipo}` : '';
}

/**
 * Parámetro del manejador de un control con valor (`input`, `select`, `slider`).
 *
 * En TypeScript se tipa **estructuralmente** y no con `React.ChangeEvent`: el
 * componente emitido no lleva imports, así que en el entorno de verificación
 * `React` es un valor y no un espacio de nombres de tipos. Un evento sintético
 * de React satisface esta forma, de modo que compila igual dentro del harness
 * que en un proyecto React de verdad.
 */
export function paramValor(lang: Lang): string {
  return `e${anot(lang, '{ target: { value: string } }')}`;
}

/** Igual que `paramValor`, para los controles que llevan estado marcado. */
export function paramMarcado(lang: Lang): string {
  return `e${anot(lang, '{ target: { checked: boolean } }')}`;
}

/** Parámetro del envío de un formulario, que solo necesita cortar la navegación. */
export function paramEnvio(lang: Lang): string {
  return `e${anot(lang, '{ preventDefault: () => void }')}`;
}

/**
 * Tipo de un valor que viaja por props, para el contrato del paquete.
 *
 * En JavaScript el contrato no desaparece: se escribe en JSDoc, que es como se
 * documenta en JS de verdad y lo que leen tanto el editor de quien reciba el
 * paquete como su comprobador de tipos si algún día lo enciende.
 */
export function jsdocBloque(lineas: string[]): string {
  return `/**\n${lineas.map((l) => ` * ${l}`).join('\n')}\n */`;
}
