/**
 * Verificación de la vista previa: abre cada documento del sandbox en un
 * navegador de verdad y comprueba que el componente se monta y responde.
 *
 * Es la contrapartida de `verify:emitter`. Aquel compila lo que el constructor
 * genera; este lo **ejecuta**, que es otra pregunta y con otras respuestas: el
 * harness compila la clase de Angular sin mirar su plantilla, así que un
 * `{{ String(x) }}` o un formulario que recarga la página pasaban por buenos y
 * solo se caían al renderizar. Los dos fallos salieron de aquí.
 *
 * Y el tercero salió de no parecerse lo bastante: esto abría el documento como
 * página de primer nivel, que no tiene las restricciones del `sandbox`, y daba
 * los 8 destinos por buenos mientras en la aplicación **ningún formulario
 * validaba** porque el iframe cortaba el `submit`. Ahora cada caso se monta en
 * un iframe con los mismos permisos, y se pregunta dentro de él.
 *
 * Dos pasadas:
 *   1. **Monta** — los 7 componentes de la semilla en los 8 destinos: sin caja
 *      de error, con nodos y con el mismo texto visible en todos.
 *   2. **Responde** — interacciones reales (enviar el formulario, buscar,
 *      desplegar el menú, subir la cantidad) con el mismo resultado en los 8.
 *
 * Necesita Chrome instalado; se busca en las rutas de siempre o en `CHROME_PATH`.
 *
 * Uso: `npm run verify:preview`
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const CANDIDATOS_CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chromePath = CANDIDATOS_CHROME.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No se ha encontrado Chrome. Indica su ruta en la variable CHROME_PATH.');
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'visualiza-preview-'));
const docsDir = join(workDir, 'documentos');
const perfil = join(workDir, 'perfil');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Destinos, en el orden en el que se registran los emisores. */
const DESTINOS = ['react', 'react-js', 'vue3', 'vue3-js', 'vue2', 'vue2-js', 'angular22', 'angular21'];

/*
  Ayudas que se inyectan en la página antes de cada sonda.

  `escribir` usa el setter nativo del input porque React sustituye el suyo y no
  se entera de una asignación directa; y el `blur` se lanza dos veces porque Vue
  y Angular escuchan en el propio elemento mientras React delega en la raíz, a
  donde solo llega `focusout`.
*/
const AYUDA = `
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const texto = () => (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
  function escribir(el, valor) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function salirDe(el) {
    el.dispatchEvent(new Event('blur'));
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
  }
`;

const SONDAS = [
  {
    componente: 'SelectorDeCantidad',
    que: 'pulsar «+» dos veces sube la cantidad a 3',
    guion: `
      const botones = [...document.querySelectorAll('button')];
      botones[1].click(); botones[1].click();
      await esperar(400);
      return /Licencias .{0,3} 3 \\+/.test(texto()) ? 'ok' : 'NO: ' + texto().slice(0, 80);`,
  },
  {
    componente: 'FormularioDeAlta',
    que: 'enviar vacío valida y no recarga la página',
    guion: `
      const antes = location.href;
      document.querySelector('button[type=submit]').click();
      await esperar(500);
      if (location.href !== antes) return 'NO: el formulario ha navegado';
      return texto().includes('obligatorio') ? 'ok' : 'NO: ' + texto().slice(0, 80);`,
  },
  {
    componente: 'FormularioDeAlta',
    que: 'un correo inválido se marca al salir del campo',
    guion: `
      const campo = document.querySelector('input[type=email]');
      escribir(campo, 'esto-no-es-un-correo');
      salirDe(campo);
      await esperar(500);
      return texto().includes('correo electrónico válido') ? 'ok' : 'NO: ' + texto().slice(0, 120);`,
  },
  {
    componente: 'TablaDePedidos',
    que: 'buscar algo que no está enseña el estado vacío',
    guion: `
      escribir(document.querySelector('input[type=search]'), 'zzz');
      await esperar(400);
      return texto().includes('Sin resultados') ? 'ok' : 'NO: ' + texto().slice(-90);`,
  },
  {
    componente: 'BarraDeNavegacion',
    que: 'el botón del menú lo despliega',
    guion: `
      const antes = document.querySelectorAll('*').length;
      document.querySelector('button').click();
      await esperar(400);
      const despues = document.querySelectorAll('*').length;
      return despues > antes ? 'ok' : 'NO: sigue con ' + despues + ' nodos';`,
  },
  {
    componente: 'DialogoDeConfirmacion',
    que: 'confirmar cambia lo que se ve',
    guion: `
      const antes = texto();
      const botones = [...document.querySelectorAll('button')];
      botones[botones.length - 1].click();
      await esperar(400);
      return texto() !== antes ? 'ok' : 'NO: no ha cambiado nada';`,
  },
];

const SONDA_MONTAJE = `(() => {
  const err = document.getElementById('err');
  return {
    error: err && err.style.display !== 'none' ? err.textContent : '',
    elementos: document.body.querySelectorAll('*').length,
    texto: (document.body.innerText || '').replace(/\\s+/g, ' ').trim(),
  };
})()`;

let chrome;
let ws;

try {
  // 1) Emitir los documentos con el mismo constructor que usa la aplicación.
  const bundlePath = join(workDir, 'emitir.mjs');
  await build({
    entryPoints: ['scripts/verify-preview.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    // React entra en el paquete: el guion se ejecuta desde un directorio
    // temporal, donde un `import 'react'` externo no resolvería contra el
    // node_modules del proyecto. No se usa —solo se importa el constructor del
    // documento— pero `ComponentSandbox` lo nombra.
    logLevel: 'silent',
  });
  console.log(execFileSync('node', [bundlePath, docsDir], { encoding: 'utf8' }).trim());

  const casos = JSON.parse(readFileSync(join(docsDir, 'casos.json'), 'utf8'));

  // 2) Arrancar Chrome y engancharse a su pestaña.
  const puerto = 9400 + Math.floor(Math.random() * 500);
  chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });

  let pestana = null;
  for (let i = 0; i < 60 && !pestana; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
      pestana = lista.find((t) => t.type === 'page') ?? null;
    } catch { /* todavía no escucha */ }
    if (!pestana) await dormir(250);
  }
  if (!pestana) throw new Error('Chrome no expuso ninguna pestaña de depuración');

  ws = new WebSocket(pestana.webSocketDebuggerUrl);
  let id = 0;
  const pendientes = new Map();
  let incidencias = [];

  const enviar = (method, params = {}) => {
    const msg = { id: ++id, method, params };
    ws.send(JSON.stringify(msg));
    return new Promise((res) => pendientes.set(msg.id, res));
  };

  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m.result); pendientes.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      incidencias.push((d.exception?.description ?? d.text).split('\n')[0]);
    }
  });
  await enviar('Runtime.enable');
  await enviar('Page.enable');

  /**
   * Abre el caso y devuelve con qué preguntarle DENTRO del iframe.
   *
   * El documento tiene origen opaco, así que ni la página puede mirarlo ni
   * sirve la conexión de la página: Chrome lo publica como otro objetivo, con
   * su propio WebSocket, y es ahí donde hay que preguntar. Es más trabajo y es
   * justo el punto: abrir el documento como página suelta le regala permisos
   * que en la aplicación no tiene, y ahí se escondió el tercer fallo.
   */
  const abrir = async (fichero) => {
    incidencias = [];
    await enviar('Page.navigate', { url: 'file:///' + join(docsDir, fichero).replace(/\\/g, '/') });
    // El SFC y el JIT de Angular se compilan en el navegador y sus módulos
    // llegan por red: una espera corta mediría el iframe todavía vacío.
    await dormir(2600);

    const objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    const marco = objetivos.find((t) => t.type === 'iframe' && t.url === 'about:srcdoc');
    if (!marco) return null;

    const wsMarco = new WebSocket(marco.webSocketDebuggerUrl);
    let idMarco = 0;
    const suyas = new Map();
    await new Promise((r) => wsMarco.addEventListener('open', r));
    wsMarco.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && suyas.has(m.id)) { suyas.get(m.id)(m.result); suyas.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        incidencias.push((d.exception?.description ?? d.text).split('\n')[0]);
      }
      // Los errores del propio navegador —«Blocked form submission», una
      // subida que no carga— solo salen por aquí, y son los que cuentan.
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        incidencias.push(m.params.entry.text);
      }
    });
    const pedir = (method, params = {}) => {
      const msg = { id: ++idMarco, method, params };
      wsMarco.send(JSON.stringify(msg));
      return new Promise((res) => suyas.set(msg.id, res));
    };
    await pedir('Runtime.enable');
    await pedir('Log.enable');

    return {
      evaluar: (expression, awaitPromise = false) =>
        pedir('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }),
      cerrar: () => { try { wsMarco.close(); } catch { /* ya cerrado */ } },
    };
  };

  // ── Pasada 1: monta ────────────────────────────────────────────────────────
  console.log('\n── Se monta ──');
  let fallos = 0;
  const textoPorComponente = new Map();

  for (const caso of casos) {
    const marco = await abrir(caso.fichero);
    const problemas = [];
    let v = {};
    if (!marco) {
      problemas.push('el sandbox no ha llegado a montarse');
    } else {
      v = (await marco.evaluar(SONDA_MONTAJE)).result?.value ?? {};
      marco.cerrar();
      if (v.error) problemas.push(`caja de error: ${v.error.slice(0, 140)}`);
      if (!v.texto) problemas.push('no ha pintado nada');
      for (const inc of incidencias.slice(0, 2)) problemas.push(inc.slice(0, 140));
    }

    /*
      El mismo texto en los ocho.

      Es la comprobación que de verdad importa: los ocho destinos salen de la
      MISMA IR, así que si uno enseña otra cosa es que su traducción se ha
      desviado. El de React hace de referencia por ser el primero de la lista.
    */
    const referencia = textoPorComponente.get(caso.componente);
    if (v.texto) {
      if (referencia === undefined) textoPorComponente.set(caso.componente, v.texto);
      else if (referencia !== v.texto) problemas.push(`texto distinto al de React: «${v.texto.slice(0, 70)}»`);
    }

    if (problemas.length > 0) {
      fallos++;
      console.log(`  FALLA  ${caso.componente} · ${caso.destino}`);
      for (const p of problemas) console.log(`         ${p}`);
    }
  }
  console.log(`  ${casos.length - fallos}/${casos.length} documentos montados con el mismo contenido`);

  // ── Pasada 2: responde ─────────────────────────────────────────────────────
  console.log('\n── Responde ──');
  let fallosInteraccion = 0;
  for (const sonda of SONDAS) {
    const malos = [];
    for (const destino of DESTINOS) {
      const marco = await abrir(`${sonda.componente}.${destino}.html`);
      if (!marco) { malos.push([destino, 'el sandbox no ha llegado a montarse']); fallosInteraccion++; continue; }
      const r = await marco.evaluar(`(async () => {${AYUDA}${sonda.guion}\n})()`, true);
      marco.cerrar();
      const v = r.result?.value
        ?? `excepción: ${(r.exceptionDetails?.exception?.description ?? '').split('\n')[0]}`;
      if (v !== 'ok') { malos.push([destino, v]); fallosInteraccion++; }
    }
    const bien = DESTINOS.length - malos.length;
    console.log(`  ${malos.length === 0 ? 'ok   ' : 'FALLA'} ${sonda.componente} — ${sonda.que}  [${bien}/${DESTINOS.length}]`);
    for (const [destino, v] of malos) console.log(`         ${destino}: ${String(v).slice(0, 150)}`);
  }
  const total = SONDAS.length * DESTINOS.length;
  console.log(`  ${total - fallosInteraccion}/${total} interacciones correctas`);

  const todo = fallos + fallosInteraccion;
  console.log(todo === 0
    ? '\nVista previa verificada en los 8 destinos.'
    : `\n${todo} comprobación(es) fallida(s).`);
  process.exitCode = todo === 0 ? 0 : 1;
} finally {
  try { ws?.close(); } catch { /* ya cerrado */ }
  try { chrome?.kill(); } catch { /* ya terminado */ }
  // Chrome tarda un instante en soltar su perfil.
  await dormir(400);
  rmSync(workDir, { recursive: true, force: true });
}
