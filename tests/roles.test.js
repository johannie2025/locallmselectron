'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { handlers, bcrypt, Database } = require('./_shims');
// Paire de clés de test : l'application « croit » que cette clé publique est la sienne
const KP = crypto.generateKeyPairSync('ed25519');
const TEST_PEM = KP.privateKey.export({ type: 'pkcs8', format: 'pem' });
require('../electron/licensePublicKey'); // charge le module puis remplace son export avant license.js
require.cache[require.resolve('../electron/licensePublicKey')].exports = KP.publicKey.export({ type: 'spki', format: 'pem' });
const { openDb, migrate, ensureSuperadmin } = require('../electron/db');
const license = require('../electron/license');

const E = path.join(__dirname, '..', 'electron');

test('migration v3 : anciens comptes conservés (admin → admin du centre), progression intacte, superadmin créé', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(E, 'schema.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(E, 'schema_v2.sql'), 'utf8'));
  db.pragma('user_version = 2');
  db.pragma('foreign_keys = ON');
  db.prepare("INSERT INTO users(username,password_hash,role,created_at) VALUES('boss','x','admin',1)").run();
  db.prepare("INSERT INTO users(username,password_hash,role,created_at) VALUES('eve','x','student',1)").run();
  db.prepare("INSERT INTO progress(user_id,item_id,percent,updated_at) VALUES(2,'c/m/a.mp4',50,1)").run();
  migrate(db);
  ensureSuperadmin(db);
  assert.strictEqual(db.pragma('user_version', { simple: true }), 3);
  assert.deepStrictEqual(db.prepare('SELECT username,role FROM users ORDER BY id').all().map((r) => `${r.username}:${r.role}`), ['boss:admin', 'eve:student', 'superadmin:superadmin']);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM progress').get().c, 1, 'la migration ne doit pas supprimer la progression (cascade)');
  assert.doesNotThrow(() => db.prepare("INSERT INTO users(username,password_hash,role,created_at) VALUES('t','x','trainer',1)").run());
  assert.throws(() => db.prepare("INSERT INTO users(username,password_hash,role,created_at) VALUES('r','x','root',1)").run());
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM sqlite_master WHERE name=?').get('idx_users_class').c, 1);
  migrate(db); ensureSuperadmin(db); // idempotent
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM users WHERE role='superadmin'").get().c, 1);
});

test('premier démarrage : admin (centre) et superadmin (Wise Design) créés, mot de passe à changer', () => {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wls-')), 'a.db'));
  const rows = db.prepare('SELECT username,role,must_change_password m FROM users ORDER BY id').all();
  assert.deepStrictEqual(rows.map((r) => `${r.username}:${r.role}:${r.m}`), ['admin:admin:1', 'superadmin:superadmin:1']);
});

// ---- Matrice de permissions via les vrais handlers ----
function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wls-'));
  const root = path.join(dir, 'formations'); fs.mkdirSync(root);
  const db = openDb(path.join(dir, 'a.db'));
  license.machineInfo = () => ({ ok: true, id: 'AAAA-BBBB-CCCC-DDDD-EEEE', strength: 'hardware' });
  license.evaluate = () => ({ state: 'active', locked: false, plan: 'annual', daysLeft: 300 });
  handlers.clear();
  const { createServices } = require('../electron/ipc');
  const svc = createServices({ db, config: { courseRoot: root, dataDir: dir }, getWindow: () => null, quitApp: (m) => { boot.quit = !!m; }, setOnTop() {}, log() {}, ...extra });
  test.after(() => { svc.stop(); });
  const call = async (ch, ...a) => handlers.get(ch)({}, ...a);
  const as = async (u, p) => { await call('auth:logout'); const r = await call('auth:login', u, p); assert.ok(r.ok, `${u}: ${r.error}`); };
  return { db, call, as };
}

test('permissions : chaque profil ne gère que les profils inférieurs', async () => {
  const { call, as, db } = boot();
  await as('superadmin', 'Super@1234');
  assert.ok((await call('admin:users:create', { username: 'dir2', password: 'secret1', role: 'admin' })).ok);
  assert.ok((await call('admin:users:create', { username: 'sa2', password: 'secret1', role: 'superadmin' })).ok);

  await as('admin', 'Admin@1234');
  const list = (await call('admin:users:list')).data.map((u) => u.username);
  assert.ok(!list.includes('superadmin') && !list.includes('sa2'), 'le centre ne voit jamais Wise Design');
  assert.ok(list.includes('dir2'));
  assert.ok((await call('admin:users:create', { username: 'prof1', password: 'secret1', role: 'trainer' })).ok);
  assert.ok((await call('admin:users:create', { username: 'eleve1', password: 'secret1', role: 'student' })).ok);
  // tentative d'élévation : le rôle demandé est ramené à « student »
  await call('admin:users:create', { username: 'hack1', password: 'secret1', role: 'superadmin' });
  assert.strictEqual(db.prepare("SELECT role FROM users WHERE username='hack1'").get().role, 'student');
  const id = (n) => db.prepare('SELECT id FROM users WHERE username=?').get(n).id;
  for (const target of ['superadmin', 'sa2', 'dir2']) {
    assert.strictEqual((await call('admin:users:resetPassword', id(target), 'newpass1')).error, 'FORBIDDEN', target);
    assert.strictEqual((await call('admin:users:delete', id(target))).error, 'FORBIDDEN', target);
    assert.strictEqual((await call('admin:users:setActive', id(target), false)).error, 'FORBIDDEN', target);
    assert.strictEqual((await call('admin:users:update', id(target), { role: 'student' })).error, 'FORBIDDEN', target);
  }
  assert.strictEqual((await call('admin:users:update', id('prof1'), { role: 'admin' })).error, 'FORBIDDEN', 'pas de promotion au rang égal');
  assert.ok((await call('admin:users:resetPassword', id('prof1'), 'newpass1')).ok);
  assert.ok((await call('admin:branding:set', { centerName: 'Centre', slogan: '', primary: '#112233', secondary: '#445566' })).ok);

  await as('prof1', 'newpass1'); // (mot de passe temporaire accepté : le changement forcé est géré par l'UI)
  assert.ok((await call('admin:stats:overview')).ok, 'le formateur voit les stats');
  assert.ok((await call('admin:users:create', { username: 'eleve2', password: 'secret1', role: 'trainer' })).ok);
  assert.strictEqual(db.prepare("SELECT role FROM users WHERE username='eleve2'").get().role, 'student', 'formateur ne crée que des étudiants');
  assert.strictEqual((await call('admin:users:resetPassword', id('admin'), 'x12345')).error, 'FORBIDDEN');
  assert.strictEqual((await call('admin:users:delete', id('dir2'))).error, 'FORBIDDEN');
  for (const ch of ['admin:branding:set', 'admin:settings:set', 'admin:exit']) assert.strictEqual((await call(ch, {})).error, 'FORBIDDEN', ch);

  await as('eleve1', 'secret1');
  for (const ch of ['admin:users:list', 'admin:stats:overview', 'admin:order:get', 'admin:quiz:read', 'courses:rescan']) assert.strictEqual((await call(ch, 'x')).error, 'FORBIDDEN', ch);

  await as('superadmin', 'Super@1234');
  assert.ok((await call('admin:users:setActive', id('dir2'), false)).ok);
  assert.strictEqual((await call('admin:users:delete', id('superadmin'))).error, 'SELF_FORBIDDEN');
});

test('sortie contrôlée : maintenance (levée des restrictions Windows) avec mot de passe admin ou superadmin', async () => {
  const { call } = boot();
  let r = await call('auth:adminExit', 'admin', 'Admin@1234', true);
  assert.ok(r.ok); assert.strictEqual(boot.quit, true);
  r = await call('auth:adminExit', 'superadmin', 'Super@1234', true);
  assert.ok(r.ok); assert.strictEqual(boot.quit, true);
});

test('licence sur site : émission pour un autre poste, activation ici, clé privée jamais conservée', async () => {
  const { call, as, db } = boot();
  const MID = 'AAAA-BBBB-CCCC-DDDD-EEEE';
  const OTHER = '1111-2222-3333-4444-5555';
  // depuis l'écran verrouillé : identifiants superadmin obligatoires
  let r = await call('license:issueHere', 'admin', 'Admin@1234', TEST_PEM, { plan: 'annual' });
  assert.strictEqual(r.error, 'BAD_CREDENTIALS', "un admin de centre ne peut pas émettre");
  r = await call('license:issueHere', 'superadmin', 'mauvais', TEST_PEM, { plan: 'annual' });
  assert.strictEqual(r.error, 'BAD_CREDENTIALS');
  r = await call('license:issueHere', 'superadmin', 'Super@1234', 'nimporte quoi', { plan: 'annual' });
  assert.strictEqual(r.error, 'PEM_INVALID');
  r = await call('license:issueHere', 'superadmin', 'Super@1234', TEST_PEM, { plan: 'annual', customer: 'Centre A' });
  assert.ok(r.ok, r.error);
  const stored = db.prepare("SELECT value FROM settings WHERE key='license.key'").get();
  assert.ok(stored && JSON.parse(stored.value).startsWith('WLS1.'), 'clé de licence enregistrée');
  const dump = JSON.stringify(db.prepare('SELECT * FROM settings').all());
  assert.ok(!dump.includes('PRIVATE KEY'), 'la clé privée ne doit jamais être stockée');
  // session superadmin : génération pour un autre PC
  await as('superadmin', 'Super@1234');
  r = await call('license:issue', TEST_PEM, { machine: OTHER, plan: 'monthly', customer: 'Centre B' });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.activated, false); assert.strictEqual(r.data.machine, OTHER);
  const parsed = license.parseKey(r.data.key, KP.publicKey);
  assert.strictEqual(parsed.payload.mid, OTHER); assert.strictEqual(parsed.payload.plan, 'monthly');
  r = await call('license:issue', TEST_PEM, { machine: MID, plan: 'quarterly', activate: true });
  assert.ok(r.ok && r.data.activated);
  const wrong = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.strictEqual((await call('license:issue', wrong, { machine: OTHER, plan: 'monthly' })).error, 'KEY_MISMATCH');
  // un admin du centre ou un formateur n'a aucun accès à l'émission
  await as('admin', 'Admin@1234');
  assert.strictEqual((await call('license:issue', TEST_PEM, { machine: OTHER, plan: 'monthly' })).error, 'FORBIDDEN');
});

test('applications externes : liste blanche gérée par le centre, lancement par identifiant uniquement, liste noire', async () => {
  const EventEmitter = require('events');
  const spawned = []; const ext = [];
  const present = new Set(['C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE', 'C:\\Tools\\Code.exe']);
  const { call, as } = boot({
    platform: 'win32', exists: (p) => present.has(p),
    spawn: (exe, args, o) => { const c = new EventEmitter(); c.pid = 42; c.unref = () => {}; spawned.push({ exe, args, o }); return c; },
    onExternalApp: (x) => ext.push(x.name),
  });
  await as('admin', 'Admin@1234');
  const WORD = 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE';
  let r = await call('admin:apps:save', [{ name: 'Word', path: WORD, args: '', enabled: true, icon: '📝' }, { name: 'Code', path: 'C:\\Tools\\Code.exe', args: '--new-window "C:\\mes cours"', enabled: false }]);
  assert.ok(r.ok, r.error);
  for (const [path_, err] of [['C:\\Windows\\System32\\cmd.exe', 'APP_FORBIDDEN'], ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'APP_FORBIDDEN'], ['relatif\\x.exe', 'APP_PATH'], ['C:\\x\\script.bat', 'APP_PATH']]) {
    assert.strictEqual((await call('admin:apps:save', [{ name: 'X', path: path_, enabled: true }])).error, err, path_);
  }
  assert.strictEqual((await call('admin:apps:save', [{ name: 'Y', path: WORD, args: 'a\nb', enabled: true }])).error, 'APP_ARGS');
  assert.strictEqual((await call('admin:apps:save', [{ name: '', path: WORD, enabled: true }])).error, 'BAD_NAME');
  assert.ok((await call('admin:apps:save', [{ name: 'Word', path: WORD, enabled: true, icon: '📝' }, { name: 'Code', path: 'C:\\Tools\\Code.exe', args: '--new-window "C:\\mes cours"', enabled: false }])).ok);

  await call('admin:users:create', { username: 'etu', password: 'secret1', role: 'student' });
  await as('etu', 'secret1');
  const list = (await call('apps:list')).data;
  assert.deepStrictEqual(list.map((a) => a.name), ['Word'], 'seules les applications activées et installées sont proposées');
  assert.ok(!JSON.stringify(list).includes('Program Files'), "le chemin n'est jamais envoyé à l'étudiant");
  assert.strictEqual((await call('admin:apps:save', [])).error, 'FORBIDDEN');
  assert.strictEqual((await call('admin:apps:get')).error, 'FORBIDDEN');
  assert.strictEqual((await call('apps:launch', 'C:\\Windows\\System32\\cmd.exe')).error, 'NOT_FOUND', 'un chemin ne peut pas être lancé : seulement un id enregistré');
  assert.strictEqual((await call('apps:launch', list[0].id.replace(/./, 'z'))).error, 'NOT_FOUND');
  const code = (await (async () => { await as('admin', 'Admin@1234'); return (await call('admin:apps:get')).data.apps.find((a) => a.name === 'Code'); })());
  await as('etu', 'secret1');
  assert.strictEqual((await call('apps:launch', code.id)).error, 'NOT_FOUND', 'application désactivée');
  r = await call('apps:launch', list[0].id);
  assert.ok(r.ok, r.error);
  assert.strictEqual(spawned.length, 1); assert.strictEqual(spawned[0].exe, WORD); assert.deepStrictEqual(spawned[0].args, []);
  assert.strictEqual(spawned[0].o.detached, true); assert.strictEqual(spawned[0].o.stdio, 'ignore');
  assert.deepStrictEqual(ext, ['Word']);
  // arguments découpés sans passer par un shell
  await as('admin', 'Admin@1234');
  const apps = (await call('admin:apps:get')).data.apps.map((a) => ({ ...a, enabled: true }));
  await call('admin:apps:save', apps);
  await as('etu', 'secret1');
  const id2 = (await call('apps:list')).data.find((a) => a.name === 'Code');
  await call('apps:launch', id2.id);
  assert.deepStrictEqual(spawned[1].args, ['--new-window', 'C:\\mes cours']);
});

test('catalogue : détection des applications installées (variables %…%), liste noire cohérente', () => {
  const cat = require('../electron/appCatalog');
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', SystemRoot: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
  const present = new Set(['C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\EXCEL.EXE', 'C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Windows\\System32\\calc.exe']);
  const found = cat.detect(env, (p) => present.has(p));
  assert.deepStrictEqual(found.map((f) => f.id), ['excel', 'lo-writer', 'lo-calc', 'lo-impress', 'lo-math', 'calc']);
  assert.strictEqual(found.find((f) => f.id === 'lo-calc').args, '--calc');
  assert.deepStrictEqual(cat.splitArgs('--a "b c" d'), ['--a', 'b c', 'd']);
  for (const c of cat.CATALOG) for (const cand of c.candidates) assert.ok(!cat.DENY.has(cand.split('\\').pop().toLowerCase()), `${c.id} ne doit pas être dans la liste noire`);
});
