'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { computeExpiry, evaluate, parseKey, fingerprint, cleanPart, parseWmic, TRIAL_DAYS } = require('../electron/license');
const clockGuard = require('../electron/clockGuard');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const MID = 'AAAA-BBBB-CCCC-DDDD-EEEE';
const DAY = 86400000;
const issue = (plan, start, mid = MID, priv = privateKey) => {
  const payload = { v: 1, mid, plan, customer: 'Centre Test', issued: start, expires: computeExpiry(start, plan).toISOString() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `WLS1.${body}.${crypto.sign(null, Buffer.from(body), priv).toString('base64url')}`;
};
const ev = (key, extra = {}) => evaluate({ machine: MID, key, firstRun: Date.now(), lastSeen: 0, publicKey, ...extra });
const today = () => new Date().toISOString().slice(0, 10);

test('licence : les 4 formules donnent la bonne durée', () => {
  assert.strictEqual(computeExpiry('2026-01-15', 'monthly').toISOString().slice(0, 10), '2026-02-15');
  assert.strictEqual(computeExpiry('2026-01-15', 'quarterly').toISOString().slice(0, 10), '2026-04-15');
  assert.strictEqual(computeExpiry('2026-01-15', 'semester').toISOString().slice(0, 10), '2026-07-15');
  assert.strictEqual(computeExpiry('2026-01-15', 'annual').toISOString().slice(0, 10), '2027-01-15');
  assert.strictEqual(computeExpiry('2026-01-31', 'monthly').toISOString().slice(0, 10), '2026-02-28'); // fin de mois
  assert.throws(() => computeExpiry('2026-01-15', 'weekly'), /PLAN_UNKNOWN/);
});

test('licence : active, puis expiration → verrouillage', () => {
  const ok = ev(issue('quarterly', today()));
  assert.strictEqual(ok.state, 'active'); assert.strictEqual(ok.locked, false); assert.ok(ok.daysLeft > 85);
  const old = new Date(Date.now() - 100 * DAY).toISOString().slice(0, 10);
  const exp = ev(issue('monthly', old));
  assert.strictEqual(exp.state, 'expired'); assert.strictEqual(exp.locked, true);
});

test('licence : clé liée au poste, falsifiée ou signée par un autre → refusée', () => {
  assert.strictEqual(ev(issue('annual', today(), 'ZZZZ-BBBB-CCCC-DDDD-EEEE')).locked, true);
  const k = issue('monthly', today());
  const [h, body, sig] = k.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), plan: 'annual', expires: '2099-01-01T00:00:00.000Z' })).toString('base64url');
  assert.strictEqual(ev(`${h}.${forged}.${sig}`).state, 'invalid');
  assert.strictEqual(ev(issue('annual', today(), MID, crypto.generateKeyPairSync('ed25519').privateKey)).state, 'invalid');
  assert.strictEqual(parseKey('n-importe-quoi', publicKey).error, 'KEY_FORMAT');
});

test('licence : essai, absence de clé, retour d\'horloge', () => {
  const now = Date.now();
  assert.strictEqual(evaluate({ machine: MID, key: null, firstRun: now, lastSeen: 0, trialDays: 7, publicKey }).state, 'trial');
  assert.strictEqual(evaluate({ machine: MID, key: null, firstRun: now - 8 * DAY, lastSeen: 0, trialDays: 7, publicKey }).locked, true);
  assert.strictEqual(evaluate({ machine: MID, key: null, firstRun: now, lastSeen: 0, trialDays: 0, publicKey }).state, 'none');
  const k = issue('annual', today());
  assert.strictEqual(ev(k, { lastSeen: now + 2 * DAY }).state, 'clock'); // horloge reculée de 2 jours
  assert.strictEqual(ev(k, { lastSeen: now + 3600000 }).state, 'active'); // tolérance de 6 h
});

test('ID machine : lié au matériel — deux PC clonés (même Windows) ont des ID différents', () => {
  const guid = 'SAME-WINDOWS-IMAGE-GUID';
  const a = fingerprint({ guid, uuid: '4C4C4544-0042-5710-8052-B7C04F4A3732', board: 'BRD-1111-AAAA', bios: 'BIOS111111' });
  const b = fingerprint({ guid, uuid: '4C4C4544-0043-5810-8053-B8C04F4B3833', board: 'BRD-2222-BBBB', bios: 'BIOS222222' });
  assert.ok(a.ok && b.ok); assert.strictEqual(a.strength, 'hardware');
  assert.notStrictEqual(a.id, b.id);
  assert.match(a.id, /^([0-9A-F]{4}-){4}[0-9A-F]{4}$/);
  // stable : même matériel → même ID, quel que soit le Windows installé
  assert.strictEqual(fingerprint({ guid: 'AUTRE-WINDOWS', uuid: '4C4C4544-0042-5710-8052-B7C04F4A3732' }).id, a.id);
});

test('ID machine : une clé émise pour le PC A est refusée sur son clone B', () => {
  const A = fingerprint({ guid: 'G', uuid: '4C4C4544-0042-5710-8052-B7C04F4A3732' }).id;
  const B = fingerprint({ guid: 'G', uuid: '4C4C4544-0043-5810-8053-B8C04F4B3833' }).id;
  const key = issue('annual', today(), A);
  assert.strictEqual(evaluate({ machine: A, key, firstRun: Date.now(), lastSeen: 0, publicKey }).state, 'active');
  const onB = evaluate({ machine: B, key, firstRun: Date.now(), lastSeen: 0, publicKey });
  assert.strictEqual(onB.state, 'invalid'); assert.strictEqual(onB.locked, true);
});

test('ID machine : valeurs génériques des constructeurs ignorées, repli faible sur Windows, échec de lecture', () => {
  for (const junk of ['To Be Filled By O.E.M.', 'Default string', 'None', '00000000-0000-0000-0000-000000000000', 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', '123456789', '', null]) assert.strictEqual(cleanPart(junk), '', String(junk));
  const weak = fingerprint({ guid: 'WIN-GUID-1234', uuid: 'Default string', board: 'None', bios: '0' });
  assert.strictEqual(weak.ok, true); assert.strictEqual(weak.strength, 'os');
  assert.strictEqual(fingerprint({ ok: false }).ok, false);
  assert.strictEqual(fingerprint({}).ok, false);
  assert.strictEqual(parseWmic('\r\nUUID=ABCDEF12-3456\r\n\r\n', 'UUID'), 'ABCDEF12-3456');
});

test('licence : aucun essai gratuit, non configurable', () => {
  assert.strictEqual(TRIAL_DAYS, 0);
  assert.strictEqual(evaluate({ machine: MID, key: null, firstRun: Date.now(), lastSeen: 0, publicKey }).locked, true); // PC sans clé = verrouillé
});

test('clockGuard : valeur signée par poste, falsification et copie depuis un autre PC ignorées', () => {
  const ts = Date.now();
  const v = clockGuard.pack(ts, MID);
  assert.strictEqual(clockGuard.unpack(v, MID), ts);
  assert.strictEqual(clockGuard.unpack(v, 'AUTRE-PC'), 0);
  assert.strictEqual(clockGuard.unpack(v.replace(String(ts), String(ts - 1e9)), MID), 0);
  assert.strictEqual(clockGuard.unpack('n-importe-quoi', MID), 0);
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
  assert.strictEqual(clockGuard.readSeen(dir, MID), 0);
  clockGuard.writeSeen(dir, MID, ts);
  assert.strictEqual(clockGuard.readSeen(dir, MID), ts);
  assert.strictEqual(clockGuard.readSeen(dir, 'AUTRE-PC'), 0);
});
