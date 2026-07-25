import { SAFELIST } from './src/builder/style-vocabulary.js';

/**
 * El escaneo de `content` solo recoge las clases escritas literalmente en las
 * fuentes, que basta para la interfaz del editor pero no para el LIENZO: ahí las
 * clases las deciden la IA, el panel de propiedades o el usuario en tiempo de
 * ejecución, y sin regla CSS el navegador las ignora en silencio. El `safelist`
 * garantiza que todo el vocabulario de `style-vocabulary.js` tenga regla.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: SAFELIST,
  theme: { extend: {} },
  plugins: [],
};
