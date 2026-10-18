'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const preload = new Set([...read('electron/preload.js').split('new Set([')[1].split(']);')[0].matchAll(/'([^']+)'/g)].map((m) => m[1]));
const handlers = new Set([...read('electron/ipc.js').matchAll(/handle\('([^']+)'/g)].map((m) => m[1]));

test('IPC : la liste blanche du preload = les handlers de ipc.js', () => {
  assert.deepStrictEqual([...handlers].filter((c) => !preload.has(c)), [], 'handler non exposé');
  assert.deepStrictEqual([...preload].filter((c) => !handlers.has(c)), [], 'canal sans handler');
});

test('IPC : tous les api(...) de l\'interface existent', () => {
  const used = new Set();
  for (const f of walk(path.join(root, 'src')).filter((x) => /\.jsx?$/.test(x))) for (const m of read(path.relative(root, f)).matchAll(/\bapi\('([a-zA-Z:]+)'/g)) used.add(m[1]);
  assert.deepStrictEqual([...used].filter((c) => !handlers.has(c)), []);
  assert.ok(used.size > 30);
});

test('Installeur : démarrage automatique, blocage USB, dossier C:\\formations_wls', () => {
  const nsh = read('build/installer.nsh');
  assert.match(nsh, /CurrentVersion\\Run/);
  assert.match(nsh, /USBSTOR/);
  assert.match(nsh, /C:\\formations_wls/);
  assert.match(read('electron/config.js'), /C:\\\\formations_wls/);
});

test('Sécurité : pas de téléchargement, réseau coupé, clé privée jamais dans le projet', () => {
  const main = read('electron/main.js');
  assert.match(main, /will-download/);
  assert.match(main, /onBeforeRequest/);
  assert.match(read('src/pages/Player.jsx'), /nodownload/);
  assert.ok(!fs.existsSync(path.join(root, 'tools/keys')));
  assert.match(read('.gitignore'), /\*\.pem/);
});
