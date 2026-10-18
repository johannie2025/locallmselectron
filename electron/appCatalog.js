'use strict';
/**
 * Applications que le centre peut rendre disponibles DANS Wise Design Learning Systems (suite bureautique, outils de dev…).
 * L'étudiant ne choisit jamais un chemin : il ne peut lancer que les entrées enregistrées par l'administrateur du centre.
 */
const path = require('path');

const OFFICE_DIRS = [
  '%ProgramFiles%\\Microsoft Office\\root\\Office16', '%ProgramFiles(x86)%\\Microsoft Office\\root\\Office16',
  '%ProgramFiles%\\Microsoft Office\\Office16', '%ProgramFiles(x86)%\\Microsoft Office\\Office16',
  '%ProgramFiles%\\Microsoft Office\\root\\Office15', '%ProgramFiles(x86)%\\Microsoft Office\\root\\Office15',
  '%ProgramFiles%\\Microsoft Office\\Office15', '%ProgramFiles(x86)%\\Microsoft Office\\Office15',
  '%ProgramFiles%\\Microsoft Office\\Office14', '%ProgramFiles(x86)%\\Microsoft Office\\Office14',
];
const office = (exe) => OFFICE_DIRS.map((d) => `${d}\\${exe}`);
const LO = ['%ProgramFiles%\\LibreOffice\\program\\soffice.exe', '%ProgramFiles(x86)%\\LibreOffice\\program\\soffice.exe'];

/** Catalogue des applications courantes ; `candidates` = emplacements d'installation usuels (variables %…% développées). */
const CATALOG = [
  { id: 'word', name: 'Microsoft Word', icon: '📝', candidates: office('WINWORD.EXE') },
  { id: 'excel', name: 'Microsoft Excel', icon: '📊', candidates: office('EXCEL.EXE') },
  { id: 'powerpoint', name: 'Microsoft PowerPoint', icon: '📽️', candidates: office('POWERPNT.EXE') },
  { id: 'access', name: 'Microsoft Access', icon: '🗄️', candidates: office('MSACCESS.EXE') },
  { id: 'onenote', name: 'Microsoft OneNote', icon: '📓', candidates: office('ONENOTE.EXE') },
  { id: 'lo-writer', name: 'LibreOffice Writer', icon: '📝', candidates: LO, args: '--writer' },
  { id: 'lo-calc', name: 'LibreOffice Calc', icon: '📊', candidates: LO, args: '--calc' },
  { id: 'lo-impress', name: 'LibreOffice Impress', icon: '📽️', candidates: LO, args: '--impress' },
  { id: 'lo-math', name: 'LibreOffice Math', icon: '➗', candidates: LO, args: '--math' },
  { id: 'vscode', name: 'Visual Studio Code', icon: '💻', candidates: ['%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe', '%ProgramFiles%\\Microsoft VS Code\\Code.exe'] },
  { id: 'notepadpp', name: 'Notepad++', icon: '🗒️', candidates: ['%ProgramFiles%\\Notepad++\\notepad++.exe', '%ProgramFiles(x86)%\\Notepad++\\notepad++.exe'] },
  { id: 'geogebra', name: 'GeoGebra', icon: '📐', candidates: ['%LOCALAPPDATA%\\GeoGebra_Classic_6\\GeoGebra.exe', '%ProgramFiles%\\GeoGebra Classic 6\\GeoGebra.exe'] },
  { id: 'notepad', name: 'Bloc-notes', icon: '🗒️', candidates: ['%SystemRoot%\\System32\\notepad.exe'] },
  { id: 'calc', name: 'Calculatrice', icon: '🧮', candidates: ['%SystemRoot%\\System32\\calc.exe'] },
  { id: 'paint', name: 'Paint', icon: '🎨', candidates: ['%SystemRoot%\\System32\\mspaint.exe'] },
];

/**
 * Programmes qui rouvriraient l'accès à l'explorateur, à une console, au registre, à l'installation de logiciels…
 * et défaisaient donc le verrouillage du poste : refusés même si l'administrateur du centre les saisit à la main.
 * (Les outils de développement — VS Code, Python… — permettent eux-mêmes d'exécuter des commandes : à réserver aux classes d'informatique.)
 */
const DENY = new Set([
  'cmd.exe', 'powershell.exe', 'powershell_ise.exe', 'pwsh.exe', 'wt.exe', 'conhost.exe', 'explorer.exe', 'regedit.exe', 'reg.exe',
  'taskmgr.exe', 'mmc.exe', 'control.exe', 'msiexec.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe', 'rundll32.exe', 'regsvr32.exe',
  'schtasks.exe', 'sc.exe', 'net.exe', 'net1.exe', 'netsh.exe', 'taskkill.exe', 'diskpart.exe', 'format.com', 'bash.exe', 'wsl.exe',
  'ssh.exe', 'telnet.exe', 'ftp.exe', 'curl.exe', 'bitsadmin.exe', 'certutil.exe', 'dism.exe', 'gpedit.msc', 'compmgmt.msc', 'diskmgmt.msc',
  'osk.exe', 'magnify.exe', 'narrator.exe', 'sethc.exe', 'utilman.exe', 'cleanmgr.exe', 'msconfig.exe', 'systemsettings.exe', 'wmic.exe',
  'xcopy.exe', 'robocopy.exe', 'start.exe', 'forfiles.exe', 'runas.exe', 'psexec.exe',
]);

const expand = (s, env = process.env) => String(s).replace(/%([^%]+)%/g, (m, k) => {
  const key = Object.keys(env).find((e) => e.toLowerCase() === k.toLowerCase());
  return key ? env[key] : m;
});

/** Retourne les applications du catalogue effectivement installées : [{ id, name, icon, path, args }]. */
function detect(env = process.env, exists = (p) => require('fs').existsSync(p)) {
  const out = [];
  for (const c of CATALOG) {
    for (const cand of c.candidates) {
      const p = expand(cand, env);
      if (!p.includes('%') && exists(p)) { out.push({ id: c.id, name: c.name, icon: c.icon, path: p, args: c.args || '' }); break; }
    }
  }
  return out;
}

/** Découpe une ligne d'arguments en tableau (guillemets doubles acceptés). Jamais passée à un shell. */
function splitArgs(s) {
  const out = []; const re = /"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(String(s || '')))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

/** Valide et normalise une entrée saisie par l'administrateur. Lève un code d'erreur i18n. */
function validateApp(a, isWin = process.platform === 'win32') {
  const name = String(a?.name || '').trim();
  if (!name || name.length > 40) throw new Error('BAD_NAME');
  const p = String(a?.path || '').trim().replace(/^"|"$/g, '');
  const pathMod = isWin ? path.win32 : path;
  if (!pathMod.isAbsolute(p) || p.length > 400 || /[\r\n\0]/.test(p)) throw new Error('APP_PATH');
  if (!/\.exe$/i.test(p)) throw new Error('APP_PATH');
  const base = pathMod.basename(p).toLowerCase();
  if (DENY.has(base)) throw new Error('APP_FORBIDDEN');
  const args = String(a?.args || '').trim();
  if (args.length > 200 || /[\r\n\0]/.test(args)) throw new Error('APP_ARGS');
  const id = String(a?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  return { id, name, path: p, args, enabled: !!a?.enabled, icon: String(a?.icon || '').slice(0, 4) || '🧩' };
}

module.exports = { CATALOG, DENY, detect, expand, splitArgs, validateApp };
