'use strict';
// Test d'intégration du mode serveur / client : vrai serveur HTTP sur 127.0.0.1, vrais clients, sessions simultanées.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handlers } = require('./_shims');
const { openDb } = require('../electron/db');
const license = require('../electron/license');
const { createNetStore, normalizeAddress } = require('../electron/netStore');
const { startNetServer } = require('../electron/netServer');
const { createNetClient, pairWithServer } = require('../electron/netClient');
const { createServices } = require('../electron/ipc');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
license.machineInfo = () => ({ ok: true, id: 'AAAA-BBBB-CCCC-DDDD-EEEE', strength: 'hardware' });
license.evaluate = () => ({ state: 'active', locked: false, plan: 'annual', daysLeft: 300 });

function mkServices(dir, root, extra = {}) {
  handlers.clear();
  const db = openDb(path.join(dir, 'lms.sqlite'));
  const quits = [];
  const svc = createServices({ db, config: { courseRoot: root, dataDir: dir }, getWindow: () => null, quitApp: (m) => quits.push(!!m), setOnTop() {}, log() {}, ...extra });
  test.after(() => svc.stop());
  const h = new Map(handlers);
  const call = async (ch, ...a) => h.get(ch)({}, ...a);
  return { svc, call, quits, db };
}

test('mode serveur/client : jumelage, sessions séparées, médias en streaming, isolation, révocation, repli hors-ligne', async () => {
  // ---- cours du serveur
  const root = tmp('wls-courses-');
  const mod = path.join(root, 'Anglais_A1', 'Module_01'); fs.mkdirSync(mod, { recursive: true });
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
  fs.writeFileSync(path.join(mod, 'intro.mp4'), bytes);
  fs.writeFileSync(path.join(mod, 'doc.pdf'), Buffer.from('%PDF-1.4 test'));
  const root2 = path.join(root, 'Maths_L1', 'Module_01'); fs.mkdirSync(root2, { recursive: true });
  fs.writeFileSync(path.join(root2, 'a.mp4'), bytes);

  // ---- serveur
  const sDir = tmp('wls-srv-');
  const sStore = createNetStore(sDir); sStore.update({ mode: 'server', port: 0, name: 'Serveur test' });
  const S = mkServices(sDir, root, { net: { store: sStore } });
  const srv = startNetServer({ store: sStore, dispatch: S.svc.dispatch, newHolder: S.svc.newHolder, mediaPath: S.svc.mediaPath, treeVersion: S.svc.treeVersion, port: 0, name: 'Serveur test', version: 't' });
  test.after(() => srv.close());
  await new Promise((r) => (srv.server.listening ? r() : srv.server.once('listening', r)));
  const addr = `127.0.0.1:${srv.server.address().port}`;
  assert.strictEqual(normalizeAddress('http://192.168.1.5/'), '192.168.1.5:47800');
  assert.strictEqual(normalizeAddress('pc-prof:50000'), 'pc-prof:50000');
  assert.strictEqual(normalizeAddress('a b'), null); assert.strictEqual(normalizeAddress('x:80'), null);

  assert.ok((await S.call('auth:login', 'superadmin', 'Super@1234')).ok);
  let r = await S.call('net:newPairCode');
  assert.ok(r.ok && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.data.code), r.error);
  const code1 = r.data.code;
  assert.ok(!fs.readFileSync(path.join(sDir, 'net.json'), 'utf8').includes(code1.replace('-', '')), 'le code de jumelage ne doit pas être stocké en clair');

  // ---- jumelage : mauvais code, puis bon code (usage unique)
  await assert.rejects(() => pairWithServer(addr, 'AAAA-BBBB', 'PC-X'), /BAD_PAIR_CODE/);
  await assert.rejects(() => pairWithServer('pas une adresse', code1, 'PC-X'), /BAD_ADDRESS/);
  const cDirA = tmp('wls-cli-a-');
  const cStoreA = createNetStore(cDirA);
  const A0 = mkServices(cDirA, tmp('wls-nocourses-'), { net: { store: cStoreA } }); // poste encore autonome
  assert.ok((await A0.call('auth:login', 'superadmin', 'Super@1234')).ok);
  r = await A0.call('net:pair', { server: addr, code: code1, name: 'PC-01' });
  assert.ok(r.ok, r.error); assert.strictEqual(cStoreA.get().mode, 'client'); assert.ok(cStoreA.get().token.length === 64);
  await assert.rejects(() => pairWithServer(addr, code1, 'PC-02'), /BAD_PAIR_CODE/, 'un code ne sert qu\'une fois');
  assert.ok(!JSON.stringify(sStore.get()).includes(cStoreA.get().token), 'le serveur ne stocke que l\'empreinte du jeton');

  // second poste client
  r = await S.call('net:newPairCode'); const code2 = r.data.code;
  const cDirB = tmp('wls-cli-b-'); const cStoreB = createNetStore(cDirB);
  const pb = await pairWithServer(addr, code2, 'PC-02'); cStoreB.update({ mode: 'client', server: pb.server, token: pb.token, name: 'PC-02' });

  // ---- postes clients en mode client (nouvelle instance après « redémarrage »)
  const clientA = createNetClient({ store: cStoreA, bootId: 'boot-A1' });
  const clientB = createNetClient({ store: cStoreB, bootId: 'boot-B1' });
  const A = mkServices(cDirA, tmp('wls-nocourses-'), { net: { store: cStoreA, client: clientA } });
  const B = mkServices(cDirB, tmp('wls-nocourses-'), { net: { store: cStoreB, client: clientB } });

  // admin du centre sur A, étudiant sur B : sessions simultanées et séparées côté serveur
  assert.ok((await S.call('auth:login', 'admin', 'Admin@1234')).ok);
  await S.call('admin:users:create', { username: 'etu', password: 'secret1', role: 'student' });
  await S.call('auth:logout');
  const [la, lb] = await Promise.all([A.call('auth:login', 'admin', 'Admin@1234'), B.call('auth:login', 'etu', 'secret1')]);
  assert.ok(la.ok && lb.ok, `${la.error} ${lb.error}`);
  const [ma, mb] = await Promise.all([A.call('auth:me'), B.call('auth:me')]);
  assert.strictEqual(ma.data.username, 'admin'); assert.strictEqual(mb.data.username, 'etu');
  assert.strictEqual((await B.call('admin:users:list')).error, 'FORBIDDEN', 'les droits du serveur s\'appliquent au poste client');
  assert.ok((await A.call('admin:users:list')).ok);
  assert.strictEqual((await S.call('auth:me')).data, null, 'la session du serveur lui-même n\'est pas touchée par celles des clients');

  // inscription de l'étudiant à UN cours depuis le poste A, visible sur le poste B
  const uid = (await A.call('admin:users:list')).data.find((u) => u.username === 'etu').id;
  assert.ok((await A.call('admin:enroll:setUser', uid, ['Anglais_A1'])).ok);
  const view = (await B.call('courses:list')).data;
  assert.deepStrictEqual(view.courses.map((c) => c.id), ['Anglais_A1']);
  const pdfId = view.courses[0].modules[0].items.find((i) => i.type === 'pdf').id;
  const pdf = await B.call('media:readPdf', pdfId);
  assert.ok(pdf.ok && pdf.data instanceof Uint8Array && Buffer.from(pdf.data).toString() === '%PDF-1.4 test', 'les Buffers traversent le réseau');

  // ---- leçons en séquence : la vidéo reste verrouillée (403) tant que la leçon précédente n'est pas terminée
  const mod0 = view.courses[0].modules[0];
  const vid = mod0.items.find((i) => i.type === 'video');
  const before = mod0.items.slice(0, mod0.items.indexOf(vid)).filter((i) => i.required);
  if (before.length) {
    assert.strictEqual((await clientB.media(vid.id)).status, 403, 'leçon verrouillée');
    assert.strictEqual((await B.call('progress:update', { itemId: vid.id, percent: 50, positionSec: 1 })).error, 'LESSON_LOCKED');
    for (const p of before) assert.ok((await B.call('progress:update', { itemId: p.id, percent: 100, positionSec: 0 })).ok);
  }

  // ---- streaming média avec Range (seek vidéo), contrôle d'inscription
  let m = await clientB.media('Anglais_A1/Module_01/intro.mp4', 'bytes=100-199');
  assert.strictEqual(m.status, 206); assert.strictEqual(m.headers.get('content-range'), 'bytes 100-199/1000'); assert.strictEqual(m.headers.get('content-type'), 'video/mp4');
  assert.deepStrictEqual(Buffer.from(await m.arrayBuffer()), bytes.subarray(100, 200));
  m = await clientB.media('Anglais_A1/Module_01/intro.mp4');
  assert.strictEqual(m.status, 200); assert.strictEqual(Buffer.from(await m.arrayBuffer()).length, 1000);
  m = await clientB.media('Anglais_A1/Module_01/intro.mp4', 'bytes=-50');
  assert.strictEqual(Buffer.from(await m.arrayBuffer()).length, 50);
  m = await clientB.media('Anglais_A1/Module_01/intro.mp4', 'bytes=5000-6000'); assert.strictEqual(m.status, 416);
  assert.strictEqual((await clientB.media('Maths_L1/Module_01/a.mp4')).status, 403, 'cours non inscrit');
  assert.strictEqual((await clientB.media('../../../etc/passwd')).status, 403);
  assert.strictEqual((await clientA.media('Maths_L1/Module_01/a.mp4')).status, 200, 'le formateur/admin voit tout');

  // ---- canaux « poste » : jamais exécutables à distance
  const raw = (p, init = {}) => fetch(`http://${addr}${p}`, init);
  const rpc = async (token, channel, args = [], boot = 'boot-A1') => (await raw('/wls/rpc', { method: 'POST', headers: { 'X-WLS-Token': token, 'X-WLS-Boot': boot, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, args }) })).json();
  for (const ch of ['license:status', 'license:activate', 'print:pdf', 'admin:exit', 'auth:adminExit', 'apps:launch', 'system:power', 'net:getConfig', 'net:setMode']) {
    assert.strictEqual((await rpc(cStoreA.get().token, ch, [])).error, 'FORBIDDEN', ch);
  }
  assert.strictEqual((await rpc('0'.repeat(64), 'courses:list')).error, 'NET_UNPAIRED');
  assert.strictEqual((await raw('/wls/state')).status, 401);
  assert.strictEqual((await (await raw('/wls/ping')).json()).name, 'Serveur test');
  assert.strictEqual((await rpc(cStoreA.get().token, 'canal:inconnu')).error, 'NOT_FOUND');
  assert.strictEqual((await raw('/wls/rpc', { method: 'POST', headers: { 'X-WLS-Token': cStoreA.get().token, 'X-WLS-Boot': 'boot-A1' }, body: '{pas du json' })).status, 400);

  // ---- redémarrage du client : la session du serveur est réinitialisée (nouveau bootId)
  const clientA2 = createNetClient({ store: cStoreA, bootId: 'boot-A2' });
  assert.strictEqual((await clientA.call('auth:me')).data.username, 'admin');
  assert.strictEqual((await clientA2.call('auth:me')).data, null);

  // ---- notification de changement de cours (sondage de version)
  assert.ok((await A.call('auth:login', 'admin', 'Admin@1234')).ok); // (la simulation de redémarrage ci-dessus a fermé la session)
  const v1 = (await clientA.state()).treeVersion;
  assert.ok((await A.call('courses:rescan')).ok);
  assert.ok((await clientA.state()).treeVersion > v1);

  // ---- sortie du kiosque d'un poste client : le serveur vérifie les comptes admin
  assert.ok((await B.call('auth:adminExit', 'admin', 'Admin@1234', true)).ok); assert.deepStrictEqual(B.quits, [true], 'admin : maintenance autorisée avec mot de passe');
  assert.strictEqual((await B.call('auth:adminExit', 'etu', 'secret1', false)).error, 'BAD_CREDENTIALS', 'un étudiant ne sort pas');
  assert.strictEqual((await B.call('auth:adminExit', 'admin', 'faux', false)).error, 'BAD_CREDENTIALS');
  assert.ok((await B.call('auth:adminExit', 'superadmin', 'Super@1234', true)).ok); assert.deepStrictEqual(B.quits, [true, true]);

  // ---- révocation d'un poste
  const id = sStore.get().clients.find((c) => c.name === 'PC-02').id;
  assert.ok((await S.call('auth:login', 'superadmin', 'Super@1234')).ok);
  assert.strictEqual(((await S.call('net:revokeClient', id)).data.clients).length, 1);
  assert.strictEqual((await B.call('courses:list')).error, 'NET_UNPAIRED');

  // ---- serveur injoignable : message clair ; sortie possible seulement par le superadmin LOCAL du poste
  await srv.close();
  assert.strictEqual((await A.call('courses:list')).error, 'SERVER_UNREACHABLE');
  assert.strictEqual((await A.call('auth:adminExit', 'admin', 'Admin@1234', false)).error, 'BAD_CREDENTIALS', 'repli : pas d\'admin du centre hors-ligne');
  assert.ok((await A.call('auth:adminExit', 'superadmin', 'Super@1234', true)).ok);
  assert.deepStrictEqual(A.quits, [true]);
});

test('jumelage : 5 essais ratés depuis la même adresse → blocage temporaire', async () => {
  const dir = tmp('wls-srv2-');
  const store = createNetStore(dir); store.update({ mode: 'server', port: 0 }); store.newPairCode();
  const srv = startNetServer({ store, dispatch: async () => ({ ok: true }), newHolder: () => ({}), mediaPath: () => null, treeVersion: () => 1, port: 0 });
  test.after(() => srv.close());
  await new Promise((r) => (srv.server.listening ? r() : srv.server.once('listening', r)));
  const addr = `127.0.0.1:${srv.server.address().port}`;
  for (let i = 0; i < 5; i += 1) await assert.rejects(() => pairWithServer(addr, 'ZZZZ-ZZZZ', 'x'), /BAD_PAIR_CODE/);
  await assert.rejects(() => pairWithServer(addr, store.get().pairHash ? 'AAAA-AAAA' : 'x', 'x'), /TOO_MANY_ATTEMPTS/);
});

test('code de jumelage : expire après 15 minutes', () => {
  const store = createNetStore(tmp('wls-exp-'));
  const code = store.newPairCode();
  assert.ok(store.checkPairCode(code.toLowerCase().replace('-', ' ')));
  store.update({ pairExpires: Date.now() - 1 });
  assert.ok(!store.checkPairCode(code));
});
