'use strict';
/**
 * Configuration réseau du poste (fichier net.json dans le dossier de données).
 *  - mode 'standalone' : poste autonome (défaut)
 *  - mode 'server'     : ce poste héberge la base et les cours et sert les postes clients du réseau local
 *  - mode 'client'     : ce poste n'a ni cours ni base propres : tout passe par le serveur (jumelé avec un code)
 * Le code de jumelage n'est jamais stocké en clair (empreinte SHA-256) ; les jetons des clients non plus côté serveur.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PORT = 47800;
const DEFAULTS = { mode: 'standalone', port: DEFAULT_PORT, pairHash: null, pairExpires: 0, clients: [], server: '', token: '', name: '' };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I
const newCode = () => { let c = ''; for (let i = 0; i < 8; i += 1) c += ALPHA[crypto.randomInt(ALPHA.length)]; return `${c.slice(0, 4)}-${c.slice(4)}`; };

/** "192.168.1.10", "serveur-pc:47800" → "hote:port" normalisé ; null si invalide. */
function normalizeAddress(s) {
  const m = /^\s*(?:https?:\/\/)?([A-Za-z0-9]([A-Za-z0-9.-]{0,60}[A-Za-z0-9])?)(?::(\d{1,5}))?\s*\/?\s*$/.exec(String(s || ''));
  if (!m) return null;
  const port = m[3] ? Number(m[3]) : DEFAULT_PORT;
  if (port < 1024 || port > 65535) return null;
  return `${m[1]}:${port}`;
}

function createNetStore(dataDir) {
  const file = path.join(dataDir, 'net.json');
  let cfg;
  const load = () => { try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { cfg = { ...DEFAULTS, clients: [] }; } };
  const save = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(cfg, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  load();
  return {
    get: () => cfg,
    update(patch) { cfg = { ...cfg, ...patch }; save(); return cfg; },
    /** Génère un code de jumelage valable 15 min ; le renvoie UNE SEULE FOIS en clair. */
    newPairCode() { const code = newCode(); cfg.pairHash = sha(code.replace('-', '')); cfg.pairExpires = Date.now() + 15 * 60 * 1000; save(); return code; },
    checkPairCode(code) {
      if (!cfg.pairHash || Date.now() > cfg.pairExpires) return false;
      return safeEq(sha(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')), cfg.pairHash);
    },
    addClient(name, addr) {
      const token = crypto.randomBytes(32).toString('hex');
      const c = { id: crypto.randomBytes(6).toString('hex'), name: String(name || 'Poste').slice(0, 40), tokenHash: sha(token), pairedAt: Date.now(), lastSeen: Date.now(), addr: String(addr || '') };
      cfg.clients = [...cfg.clients, c]; cfg.pairHash = null; cfg.pairExpires = 0; save(); // un code ne sert qu'une fois
      return { id: c.id, token };
    },
    findClient(token) { const h = sha(token || ''); return cfg.clients.find((c) => safeEq(c.tokenHash, h)) || null; },
    touch(id, addr) { const c = cfg.clients.find((x) => x.id === id); if (c && Date.now() - c.lastSeen > 30000) { c.lastSeen = Date.now(); c.addr = addr || c.addr; save(); } },
    revoke(id) { cfg.clients = cfg.clients.filter((c) => c.id !== id); save(); },
  };
}

module.exports = { createNetStore, normalizeAddress, newCode, DEFAULT_PORT };
