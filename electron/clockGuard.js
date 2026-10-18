'use strict';
/**
 * Mémoire de la « dernière date vue », stockée à TROIS endroits indépendants :
 *   1. la base SQLite (réglage license.lastSeen) — gérée par ipc.js
 *   2. un fichier caché  <dataDir>\.wls-seen
 *   3. le registre  HKCU\Software\WiseDesignLMS\Seen
 * Chaque valeur est signée (HMAC lié à l'ID du poste) : une valeur recopiée d'un autre PC ou modifiée à la main
 * est ignorée. On retient la plus récente des trois : pour reculer l'horloge sans déclencher le verrouillage
 * il faut effacer les trois (voir docs/LICENCES.md pour les limites d'une licence hors-ligne).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REG_KEY = 'HKCU\\Software\\WiseDesignLMS';
const REG_VAL = 'Seen';
const FILE = '.wls-seen';

const mac = (ts, mid) => crypto.createHmac('sha256', `WLS-seen|${mid}`).update(String(ts)).digest('hex').slice(0, 16);
const pack = (ts, mid) => `${ts}.${mac(ts, mid)}`;
/** Retourne l'horodatage si la signature est valide pour ce poste, sinon 0. */
function unpack(s, mid) {
  const m = /^(\d{10,14})\.([0-9a-f]{16})$/.exec(String(s || '').trim());
  return m && m[2] === mac(m[1], mid) ? Number(m[1]) : 0;
}

const win = process.platform === 'win32';
const REG_OPTS = { windowsHide: true, timeout: 4000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };

function readSeen(dataDir, mid) {
  let best = 0;
  try { best = Math.max(best, unpack(fs.readFileSync(path.join(dataDir, FILE), 'utf8'), mid)); } catch { /* absent */ }
  if (win) {
    try {
      const m = /Seen\s+REG_SZ\s+(\S+)/i.exec(execFileSync('reg', ['query', REG_KEY, '/v', REG_VAL], REG_OPTS));
      if (m) best = Math.max(best, unpack(m[1], mid));
    } catch { /* absent */ }
  }
  return best;
}

function writeSeen(dataDir, mid, ts) {
  const v = pack(ts, mid);
  try { fs.writeFileSync(path.join(dataDir, FILE), v); } catch { /* ignoré */ }
  if (win) { try { execFileSync('reg', ['add', REG_KEY, '/v', REG_VAL, '/t', 'REG_SZ', '/d', v, '/f'], REG_OPTS); } catch { /* ignoré */ } }
}

module.exports = { readSeen, writeSeen, pack, unpack };
