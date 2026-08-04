/**
 * Recolecta todas las clases Tailwind que el editor puede llegar a escribir en
 * un bloque. `verify-styles.mjs` comprueba después que cada una tiene regla en
 * el CSS que Tailwind genera de verdad.
 *
 * Son las tres procedencias posibles de un `className` en el lienzo:
 *   1. el valor por defecto del bloque (`defaults.ts`),
 *   2. lo que el usuario elige en el panel o la toolbar (`style-utils.ts`),
 *   3. lo que escribe la IA, acotado al vocabulario (`style-vocabulary.js`).
 */

import { writeFileSync } from 'node:fs';
import { BLOCK_DEFINITIONS } from '../src/builder/defaults';
import { STYLE_SECTIONS } from '../src/builder/style-utils';
import { THEME_ROLES } from '../src/builder/style-vocabulary.js';
import { alignBlock, ALIGN_EDGES } from '../src/builder/align';
import { applyLayoutPreset, LAYOUT_PRESETS, GAP_STEPS } from '../src/builder/container-layout';

/** Clases de los `defaultProps` de todos los bloques de la paleta. */
const fromDefaults = BLOCK_DEFINITIONS.flatMap((d) =>
  (d.defaultProps.className ?? '').split(/\s+/).filter(Boolean),
);

/** Cada opción que el panel de propiedades y la toolbar pueden aplicar. */
const fromPanel = STYLE_SECTIONS.flatMap((section) =>
  section.groups.flatMap((group) => group.options.map((o) => o.value)),
);

/**
 * Lo que escriben los menús de alinear y de disposición de la barra flotante.
 *
 * No salen de `STYLE_SECTIONS` —no son desplegables del panel, sino botones con
 * su propia lógica— así que sin enumerarlos aquí podrían escribir una clase sin
 * regla compilada y el bloque no se movería al pulsar, en silencio.
 *
 * Se generan ejecutando las MISMAS funciones que usa la interfaz, no repitiendo
 * la lista a mano: una lista paralela se queda desfasada en cuanto se toca una.
 */
const fromAlign = [
  ...ALIGN_EDGES.flatMap(({ edge }) => [
    // Fuera del flujo y dentro de él producen clases distintas: hacen falta las dos.
    ...alignBlock('absolute', edge).split(/\s+/),
    ...alignBlock('', edge).split(/\s+/),
  ]),
  ...(['row', 'col'] as const).flatMap((axis) =>
    LAYOUT_PRESETS.flatMap(({ h, v }) =>
      [false, true].flatMap((spread) =>
        applyLayoutPreset('', { axis, h, v, spread }).split(/\s+/),
      ),
    ),
  ),
  ...GAP_STEPS,
].filter((c) => c && c !== 'absolute');

/**
 * Los roles del tema tal y como el prompt del asistente le pide a la IA que los
 * escriba. Van aquí explícitos, con la misma forma que en el prompt, para que un
 * cambio en `theme.ts` que no llegue al vocabulario salte en la verificación.
 */
const fromThemePrompt = [
  ...THEME_ROLES.map((r) => `bg-[var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `text-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `border-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `ring-[color:var(--vz-${r})]`),
  'rounded-[var(--vz-radio)]',
];

const [outFile] = process.argv.slice(2);

writeFileSync(
  outFile,
  JSON.stringify(
    {
      // Derivado, no escrito a mano: al añadir bloques el número se quedaba
      // atrás en la salida del verificador sin que nada fallara.
      blockCount: BLOCK_DEFINITIONS.length,
      defaults: [...new Set(fromDefaults)],
      panel: [...new Set([...fromPanel, ...fromAlign])],
      theme: [...new Set(fromThemePrompt)],
    },
    null,
    2,
  ),
);
