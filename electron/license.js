'use strict';
/**
 * Licence par poste (hors-ligne, signée Ed25519).
 *
 *  - Chaque PC a un « ID machine » dérivé de son MATÉRIEL (UUID SMBIOS de la carte mère, à défaut n° de série
 *    carte mère / BIOS). Deux PC clonés depuis la même image Windows ont donc des ID DIFFÉRENTS.
 *    Repli « faible » sur le MachineGuid Windows seulement si le PC n'expose aucun identifiant matériel valide
 *    (signalé à l'administrateur : les clones de tels PC partageraient le même ID).
 *  - Wise Design émet une clé  WLS1.<charge utile base64url>.<signature base64url>  liée à cet ID,
 *    avec un plan (monthly | quarterly | semester | annual) et une date d'expiration ABSOLUE signée.
 *  - L'application ne contient que la clé PUBLIQUE (licensePublicKey.js) : elle peut vérifier
 *    mais pas fabriquer de clés. La clé privée reste chez l'émetteur (tools/license-keygen.js).
 *  - Copier l'exe (ou tout le dossier d'installation + les données) sur un autre PC ne sert à rien : la clé porte
 *    l'ID du PC d'origine → refusée. Aucun essai gratuit (TRIAL_DAYS = 0) : un PC sans clé est verrouillé.
 *  - Anti-retour d'horloge : la dernière date vue est mémorisée à 3 endroits (voir clockGuard.js) ;
 *    si l'horloge recule de plus de 6 h → verrouillage.
 */
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');

let PUB = null;
try { PUB = require('./licensePublicKey'); } catch { /* absente avant `license-keygen init` */ }

const PLAN_MONTHS = { monthly: 1, quarterly: 3, semester: 6, annual: 12 };
const DAY = 86400000;
// Constante volontairement NON configurable depuis un fichier : sinon « trialDays: 999 » dans lms-config.json contournerait la licence.
const TRIAL_DAYS = 0;

// ---------- Identifiant du poste ----------
const JUNK = new Set([
  'NONE', 'NULL', 'UNKNOWN', 'DEFAULTSTRING', 'TOBEFILLEDBYO.E.M.', 'TOBEFILLEDBYOEM', 'O.E.M.', 'OEM', 'SYSTEMSERIALNUMBER',
  'BASEBOARDSERIALNUMBER', 'CHASSISSERIALNUMBER', 'NOTSPECIFIED', 'NOTAPPLICABLE', 'N/A', 'SERIALNUMBER',
  '0123456789', '123456789', '1234567890', '0123456789ABCDEF',
]);

/** Valeur d'identifiant matériel exploitable, sinon '' (valeurs génériques des constructeurs, 0000…, FFFF…). */
function cleanPart(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  const c = s.replace(/[\s-]/g, '');
  if (c.length < 6 || JUNK.has(c) || /^(.)\1+$/.test(c)) return '';
  return s;
}

/**
 * parts : { guid, uuid, board, bios } (ou { ok:false } si la lecture a échoué).
 * Priorité : UUID SMBIOS > n° de carte mère > n° de BIOS > MachineGuid Windows (faible).
 */
function fingerprint(parts) {
  if (!parts || parts.ok === false) return { ok: false };
  const hw = [['U', parts.uuid], ['B', parts.board], ['S', parts.bios]].map(([k, v]) => [k, cleanPart(v)]).find(([, v]) => v);
  const guid = String(parts.guid || '').trim().toUpperCase();
  let raw; let strength;
  if (hw) { raw = `WLS2|HW|${hw[0]}|${hw[1]}`; strength = 'hardware'; }
  else if (guid) { raw = `WLS2|OS|${guid}`; strength = 'os'; }
  else return { ok: false };
  const h = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20).toUpperCase();
  return { ok: true, id: h.match(/.{4}/g).join('-'), strength };
}

const parseWmic = (out, field) => { const m = new RegExp(`${field}=([^\\r\\n]*)`, 'i').exec(String(out || '')); return m ? m[1].trim() : ''; };

/** Lecture Windows : PowerShell/CIM, puis wmic en repli. Retourne { ok:false } si aucune lecture n'aboutit. */
function readWindowsHardware() {
  const opts = { windowsHide: true, timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  let guid = '';
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], opts);
    const m = out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
    if (m) guid = m[1];
  } catch { /* ignoré */ }
  try {
    const ps = "$ErrorActionPreference='Stop';$c=(Get-CimInstance Win32_ComputerSystemProduct).UUID;$b=(Get-CimInstance Win32_BaseBoard).SerialNumber;$s=(Get-CimInstance Win32_BIOS).SerialNumber;($c,$b,$s) -join '|'";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], opts).trim();
    if (out.includes('|')) { const [uuid = '', board = '', bios = ''] = out.split('|'); return { ok: true, guid, uuid, board, bios }; }
  } catch { /* repli wmic */ }
  try {
    const w = (args, field) => parseWmic(execFileSync('wmic', [...args, '/value'], opts), field);
    return { ok: true, guid, uuid: w(['csproduct', 'get', 'uuid'], 'UUID'), board: w(['baseboard', 'get', 'serialnumber'], 'SerialNumber'), bios: w(['bios', 'get', 'serialnumber'], 'SerialNumber') };
  } catch { /* échec total */ }
  return { ok: false };
}

let cached = null;
let failedAt = 0;
/**
 * { ok, id, strength }. Un résultat réussi est mis en cache pour la durée du processus ; un échec de lecture
 * n'est PAS mis en cache (nouvelle tentative après 60 s) pour ne jamais verrouiller durablement un poste licencié.
 */
function machineInfo() {
  if (cached) return cached;
  if (failedAt && Date.now() - failedAt < 60000) return { ok: false, id: '', strength: null };
  const r = process.platform === 'win32'
    ? fingerprint(readWindowsHardware())
    : fingerprint({ guid: [os.hostname(), (os.cpus()[0] || {}).model || '', os.platform(), os.arch()].join('|') }); // dev / Linux : faible
  if (!r.ok) { failedAt = Date.now(); return { ok: false, id: '', strength: null }; }
  failedAt = 0;
  cached = r;
  return cached;
}
const machineId = () => machineInfo().id;

// ---------- Clés ----------
/** Date d'expiration = début + N mois, fin de journée UTC (le 31 janvier + 1 mois → 28/29 février). */
function computeExpiry(startISO, plan) {
  const months = PLAN_MONTHS[plan];
  if (!months) throw new Error('PLAN_UNKNOWN');
  const d = new Date(`${startISO}T23:59:59.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error('DATE_INVALID');
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

function parseKey(key, publicKey = PUB) {
  const m = /^WLS1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(key || '').replace(/\s+/g, ''));
  if (!m) return { error: 'KEY_FORMAT' };
  if (!publicKey) return { error: 'KEY_INVALID' };
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(m[1]), publicKey, Buffer.from(m[2], 'base64url')); } catch { ok = false; }
  if (!ok) return { error: 'KEY_INVALID' };
  try {
    const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    if (!PLAN_MONTHS[payload.plan] || Number.isNaN(Date.parse(payload.expires))) return { error: 'KEY_INVALID' };
    return { payload };
  } catch { return { error: 'KEY_INVALID' }; }
}

function verifyKey(key, machine, publicKey = PUB) {
  const r = parseKey(key, publicKey);
  if (r.error) return r;
  if (r.payload.mid !== machine) return { error: 'KEY_OTHER_MACHINE' };
  return r;
}

/** Évalue l'état de la licence. state : active | expired | trial | trial_expired | none | invalid | clock */
function evaluate({ machine, key, firstRun, lastSeen, trialDays = TRIAL_DAYS, now = Date.now(), publicKey = PUB }) {
  const base = { machineId: machine, plan: null, expiresAt: null, daysLeft: null, customer: null, locked: false, state: 'none' };
  if (lastSeen && now < lastSeen - 6 * 3600 * 1000) return { ...base, state: 'clock', locked: true };
  if (key) {
    const r = verifyKey(key, machine, publicKey);
    if (!r.payload) return { ...base, state: 'invalid', locked: true };
    const exp = Date.parse(r.payload.expires);
    return { ...base, plan: r.payload.plan, customer: r.payload.customer || null, expiresAt: exp, daysLeft: Math.ceil((exp - now) / DAY), state: exp > now ? 'active' : 'expired', locked: exp <= now };
  }
  if (trialDays > 0 && firstRun) {
    const exp = firstRun + trialDays * DAY;
    return { ...base, plan: 'trial', expiresAt: exp, daysLeft: Math.ceil((exp - now) / DAY), state: exp > now ? 'trial' : 'trial_expired', locked: exp <= now };
  }
  return { ...base, state: 'none', locked: true };
}

module.exports = { machineId, machineInfo, fingerprint, cleanPart, parseWmic, computeExpiry, parseKey, verifyKey, evaluate, PLAN_MONTHS, TRIAL_DAYS };
