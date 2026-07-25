/**
 * Escritor de ZIP mínimo (método «stored», sin compresión).
 *
 * Un componente suelto se puede descargar aplanando la ruta, pero una librería
 * son N componentes con sus subcarpetas: entregar treinta ficheros sueltos con
 * el nombre chafado no es una exportación utilizable. Se implementa aquí en vez
 * de añadir una dependencia porque el formato que hace falta —sin compresión,
 * sin cifrado, sin zip64— cabe en este fichero y evita arrastrar un paquete
 * entero al bundle solo por esto.
 *
 * Sin compresión el resultado es más grande, pero el contenido es código fuente
 * de unos pocos KB y cualquier descompresor lo abre igual.
 */

/** Tabla del CRC-32 (polinomio 0xEDB88320), calculada una vez. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Ruta dentro del zip, con `/` como separador. */
  path: string;
  contents: string;
}

/**
 * Fecha y hora en formato MS-DOS, que es lo que guarda el ZIP.
 *
 * No es cosmético: dejarlo a cero hace que algunos descompresores marquen el
 * archivo como corrupto.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2)),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = encoder.encode(entry.contents);
    const crc = crc32(dataBytes);

    // Cabecera local (30 bytes) + nombre + datos.
    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // firma
    localView.setUint16(4, 20, true);         // versión necesaria
    localView.setUint16(6, 0x0800, true);     // nombres en UTF-8
    localView.setUint16(8, 0, true);          // método: stored
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true); // tamaño comprimido
    localView.setUint32(22, dataBytes.length, true); // tamaño original
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);         // sin campo extra
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    locals.push(local);

    // Entrada del directorio central (46 bytes) + nombre.
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);       // versión que lo creó
    centralView.setUint16(6, 20, true);       // versión necesaria
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);  // desplazamiento de la cabecera local
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);

  // Fin del directorio central (22 bytes, sin comentario).
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

/** Descarga el zip en el navegador. */
export function downloadZip(fileName: string, entries: ZipEntry[]): void {
  const url = URL.createObjectURL(createZip(entries));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
