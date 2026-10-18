'use strict';
/**
 * Restrictions Windows pour le compte qui lance l'application (HKCU, sans droits administrateur).
 *
 *  - Mode 'auto' : les comptes Windows ADMINISTRATEURS ne sont jamais restreints
 *    (ils gardent Explorateur, Gestionnaire des tâches… pour la maintenance).
 *  - Le blocage des clés USB (niveau machine, HKLM) est posé par l'installeur (build/installer.nsh).
 *
 * Stratégies : lecteurs masqués et inaccessibles dans l'Explorateur, boîte Exécuter, Panneau de configuration,
 * options des dossiers, raccourcis touche Windows, Gestionnaire des tâches.
 * Elles ne gênent PAS l'accès programmatique de l'application au dossier des cours.
 * Elles sont levées par « Quitter et lever les restrictions » (écran de connexion ou panneau Admin)
 * ou par scripts/Lever-Restrictions-Utilisateur.cmd.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXPLORER = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer';
const SYSTEM = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System';
const ALL_DRIVES = 67108863; // bits A..Z
const POLICIES = [
  [EXPLORER, 'NoDrives', ALL_DRIVES],
  [EXPLORER, 'NoViewOnDrive', ALL_DRIVES],
  [EXPLORER, 'NoRun', 1],
  [EXPLORER, 'NoControlPanel', 1],
  [EXPLORER, 'NoFolderOptions', 1],
  [EXPLORER, 'NoWinKeys', 1],
  [SYSTEM, 'DisableTaskMgr', 1],
];
const MARKER = 'lockdown.applied';

const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (err, out) => resolve({ err, out: String(out || '') })));

/**
 * Vrai si le compte Windows courant est membre du groupe Administrateurs (SID S-1-5-32-544).
 * `whoami /groups` liste ce groupe même pour un jeton UAC « filtré » ; indépendant de la langue.
 * En cas de doute → true (on NE verrouille PAS).
 */
async function isWindowsAdmin() {
  if (process.platform !== 'win32') return false;
  const { err, out } = await run('whoami', ['/groups', '/fo', 'csv', '/nh']);
  if (err || !out) return true;
  return out.includes('S-1-5-32-544');
}

const restartExplorer = () => run('taskkill', ['/f', '/im', 'explorer.exe']); // Windows relance le shell automatiquement

/** mode : 'auto' (comptes standard seulement) | 'always' | 'off' (ou booléen false). */
async function apply(dataDir, mode = 'auto', log = () => {}) {
  if (process.platform !== 'win32' || mode === 'off' || mode === false) return { applied: false, reason: 'off' };
  if (mode !== 'always' && (await isWindowsAdmin())) return { applied: false, reason: 'windows-admin' };
  for (const [key, name, val] of POLICIES) {
    const r = await run('reg', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(val), '/f']);
    if (r.err) log(`reg add ${name}: ${r.err.message}`);
  }
  const marker = path.join(dataDir, MARKER);
  const first = !fs.existsSync(marker);
  if (first) {
    try { fs.writeFileSync(marker, new Date().toISOString()); } catch { /* ignoré */ }
    await restartExplorer(); // pour que NoDrives / NoViewOnDrive soient pris en compte tout de suite
  }
  return { applied: true, restartedExplorer: first };
}

async function revert(dataDir) {
  if (process.platform !== 'win32') return;
  for (const [key, name] of POLICIES) await run('reg', ['delete', key, '/v', name, '/f']);
  try { fs.unlinkSync(path.join(dataDir, MARKER)); } catch { /* ignoré */ }
  await restartExplorer();
}

const isApplied = (dataDir) => fs.existsSync(path.join(dataDir, MARKER));

module.exports = { apply, revert, isApplied, isWindowsAdmin, POLICIES };
