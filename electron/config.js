'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = { courseRoot: 'C:\\Formation_Langues', dataDir: null };

/**
 * Ordre de recherche du fichier de config (lms-config.json) :
 *   1. variable d'environnement LMS_CONFIG
 *   2. à côté de l'exécutable (installé ou portable)
 * Exemple : { "courseRoot": "D:\\Cours", "dataDir": "C:\\ProgramData\\LMS_Langues" }
 * Le dossier des cours peut ensuite être modifié depuis le panneau Admin (stocké en base).
 */
function loadConfig(app) {
  const candidates = [
    process.env.LMS_CONFIG,
    process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'lms-config.json'),
    path.join(path.dirname(process.execPath), 'lms-config.json'),
  ].filter(Boolean);
  let cfg = {};
  for (const f of candidates) {
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch { /* suivant */ }
  }
  const merged = { ...DEFAULTS, ...cfg };
  if (!merged.dataDir) merged.dataDir = app.getPath('userData');
  return merged;
}

module.exports = { loadConfig };
