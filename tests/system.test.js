'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handlers } = require('./_shims');
const { openDb } = require('../electron/db');
const license = require('../electron/license');
const { loadConfig } = require('../electron/config');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('version portable : données et cours à côté de l\'exécutable, ni kiosque ni restrictions par défaut, config surchargeable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wls-portable-'));
  const app = { isPackaged: true, getPath: () => path.join(dir, 'userData') };
  const saved = { P: process.env.PORTABLE_EXECUTABLE_DIR, C: process.env.LMS_CONFIG };
  try {
    process.env.PORTABLE_EXECUTABLE_DIR = dir; delete process.env.LMS_CONFIG;
    let c = loadConfig(app);
    assert.strictEqual(c.portable, true);
    assert.strictEqual(c.dataDir, path.join(dir, 'WLS-Data'));
    assert.strictEqual(c.courseRoot, path.join(dir, 'formations_wls'));
    assert.strictEqual(c.kiosk, false); assert.strictEqual(c.lockdown, 'off');
    fs.writeFileSync(path.join(dir, 'lms-config.json'), JSON.stringify({ kiosk: true, courseRoot: 'D:\\cours' }));
    c = loadConfig(app);
    assert.strictEqual(c.kiosk, true); assert.strictEqual(c.courseRoot, 'D:\\cours'); assert.strictEqual(c.lockdown, 'off');
    fs.unlinkSync(path.join(dir, 'lms-config.json'));
    delete process.env.PORTABLE_EXECUTABLE_DIR;
    c = loadConfig(app);
    assert.strictEqual(c.portable, false); assert.strictEqual(c.kiosk, true); assert.strictEqual(c.courseRoot, 'C:\\formations_wls');
  } finally {
    for (const [k, v] of [['PORTABLE_EXECUTABLE_DIR', saved.P], ['LMS_CONFIG', saved.C]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('alimentation : seules 3 actions, utilisables même quand la licence est verrouillée (écran de verrouillage)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wls-'));
  const root2 = path.join(dir, 'f'); fs.mkdirSync(root2);
  const db = openDb(path.join(dir, 'a.db'));
  license.machineInfo = () => ({ ok: true, id: 'AAAA-BBBB-CCCC-DDDD-EEEE', strength: 'hardware' });
  license.evaluate = () => ({ state: 'expired', locked: true });
  handlers.clear();
  const calls = [];
  const svc = require('../electron/ipc').createServices({
    db, config: { courseRoot: root2, dataDir: dir }, getWindow: () => null, quitApp() {}, setOnTop() {}, log() {},
    sysInfo: () => ({ platform: 'win32', shell: true, kiosk: true, portable: false, winUser: 'eleve01' }), power: (a) => { calls.push(a); return true; },
  });
  test.after(() => svc.stop());
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  assert.deepStrictEqual((await call('system:info')).data.shell, true);
  for (const a of ['logoff', 'restart', 'shutdown']) assert.ok((await call('system:power', a)).ok, a);
  for (const bad of ['', 'hibernate', 'logoff; calc', null, '../../x']) assert.strictEqual((await call('system:power', bad)).error, 'BAD_ACTION', String(bad));
  assert.deepStrictEqual(calls, ['logoff', 'restart', 'shutdown']);
  assert.strictEqual((await call('courses:list')).error, 'LICENSE_LOCKED', 'le reste reste verrouillé');
});

test('paquets Windows : cibles installeur + portable, scripts cybercafé cohérents avec main.js', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepStrictEqual(pkg.build.win.target.map((t) => t.target).sort(), ['nsis', 'portable']);
  assert.match(pkg.build.portable.artifactName, /Portable/);
  assert.ok(pkg.build.extraResources.some((r) => r.from === 'scripts' && r.to === 'scripts'));
  const main = read('electron/main.js');
  assert.match(main, /process\.argv\.includes\('--shell'\)/);
  const ps = read('scripts/Comptes-Windows.ps1');
  assert.ok(ps.includes('--shell'), 'le script pose le même argument que celui que lit main.js');
  assert.ok(ps.includes('Winlogon') && ps.includes("'Shell'"));
  assert.ok(ps.includes('S-1-5-32-544'), 'refus des comptes administrateurs');
  for (const f of ['scripts/Comptes-Windows.ps1', 'scripts/Mode-Cybercafe.cmd']) assert.ok(!/[^\x00-\x7f]/.test(read(f)), `${f} doit rester en ASCII (PowerShell 5.1 / cmd)`);
  const nsh = read('build/installer.nsh');
  assert.ok(nsh.includes('resources\\scripts\\Mode-Cybercafe.cmd'));
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'Mode-Cybercafe.cmd')));
  // en mode shell : quitter = fermer la session, maintenance = ouvrir explorer.exe
  assert.ok(main.includes("spawn('explorer.exe'") && main.includes("'/l'"));
  // l'extinction ne doit pas être bloquée par la fermeture annulée du kiosque
  assert.match(main, /power: \(action\) => [\s\S]*allowQuit = true/);
  // USB : tâche planifiée SYSTEM + script dans resources (non modifiable par les utilisateurs), drapeau côté application
  assert.ok(nsh.includes('WLS-USB-Policy') && nsh.includes('wls-usb-policy.ps1'));
  assert.ok(read('scripts/wls-usb-policy.ps1').includes('usb.unlock') && read('electron/winLockdown.js').includes('usb.unlock'));
  assert.ok(!/[^\x00-\x7f]/.test(read('scripts/wls-usb-policy.ps1')));
  assert.match(main, /session-end/);
});

test('PowerPoint : conversion PDF en cache, erreur claire sans convertisseur ; garde-clavier kiosque', async () => {
  const os = require('os');
  const { convert } = require('../electron/pptxConvert');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-'));
  const f = path.join(dir, 'cours.pptx'); fs.writeFileSync(f, 'x');
  await assert.rejects(convert(f, { platform: 'linux' }), /PPTX_NO_CONVERTER/);
  const st = fs.statSync(f);
  fs.mkdirSync(path.join(dir, '.wls-cache'));
  const cached = path.join(dir, '.wls-cache', `cours-${st.size}-${Math.round(st.mtimeMs)}.pdf`); fs.writeFileSync(cached, '%PDF');
  assert.strictEqual(await convert(f, { platform: 'linux' }), cached, 'le PDF en cache est réutilisé');
  const g = read('scripts/wls-keyguard.ps1');
  assert.ok(!/[^\x00-\x7f]/.test(g) && g.includes('Shell_TrayWnd') && g.includes('0x5B') && g.includes('0x09'));
  assert.ok(read('electron/main.js').includes('wls-keyguard.ps1'));
});

test('clé de maintenance : signature, expiration, durée max, falsification, hash installeur signé', () => {
  const crypto = require('crypto');
  const { issueToken, verifyToken } = require('../electron/maintenanceKey');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const now = Date.parse('2026-10-21T12:00:00Z');
  const { token, payload } = issueToken({ hours: 24, installer: { name: 'Setup.exe', sha256: 'AB'.repeat(32) }, privateKeyPem: pem, publicKey, now });
  assert.strictEqual(payload.installer.sha256, 'ab'.repeat(32));
  assert.ok(verifyToken(token, { publicKey, now: now + 3600e3 }).payload, 'valable pour tous les postes (aucun identifiant de poste)');
  assert.strictEqual(verifyToken(token, { publicKey, now: now + 25 * 3600e3 }).error, 'TOKEN_EXPIRED');
  const parts = token.split('.');
  const forged = JSON.parse(Buffer.from(parts[1], 'base64url')); forged.expires = '2030-01-01T00:00:00.000Z';
  assert.strictEqual(verifyToken(`WLM1.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${parts[2]}`, { publicKey, now }).error, 'TOKEN_INVALID');
  assert.strictEqual(verifyToken('n importe quoi', { publicKey, now }).error, 'TOKEN_FORMAT');
  const other = crypto.generateKeyPairSync('ed25519').publicKey;
  assert.strictEqual(verifyToken(token, { publicKey: other, now }).error, 'TOKEN_INVALID', 'autre clé publique');
  assert.throws(() => issueToken({ hours: 24 * 40, privateKeyPem: pem, publicKey }), /BAD_DURATION/);
  assert.throws(() => issueToken({ hours: 1, privateKeyPem: crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey }), /KEY_MISMATCH/);
  // installeur : shell Winlogon, tâche SYSTEM, scripts ASCII, drapeau dans un dossier protégé
  const nsh = read('build/installer.nsh');
  assert.ok(nsh.includes('Winlogon') && nsh.includes('--shell') && nsh.includes('explorer.exe'), 'bureau remplacé puis rétabli');
  for (const f of ['scripts/wls-usb-policy.ps1', 'scripts/Identifier-Ma-Cle.ps1', 'scripts/Identifier-Ma-Cle.cmd', 'scripts/Restaurer-Bureau.cmd', 'scripts/allowed-usb.txt']) assert.ok(!/[^\x00-\x7f]/.test(read(f)), `${f} en ASCII`);
  const ps = read('scripts/wls-usb-policy.ps1');
  assert.ok(ps.includes('Winlogon') && ps.includes('explorer.exe'), 'maintenance : bureau restauré par la tâche SYSTEM');
  assert.ok(ps.includes("--verify-maintenance") && ps.includes('sys') && ps.includes('S-1-5-32-545:(OI)(CI)RX') && ps.includes('sha256'));
  assert.ok(read('electron/main.js').includes('--verify-maintenance') && read('electron/main.js').includes('maintenance.on'));
});
