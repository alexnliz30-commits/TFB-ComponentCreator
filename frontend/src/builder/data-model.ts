/**
 * Modelo de datos de un componente: el contrato de lo que recibe de fuera.
 *
 * Hasta aquí un componente sólo podía llevar contenido literal: el texto de una
 * celda o de una tarjeta se escribía en la prop del bloque y viajaba incrustado
 * en el código exportado. Eso vale para una portada, pero no para una tabla de
 * pedidos: quien la integra tiene los pedidos, no quiere los cuatro de ejemplo.
 *
 * Aquí se declara **qué campos** tiene un elemento y **cómo es uno de ejemplo**.
 * Con eso, el lienzo puede dibujar algo realista mientras se diseña y el código
 * emitido puede recibir la lista de verdad por props, sin que ninguno de los dos
 * invente nada: son la misma declaración leída por dos consumidores.
 *
 * Es hermano de `StateVar` a propósito —misma forma, mismo sitio, mismas reglas
 * de nombre— porque son la misma idea aplicada a cosas distintas: el estado es
 * lo que el componente recuerda; el modelo, lo que le dan.
 */

/**
 * Tipos de campo.
 *
 * Deliberadamente pocos y cerrados, igual que `StateVarType`: cada uno tiene que
 * saber emitirse a TypeScript, pintarse en el lienzo y ofrecer un control en el
 * panel. Un `any` no cumpliría ninguna de las tres.
 */
export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'image';

/**
 * Nombre de la variable de elemento dentro de un repetidor.
 *
 * Vive aquí, en el módulo que no importa a nadie, porque lo necesitan tanto el
 * esquema —que construye el repetidor— como el modelo de acciones, que emite
 * condiciones y llamadas que lo nombran. Ponerlo en cualquiera de los dos crearía
 * una dependencia circular entre ellos.
 */
export const ITEM_PARAM = 'item';

export interface ModelField {
  name: string;
  type: FieldType;
  /**
   * Valor de ejemplo, usado SOLO para dibujar el lienzo.
   *
   * No viaja al código emitido como dato: allí los datos llegan por props. Su
   * único cometido es que diseñar no sea diseñar sobre cajas vacías, que es
   * cuando se toman malas decisiones de espaciado y de anchura.
   */
  sample: string;
}

export interface DataModel {
  /** Nombre del elemento en singular; da nombre al tipo emitido (`Order`). */
  name: string;
  fields: ModelField[];
  /**
   * Cuántas filas de ejemplo dibuja el lienzo.
   *
   * Diseñar con una sola fila engaña: no se ve el rayado alterno, ni si la tabla
   * necesita desplazamiento, ni cómo respira el espaciado vertical.
   */
  sampleRows: number;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sí / No',
  date: 'Fecha',
  image: 'Imagen (URL)',
};

/** Tipo TypeScript de un campo, para la interfaz que se emite. */
export function fieldTsType(field: ModelField): string {
  switch (field.type) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    // Una fecha viaja como cadena ISO: emitir `Date` obligaría a quien integra el
    // componente a convertir antes de pasársela, y lo que llega de una API es texto.
    default: return 'string';
  }
}

/** Nombre del tipo emitido para un elemento del modelo (`Order`). */
export function modelTypeName(model: DataModel): string {
  const clean = (model.name || '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!clean) return 'Item';
  const pascal = clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return /^[0-9]/.test(pascal) ? `Item${pascal}` : pascal;
}

/** Identificador JS válido, con las mismas reglas que una variable de estado. */
export function isValidFieldName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/**
 * Valor de ejemplo de un campo en la fila `index`.
 *
 * Se varía por fila en lugar de repetir el mismo valor: cuatro filas idénticas
 * no dejan ver si la columna se alinea, si el texto largo desborda ni si el
 * rayado alterno funciona, que es justo para lo que sirve la muestra.
 */
export function sampleValue(field: ModelField, index: number): boolean | number | string {
  const raw = field.sample?.trim() ?? '';
  switch (field.type) {
    case 'number': {
      const base = Number(raw);
      return Number.isFinite(base) ? base + index : index + 1;
    }
    case 'boolean':
      // Alterna para que se vean los dos estados sin tocar nada.
      return index % 2 === 0 ? raw !== 'false' : raw === 'false';
    case 'image':
      return raw || `https://placehold.co/80x80?text=${index + 1}`;
    case 'date':
      return raw || new Date(2026, 0, index + 1).toISOString().slice(0, 10);
    default:
      return raw ? (index === 0 ? raw : `${raw} ${index + 1}`) : `Elemento ${index + 1}`;
  }
}

/** Campos utilizables: con nombre válido y sin duplicados. */
export function effectiveFields(fields: ModelField[]): ModelField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (!isValidFieldName(f.name) || seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
}

/** Modelo vacío con el que arranca un componente que aún no recibe datos. */
export const EMPTY_MODEL: DataModel = { name: '', fields: [], sampleRows: 3 };

/**
 * Filas de ejemplo del modelo, como datos.
 *
 * Sirven para tres cosas a la vez, y por eso se calculan en un solo sitio: para
 * dibujar el lienzo mientras se diseña, para que el artefacto de verificación
 * `App()` —que no tiene props— compile, y como **valor por defecto de la prop**
 * en el paquete. Eso último es lo que hace que `<TablaPedidos />` funcione sola
 * con datos falsos y `<TablaPedidos items={pedidos} />` use los de verdad.
 */
export function mockRows(model: DataModel): Record<string, unknown>[] {
  const fields = effectiveFields(model.fields);
  const rows = Math.max(1, Math.min(20, model.sampleRows || 3));
  return Array.from({ length: rows }, (_, i) => {
    const row: Record<string, unknown> = {};
    for (const f of fields) row[f.name] = sampleValue(f, i);
    return row;
  });
}

/** Literal TypeScript de las filas de ejemplo, para el código emitido. */
export function mockRowsLiteral(model: DataModel): string {
  const rows = mockRows(model)
    .map((row) => `  ${JSON.stringify(row)},`)
    .join('\n');
  return `[\n${rows}\n]`;
}

/** Interfaz TypeScript del elemento, tal y como se emite. */
export function modelInterface(model: DataModel): string {
  const fields = effectiveFields(model.fields);
  const lines = fields.map((f) => `  ${f.name}: ${fieldTsType(f)};`).join('\n');
  return `export interface ${modelTypeName(model)} {\n${lines}\n}`;
}

/** `true` si el modelo declara algo utilizable. */
export function hasModel(model: DataModel | undefined): model is DataModel {
  return Boolean(model && model.name.trim() && effectiveFields(model.fields).length > 0);
}
