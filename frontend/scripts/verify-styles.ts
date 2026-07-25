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

/** Clases de los `defaultProps` de los 85 bloques de la paleta. */
const fromDefaults = BLOCK_DEFINITIONS.flatMap((d) =>
  (d.defaultProps.className ?? '').split(/\s+/).filter(Boolean),
);

/** Cada opción que el panel de propiedades y la toolbar pueden aplicar. */
const fromPanel = STYLE_SECTIONS.flatMap((section) =>
  section.groups.flatMap((group) => group.options.map((o) => o.value)),
);

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
      defaults: [...new Set(fromDefaults)],
      panel: [...new Set(fromPanel)],
      theme: [...new Set(fromThemePrompt)],
    },
    null,
    2,
  ),
);
