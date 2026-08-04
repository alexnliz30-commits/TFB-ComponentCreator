/**
 * Siembra la librería de ejemplo «Atenea» en una instalación en marcha.
 *
 * Uso:  node scripts/seed-library.mjs [http://localhost:5080] [codigo-de-acceso]
 *
 * Es idempotente por nombre: si ya existe una librería llamada igual, la
 * reutiliza y vuelve a guardar sus componentes (el guardado del catálogo es un
 * upsert por nombre), así que sembrar dos veces no llena la base de datos de
 * copias. Los estilos globales se reescriben siempre, para que sembrar sirva
 * también de restablecimiento.
 */

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = process.argv[2] ?? 'http://localhost:5080';
const CODE = process.argv[3] ?? 'visualiza-dev';

// La semilla y el emisor son TypeScript: se empaquetan igual que en
// `verify-emitter.mjs` para no mantener dos versiones del mismo árbol.
const dir = mkdtempSync(join(tmpdir(), 'visualiza-seed-'));
const bundle = join(dir, 'seed.mjs');
await build({
  entryPoints: ['scripts/seed-library.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'error',
});

const { execFileSync } = await import('node:child_process');
const payload = JSON.parse(execFileSync(process.execPath, [bundle], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
}));
rmSync(dir, { recursive: true, force: true });

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

const { token } = await api('/api/access/designer', {
  method: 'POST',
  body: { accessCode: CODE },
});

const existing = (await api('/api/libraries', { token }))
  .find((l) => l.name === payload.library.name);

let library;
if (existing) {
  console.log(`Ya existía «${existing.name}»: se reutiliza y se actualizan sus estilos.`);
  library = await api(`/api/libraries/${existing.id}/styles`, {
    method: 'PUT',
    token,
    body: {
      themeJson: payload.library.themeJson,
      globalStyles: payload.library.globalStyles,
    },
  });
} else {
  library = await api('/api/libraries', { method: 'POST', token, body: payload.library });
  console.log(`Creada la librería «${library.name}».`);
}

for (const component of payload.components) {
  await api(`/api/libraries/${library.id}/components`, {
    method: 'POST',
    token,
    body: component,
  });
  console.log(`  · ${component.name}`);
}

const detail = await api(`/api/libraries/${library.id}`, { token });
console.log(
  `\n«${detail.library.name}»: ${detail.components.length} componentes, ` +
  `tema ${detail.library.themeJson ? 'guardado' : 'AUSENTE'}, ` +
  `hoja global ${detail.library.globalStyles ? 'guardada' : 'AUSENTE'}.`,
);
console.log(`Id: ${library.id}`);
