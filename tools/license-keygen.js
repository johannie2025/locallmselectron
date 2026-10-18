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
} else {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[^]*?\/\*\*/, '').replace(/^ \* ?/gm, ''));
}
