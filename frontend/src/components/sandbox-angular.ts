/**
 * Sandbox de Angular: compila el componente **en el navegador** y lo arranca.
 *
 * Es el destino que más lejos queda de poder ejecutarse sin más, y por tres
 * razones distintas:
 *
 *   1. **La clase lleva decoradores**, que no son JavaScript. Los traduce Babel
 *      —el mismo que ya monta React— con el plugin de decoradores heredados: la
 *      salida es `Component({...})(Clase)`, que es exactamente lo que el
 *      decorador de Angular espera recibir.
 *   2. **La plantilla no se compila sola.** Un proyecto real la compila al
 *      construir (AOT); aquí no hay construcción, así que se carga
 *      `@angular/compiler`, que publica el compilador JIT y deja que `@Component`
 *      lo use al instanciar. Es el mismo compilador, en otro momento.
 *   3. **Hace falta arrancar una aplicación**, no renderizar un componente
 *      suelto: `bootstrapApplication` busca en el documento el elemento cuyo
 *      nombre coincide con el `selector`, así que el iframe lo crea antes.
 *
 * La detección de cambios va **sin zone.js**: el emisor escribe todo el estado
 * como señales, que es justamente lo que el modo sin zonas sabe observar. Es
 * medio megabyte menos y, sobre todo, la misma configuración que recomienda hoy
 * un proyecto nuevo, así que lo que se ve aquí es lo que se verá allí.
 */

import {
  ALTURA_SCRIPT, CAJA_ERROR, ESTILO_BASE, ID_FUENTE, SCRIPT_ERROR, SCRIPT_FORMULARIO, SCRIPT_TAILWIND,
  STORAGE_SHIM, bloqueFuente, hojasExtra,
} from './sandbox-shared';

/**
 * Versión exacta por destino, y exacta a propósito.
 *
 * Los tres paquetes de Angular tienen que ser **el mismo build**: `core` guarda
 * el compilador JIT en un registro global que `compiler` rellena, y dos copias
 * distintas de `core` en el mismo documento dejan ese registro a medias con un
 * error que no dice nada. Pedir `@22` y que el CDN resuelva por su cuenta abre
 * justo esa puerta.
 */
const VERSIONES: Record<string, string> = {
  angular22: '22.1.7',
  angular21: '21.2.23',
};

const ANGULAR_POR_DEFECTO = VERSIONES.angular22;

/** Babel: el mismo que transforma el TSX de React, con otra configuración. */
const BABEL = 'https://unpkg.com/@babel/standalone@7/babel.min.js';

export function buildAngularHtml(
  target: string,
  source: string,
  themeCss?: string,
  componentCss?: string,
  informaAltura = false,
): string {
  const version = VERSIONES[target] ?? ANGULAR_POR_DEFECTO;
  const extraStyles = hojasExtra(themeCss, componentCss);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${STORAGE_SHIM}
${SCRIPT_ERROR}
${SCRIPT_FORMULARIO}
${SCRIPT_TAILWIND}
  <script src="${BABEL}"></script>
${ESTILO_BASE}
${extraStyles}${informaAltura ? `\n${ALTURA_SCRIPT}` : ''}
</head>
<body>
  <div id="root"></div>
  ${CAJA_ERROR}
${bloqueFuente(source)}
  <script type="module">
    try {
      // Los tres del mismo build: ver el comentario de VERSIONES.
      const core = await import('https://esm.sh/@angular/core@${version}');
      // Sin valor que recoger: importarlo es lo que publica el compilador JIT.
      await import('https://esm.sh/@angular/compiler@${version}');
      const { bootstrapApplication } = await import('https://esm.sh/@angular/platform-browser@${version}');

      const fuente = JSON.parse(document.getElementById('${ID_FUENTE}').textContent);
      /*
        Fuera los imports y los export.

        El componente se evalúa dentro de una función, donde \`import\` no vale y
        \`export\` es error de sintaxis. Lo que los imports traían —\`Component\`,
        \`signal\`, \`input\`, \`output\`— se le pasa a esa función como argumento,
        que es la misma solución que el sandbox de React usa con los hooks.
      */
      const suelto = fuente
        .replace(/^import\\s[^\\n]*;\\s*$/gm, '')
        .replace(/^export\\s+/gm, '');

      const { code } = Babel.transform(suelto, {
        filename: 'componente.ts',
        sourceType: 'script',
        // El plugin va antes que el preset: si TypeScript pasa primero, se
        // encuentra un decorador que no sabe interpretar y aborta.
        plugins: [['proposal-decorators', { version: 'legacy' }]],
        presets: [['typescript', { allExtensions: true }]],
      });

      const clase = /class\\s+([A-Za-z_$][\\w$]*)/.exec(suelto);
      const selector = /selector:\\s*'([^']+)'/.exec(fuente);
      if (!clase || !selector) {
        vzError('El componente de Angular no declara una clase con su selector.');
      } else {
        const fabrica = new Function('ng',
          '"use strict";\\n'
          + 'const { Component, ChangeDetectionStrategy, signal, computed, effect, input, output } = ng;\\n'
          + code + '\\n'
          + 'return ' + clase[1] + ';');
        const Componente = fabrica(core);

        // \`bootstrapApplication\` monta sobre el elemento que ya existe en el
        // documento con el nombre del selector: aquí no hay página que lo
        // traiga, así que lo pone el sandbox.
        document.getElementById('root').appendChild(document.createElement(selector[1]));
        await bootstrapApplication(Componente, {
          providers: [core.provideZonelessChangeDetection()],
        });
      }
    } catch (err) {
      vzError(err);
    }
  </script>
</body>
</html>`;
}
