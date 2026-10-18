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
 *   3. à côté de l'exécutable
 * Exemple : { "courseRoot": "D:\\formations_wls", "kiosk": false, "lockdown": "off" }
 */
function loadConfig(app) {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const candidates = [
    process.env.LMS_CONFIG,
    path.join(programData, 'WiseDesignLMS', 'lms-config.json'),
    path.join(path.dirname(process.execPath), 'lms-config.json'),
  ].filter(Boolean);
  let cfg = {};
  for (const f of candidates) {
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); break; } catch { /* suivant */ }
  }
  const merged = { ...DEFAULTS, ...cfg };
  if (!merged.dataDir) {
    merged.dataDir = process.platform === 'win32' && app.isPackaged
      ? path.join(programData, 'WiseDesignLMS')
      : app.getPath('userData');
  }
  return merged;
}

module.exports = { loadConfig };
