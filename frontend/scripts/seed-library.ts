/**
 * Construye la carga con la que se siembra la librería de ejemplo.
 *
 * Emite el código de cada componente con el MISMO emisor que usa la aplicación,
 * en vez de llevar el TSX escrito a mano en un fichero aparte: así la semilla no
 * puede describir un componente distinto del que produciría el constructor al
 * abrir su árbol, que es el único modo de que siga siendo un ejemplo válido
 * cuando el emisor cambie.
 *
 * Escribe la carga por la salida estándar; `seed-library.mjs` la envía.
 */

import { reactEmitter } from '../src/builder/emit-react';
import { SEED_LIBRARY, seedTreeJson } from '../src/libraries/seed-library';

const payload = {
  library: {
    name: SEED_LIBRARY.name,
    framework: 'React',
    language: 'TypeScript',
    description: SEED_LIBRARY.description,
    themeJson: JSON.stringify(SEED_LIBRARY.theme),
    globalStyles: SEED_LIBRARY.globalStyles,
  },
  components: SEED_LIBRARY.components.map((c) => ({
    name: c.name,
    sourceCode: reactEmitter.emit({
      blocks: c.blocks,
      rootIds: c.rootIds,
      vars: c.stateVars,
      name: c.name,
    }),
    treeJson: seedTreeJson(c),
  })),
};

process.stdout.write(JSON.stringify(payload));
