// Vérifie que le service worker généré reste synchronisé avec public/.
// Sans ces tests, un fichier oublié dans le préchargement ou une version non
// régénérée laisse une boutique bloquée sur une vieille application.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = require(path.join(root, 'scripts/cache.js'));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('public/sw.js correspond au contenu actuel de public/', () => {
  const expected = cache.build().out;
  assert.equal(read('public/sw.js'), expected, 'public/sw.js est périmé : lance `npm run cache`');
});

test('le préchargement contient tous les fichiers chargés par index.html', () => {
  const { urls } = cache.build();
  const refs = [...read('public/index.html').matchAll(/(?:src|href)="([^"#:]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.startsWith('http'));
  assert.ok(refs.length >= 5, 'index.html doit référencer ses styles et scripts');
  for (const ref of refs) assert.ok(urls.includes(`./${ref}`), `${ref} manque dans le préchargement`);
});

test('le préchargement exclut l’API et le service worker lui-même', () => {
  const { urls } = cache.build();
  assert.ok(!urls.some((u) => u.includes('/api/')), 'l’API ne doit jamais être préchargée');
  assert.ok(!urls.includes('./sw.js'), 'sw.js ne se précharge pas lui-même');
});

test('le service worker ne met pas les réponses de l’API en cache', () => {
  assert.match(read('public/sw.js'), /pathname\.startsWith\('\/api\/'\)/);
});

test('un fichier hors ligne reçoit une erreur, jamais du HTML', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /status:\s*504/);
  assert.match(sw, /request\.mode === 'navigate'/);
});

test('la version change dès qu’un fichier change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-cache-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<p>a</p>');
  fs.writeFileSync(path.join(dir, 'app.js'), 'v1');
  const first = cache.build(dir);
  fs.writeFileSync(path.join(dir, 'app.js'), 'v2');
  const second = cache.build(dir);
  assert.match(first.version, /^[0-9a-f]{10}$/);
  assert.notEqual(first.version, second.version);
  assert.ok(first.out.includes(first.version), 'la version doit être écrite dans le service worker');
  assert.ok(first.out.includes('./app.js'), 'les fichiers voisins doivent être préchargés');
});

test('le manifeste de déploiement publie public/ avec le service worker', () => {
  const manifest = JSON.parse(read('sites-manifest.json'));
  assert.equal(manifest.assetsDirectory, './public');
  assert.ok(manifest.entrypoint === 'worker.js');
  assert.ok(fs.existsSync(path.join(root, 'public/sw.js')), 'sw.js doit exister avant le déploiement');
  assert.ok(fs.existsSync(path.join(root, 'public/version.json')), 'version.json doit exister avant le déploiement');
});

test('le préchargement reste sous le budget de 1,2 Mo', () => {
  const { bytes } = cache.build();
  assert.ok(bytes < 1.2 * 1024 * 1024, `préchargement trop lourd : ${Math.round(bytes / 1024)} Ko`);
});
