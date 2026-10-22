#!/usr/bin/env node
'use strict';
/**
 * Outil de l'ÉMETTEUR (Wise Design) — ne jamais distribuer la clé privée ni la committer.
 *
 *   node tools/license-keygen.js init [--force] [--key chemin/privee.pem]
 *        Génère une paire Ed25519, écrit la clé privée (PEM) et la clé publique dans
 *        electron/licensePublicKey.js (à recompiler ensuite dans l'application).
 *
 *   node tools/license-keygen.js issue --machine XXXX-XXXX-XXXX-XXXX-XXXX --plan monthly|quarterly|semester|annual
 *        [--customer "Nom du centre"] [--start AAAA-MM-JJ] [--key chemin/privee.pem]
 *        Émet une clé de licence. Renouvellement : relancer avec --start = date d'expiration précédente.
 *
 *   node tools/license-keygen.js maintenance [--hours 24] [--installer chemin/Wise-Design-Learning-Systems-Setup-x.y.z.exe] [--out dossier]
 *        Crée le dossier WLS-Maintenance (maintenance.json signé, valable pour TOUS les postes) à copier à la racine de la clé USB autorisée.
 *        Avec --installer, l'installeur est copié et son hash signé : branché sur un poste, la clé installe la mise à jour toute seule.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { issueKey, PLAN_MONTHS } = require('../electron/license');

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const PRIV = opt('key', path.join(__dirname, 'keys', 'license-private.pem'));
const b64u = (b) => Buffer.from(b).toString('base64url');
const die = (m) => { console.error('Erreur : ' + m); process.exit(1); };

if (cmd === 'init') {
  if (fs.existsSync(PRIV) && !args.includes('--force')) die(`${PRIV} existe déjà (ajoutez --force pour remplacer — les anciennes clés cesseront de fonctionner).`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(PRIV), { recursive: true });
  fs.writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(path.join(__dirname, '..', 'electron', 'licensePublicKey.js'),
    `'use strict';\n// Clé PUBLIQUE de vérification des licences (générée par tools/license-keygen.js init)\nmodule.exports = \`${pub}\`;\n`);
  console.log(`Clé privée : ${PRIV}\nClé publique : electron/licensePublicKey.js\nGardez la clé privée hors du dépôt Git.`);
} else if (cmd === 'issue') {
  const mid = opt('machine'); const plan = opt('plan');
  if (!/^([0-9A-F]{4}-){4}[0-9A-F]{4}$/.test(mid || '')) die('--machine invalide (format XXXX-XXXX-XXXX-XXXX-XXXX)');
  if (!PLAN_MONTHS[plan]) die('--plan doit être monthly, quarterly, semester ou annual');
  if (!fs.existsSync(PRIV)) die(`clé privée introuvable : ${PRIV}`);
  const start = opt('start', new Date().toISOString().slice(0, 10));
  let r;
  try { r = issueKey({ machine: mid, plan, customer: opt('customer', ''), start, privateKeyPem: fs.readFileSync(PRIV, 'utf8') }); } catch (e) { die(e.message); }
  console.log(`Poste : ${mid}\nPlan : ${plan}   Expire le : ${r.payload.expires.slice(0, 10)}\n\n${r.key}\n`);
} else if (cmd === 'maintenance') {
  const { issueToken } = require('../electron/maintenanceKey');
  const hours = Number(opt('hours', 24));
  const inst = opt('installer');
  const out = path.resolve(opt('out', 'WLS-Maintenance'));
  if (!fs.existsSync(PRIV)) die(`clé privée introuvable : ${PRIV}`);
  let installer = null;
  fs.mkdirSync(out, { recursive: true });
  if (inst) {
    if (!fs.existsSync(inst)) die(`installeur introuvable : ${inst}`);
    const buf = fs.readFileSync(inst);
    installer = { name: path.basename(inst), sha256: crypto.createHash('sha256').update(buf).digest('hex') };
    fs.copyFileSync(inst, path.join(out, installer.name));
  }
  let r;
  try { r = issueToken({ hours, installer, privateKeyPem: fs.readFileSync(PRIV, 'utf8') }); } catch (e) { die(e.message); }
  fs.writeFileSync(path.join(out, 'maintenance.json'), r.token + '\n');
  console.log(`Dossier : ${out}\nValable jusqu'au : ${r.payload.expires}${installer ? `\nMise à jour : ${installer.name} (${installer.sha256.slice(0, 12)}…)` : ''}\nCopiez ce dossier « WLS-Maintenance » à la racine de la clé USB autorisée.`);
} else {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[^]*?\/\*\*/, '').replace(/^ \* ?/gm, ''));
}
