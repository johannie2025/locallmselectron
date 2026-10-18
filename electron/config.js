'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  courseRoot: 'C:\\formations_wls',
  dataDir: null,       // défaut : C:\ProgramData\WiseDesignLMS (partagé entre comptes Windows) ; userData en dev
  kiosk: 'auto',       // 'auto' : kiosque pour les comptes Windows standard, fenêtre normale pour les admins Windows ; true / false pour forcer
  lockdown: 'auto',    // 'auto' : restrictions Windows pour les comptes standard ; 'always' ; 'off'
};

/**
 * Fichier de configuration facultatif lms-config.json, recherché dans l'ordre :
 *   1. variable d'environnement LMS_CONFIG
 *   2. C:\ProgramData\WiseDesignLMS\lms-config.json
 *   3. à côté de l'exécutable (version portable : dossier d'origine du .exe)
 * Exemple : { "courseRoot": "D:\\formations_wls", "kiosk": false, "lockdown": "off" }
 */
function loadConfig(app) {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const candidates = [
    process.env.LMS_CONFIG,
    path.join(programData, 'WiseDesignLMS', 'lms-config.json'),
    process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'lms-config.json'),
    path.join(path.dirname(process.execPath), 'lms-config.json'),
  ].filter(Boolean);
  let cfg = {};
  for (const f of candidates) {
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); break; } catch { /* suivant */ }
  }
  // Version PORTABLE (electron-builder « portable ») : tout reste à côté de l'exécutable, rien n'est écrit ailleurs ;
  // pas de kiosque ni de restrictions Windows par défaut (poste de démonstration / clé de Wise Design) sauf si lms-config.json le demande.
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || null;
  const base = portableDir ? { ...DEFAULTS, courseRoot: path.join(portableDir, 'formations_wls'), kiosk: false, lockdown: 'off' } : DEFAULTS;
  const merged = { ...base, ...cfg, portable: !!portableDir };
  if (!merged.dataDir) {
    if (portableDir) merged.dataDir = path.join(portableDir, 'WLS-Data');
    else if (process.platform === 'win32' && app.isPackaged) merged.dataDir = path.join(programData, 'WiseDesignLMS');
    else merged.dataDir = app.getPath('userData');
  }
  return merged;
}

module.exports = { loadConfig };
