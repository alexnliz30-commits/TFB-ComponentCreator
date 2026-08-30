/**
 * Página de comprobación visual de los paquetes emitidos.
 *
 * NO forma parte de la aplicación: es un banco de pruebas que se sirve por el
 * mismo Vite de desarrollo (`/demo-paquetes/`) y llama a `packageFor`, que es
 * exactamente la función que usa la pestaña «Paquete» del constructor. Sirve
 * para mirar en el navegador lo que sale por los ocho destinos sin pasar por la
 * puerta de acceso ni por el backend, que no intervienen en la emisión.
 *
 * Se puede borrar la carpeta entera sin tocar nada más.
 */

import { availableEmitters, packageFor } from '../src/builder/emitters';
import type { PackageFile } from '../src/builder/emit-package';
import type { BuilderBlock } from '../src/builder/types';
import { BLOCK_DEFINITIONS } from '../src/builder/defaults';
import { DEFAULT_THEME } from '../src/builder/theme';

function bloque(id: string, type: string, extra: Partial<BuilderBlock> = {}): BuilderBlock {
  const def = BLOCK_DEFINITIONS.find((d) => d.type === type);
  if (!def) throw new Error(`Tipo desconocido: ${type}`);
  return { id, type, props: { ...def.defaultProps }, children: [], ...extra };
}

/*
  Un componente que toca TODAS las capas del paquete a la vez.

  Un campo con reglas produce `utils`; un repetidor sobre el modelo produce
  `types` y `constants`; el estado y los manejadores producen el `hooks/` de
  React; los estilos propios producen `styles/`. Con un componente más simple la
  carpeta saldría a medias y la comprobación no diría gran cosa.
*/
const entrada = {
  blocks: {
    raiz: { id: 'raiz', type: 'form', props: {}, children: ['campo', 'enviar', 'tabla'],
      events: [{ event: 'submit', actions: [{ kind: 'set', target: 'enviado', value: 'true' }] }] },
    campo: bloque('campo', 'input', {
      props: { ...bloque('campo', 'input').props, label: 'Correo', bindTo: 'correo' },
      validations: [{ kind: 'required' }, { kind: 'email' }],
    }),
    enviar: (() => { const b = bloque('enviar', 'button'); b.props.buttonType = 'submit'; b.props.text = 'Enviar'; return b; })(),
    tabla: { id: 'tabla', type: 'table-c', props: {}, children: ['cuerpo'] },
    cuerpo: { id: 'cuerpo', type: 'tbody-c', props: {}, children: ['fila'] },
    fila: { id: 'fila', type: 'tr', props: { repeatOver: 'true' }, children: ['celda', 'celda2'] },
    celda: { id: 'celda', type: 'td', props: {}, children: ['texto'] },
    texto: { id: 'texto', type: 'span', props: { bindField: 'cliente' }, children: [] },
    celda2: { id: 'celda2', type: 'td', props: {}, children: ['comprar'] },
    comprar: bloque('comprar', 'button', {
      props: { ...bloque('comprar', 'button').props, text: 'Ver' },
      events: [{ event: 'click', actions: [{ kind: 'call', target: 'onVer' }] }],
    }),
  } as unknown as Record<string, BuilderBlock>,
  rootIds: ['raiz'],
  vars: [
    { name: 'enviado', type: 'boolean' as const, initial: 'false' },
    { name: 'correo', type: 'string' as const, initial: '' },
  ],
  callbacks: [{ name: 'onVer', passesItem: true }],
  name: 'Panel de Pedidos',
  theme: DEFAULT_THEME,
  customStyles: '.destacado { font-weight: 600; }',
  stylesLanguage: 'css' as const,
  model: {
    name: 'Pedido',
    sampleRows: 3,
    fields: [
      { name: 'cliente', type: 'text' as const, sample: 'Ana Ruiz' },
      { name: 'total', type: 'number' as const, sample: '120' },
    ],
  },
};

/** La capa a la que pertenece cada fichero, para colorearlo y agruparlo. */
function capaDe(ruta: string): string {
  const r = ruta.split('/').slice(1).join('/');
  if (/^index\.[jt]s$/.test(r)) return 'index';
  if (/\.(tsx|jsx|vue)$/.test(r) || /\.component\.(ts|html)$/.test(r)) return 'vista';
  if (/^types\./.test(r)) return 'types';
  if (/^constants\./.test(r)) return 'constants';
  if (/^utils\./.test(r)) return 'utils';
  if (/^hooks\//.test(r)) return 'hooks';
  if (/^styles\//.test(r) || /\.component\.(css|scss)$/.test(r)) return 'styles';
  if (/README/.test(r)) return 'README';
  return 'otro';
}

const CAPAS = ['index', 'vista', 'types', 'constants', 'utils', 'hooks', 'styles', 'README'];

const destinos = availableEmitters().map((e) => ({
  key: e.key,
  label: e.label,
  files: packageFor(e.key, entrada as never) as PackageFile[] | null,
}));

let destinoActivo = destinos[0].key;
let ficheroActivo = 0;

function escapa(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render() {
  const app = document.getElementById('app')!;
  const actual = destinos.find((d) => d.key === destinoActivo)!;
  const files = actual.files ?? [];
  const fichero = files[Math.min(ficheroActivo, files.length - 1)];
  const carpeta = files[0]?.path.split('/')[0] ?? '';

  app.innerHTML = `
    <header>
      <h1>Paquetes emitidos</h1>
      <p>La misma IR por los ocho destinos. Sale de <code>packageFor()</code>, la
      función que alimenta la pestaña «Paquete» del constructor.</p>
    </header>

    <table class="matriz">
      <thead>
        <tr><th>destino</th>${CAPAS.map((c) => `<th>${c}</th>`).join('')}<th>ficheros</th></tr>
      </thead>
      <tbody>
        ${destinos.map((d) => {
          const capas = new Set((d.files ?? []).map((f) => capaDe(f.path)));
          return `<tr class="${d.key === destinoActivo ? 'sel' : ''}" data-destino="${d.key}">
            <th>${d.label}</th>
            ${CAPAS.map((c) => `<td class="${capas.has(c) ? 'si' : 'no'}">${capas.has(c) ? '●' : '·'}</td>`).join('')}
            <td class="num">${d.files ? d.files.length : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="explorador">
      <nav>
        <div class="carpeta">${escapa(carpeta)}/</div>
        ${files.map((f, i) => {
          const r = f.path.split('/').slice(1).join('/');
          return `<button class="${i === ficheroActivo ? 'act' : ''}" data-i="${i}">
            <span class="pin ${capaDe(f.path)}"></span>${escapa(r)}
          </button>`;
        }).join('')}
      </nav>
      <pre><code>${fichero ? escapa(fichero.contents) : ''}</code></pre>
    </div>
  `;

  app.querySelectorAll<HTMLElement>('tr[data-destino]').forEach((tr) => {
    tr.onclick = () => { destinoActivo = tr.dataset.destino!; ficheroActivo = 0; render(); };
  });
  app.querySelectorAll<HTMLElement>('button[data-i]').forEach((b) => {
    b.onclick = () => { ficheroActivo = Number(b.dataset.i); render(); };
  });
}

const estilos = document.createElement('style');
estilos.textContent = `
  :root { --borde: #d7dce4; --tenue: #6b7686; --fondo: #f6f8fb; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
         color: #16202e; background: var(--fondo); }
  #app { max-width: 1180px; margin: 0 auto; padding: 28px 20px 48px; }
  header h1 { font-size: 20px; margin: 0 0 4px; }
  header p { margin: 0 0 20px; color: var(--tenue); max-width: 62ch; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

  .matriz { border-collapse: collapse; width: 100%; background: #fff;
            border: 1px solid var(--borde); border-radius: 8px; overflow: hidden; }
  .matriz th, .matriz td { padding: 6px 10px; text-align: center; font-weight: 400;
                           border-bottom: 1px solid var(--borde); font-size: 12px; }
  .matriz thead th { background: #eef1f6; color: var(--tenue); font-size: 11px;
                     text-transform: uppercase; letter-spacing: .04em; }
  .matriz tbody th { text-align: left; font-weight: 600; white-space: nowrap; }
  .matriz tbody tr { cursor: pointer; }
  .matriz tbody tr:hover { background: #f0f4fa; }
  .matriz tbody tr.sel { background: #e5edfb; }
  .matriz .si { color: #1c7c4a; font-size: 15px; }
  .matriz .no { color: #c3cad6; }
  .matriz .num { color: var(--tenue); }

  .explorador { display: grid; grid-template-columns: 270px 1fr; gap: 0;
                margin-top: 22px; background: #fff; border: 1px solid var(--borde);
                border-radius: 8px; overflow: hidden; min-height: 460px; }
  .explorador nav { border-right: 1px solid var(--borde); padding: 8px; overflow-y: auto; }
  .carpeta { font: 600 12px ui-monospace, monospace; padding: 6px 8px 10px; color: var(--tenue); }
  .explorador nav button { display: flex; align-items: center; gap: 8px; width: 100%;
    text-align: left; border: 0; background: none; cursor: pointer; padding: 5px 8px;
    border-radius: 5px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #34405180; }
  .explorador nav button { color: #37475c; }
  .explorador nav button:hover { background: #f0f4fa; }
  .explorador nav button.act { background: #e5edfb; color: #0f1b2d; font-weight: 600; }
  .pin { width: 7px; height: 7px; border-radius: 2px; flex: none; background: #c3cad6; }
  .pin.index { background: #6b46c1; } .pin.vista { background: #2563eb; }
  .pin.types { background: #0891b2; } .pin.constants { background: #ca8a04; }
  .pin.utils { background: #16a34a; } .pin.hooks { background: #db2777; }
  .pin.styles { background: #ea580c; } .pin.README { background: #94a3b8; }

  .explorador pre { margin: 0; padding: 16px 18px; overflow: auto; background: #0f1b2d;
                    color: #dbe4f0; font-size: 12px; line-height: 1.65; }
`;
document.head.appendChild(estilos);
render();
