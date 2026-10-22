'use strict';
/**
 * Clé de maintenance (valable pour TOUS les postes) : fichier WLS-Maintenance/maintenance.json sur la clé USB de Wise Design.
 * Format  WLM1.<charge utile base64url>.<signature Ed25519 base64url>  — signé avec la même clé privée que les licences.
 * Charge utile : { v, kind:'maintenance', issued, expires, installer?: { name, sha256 } } (le hash de l'installeur est signé :
 * un installeur remplacé sur la clé est refusé). Durée maximale : 31 jours.
 */
const crypto = require('crypto');
const PUB = require('./licensePublicKey');

const MAX_MS = 31 * 24 * 3600 * 1000;

function verifyToken(text, { publicKey = PUB, now = Date.now() } = {}) {
  const m = /^WLM1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(text || '').replace(/\s+/g, ''));
  if (!m) return { error: 'TOKEN_FORMAT' };
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(m[1]), publicKey, Buffer.from(m[2], 'base64url')); } catch { ok = false; }
  if (!ok) return { error: 'TOKEN_INVALID' };
  let p;
  try { p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return { error: 'TOKEN_INVALID' }; }
  const issued = Date.parse(p.issued); const expires = Date.parse(p.expires);
  if (p.kind !== 'maintenance' || Number.isNaN(issued) || Number.isNaN(expires) || expires - issued > MAX_MS) return { error: 'TOKEN_INVALID' };
  if (now > expires) return { error: 'TOKEN_EXPIRED' };
  if (now < issued - 24 * 3600 * 1000) return { error: 'TOKEN_NOT_YET' }; // tolère un décalage d'horloge d'un jour
  return { payload: p };
}

function issueToken({ hours = 24, installer = null, privateKeyPem, publicKey = PUB, now = Date.now() }) {
  if (!(hours > 0) || hours > 24 * 31) throw new Error('BAD_DURATION');
  let priv;
  try { priv = crypto.createPrivateKey(String(privateKeyPem || '').trim()); if (priv.asymmetricKeyType !== 'ed25519') throw new Error('x'); } catch { throw new Error('PEM_INVALID'); }
  const derive = (k) => (k && k.type === 'public' ? k : crypto.createPublicKey(k)).export({ type: 'spki', format: 'der' }).toString('base64');
  if (derive(priv) !== derive(publicKey)) throw new Error('KEY_MISMATCH');
  const payload = { v: 1, kind: 'maintenance', issued: new Date(now).toISOString(), expires: new Date(now + hours * 3600 * 1000).toISOString() };
  if (installer) payload.installer = { name: String(installer.name), sha256: String(installer.sha256).toLowerCase() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(body), priv).toString('base64url');
  return { token: `WLM1.${body}.${sig}`, payload };
}

module.exports = { verifyToken, issueToken, MAX_MS };
