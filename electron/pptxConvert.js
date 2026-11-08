'use strict';
/**
 * Conversion PowerPoint → PDF pour la lecture dans l'application.
 * 1) Microsoft PowerPoint (COM, via PowerShell) s'il est installé ; 2) LibreOffice (soffice --headless) en secours.
 * Le PDF est mis en cache à côté du fichier (<module>/.wls-cache/…), clé = taille + date de modification.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => execFile(cmd, args, { windowsHide: true, timeout: 180000, ...opts }, (e, out, err) => (e ? reject(Object.assign(e, { stderr: String(err || '') })) : resolve(String(out || '')))));

const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open($env:WLS_SRC, -1, 0, 0)
  $pres.SaveAs($env:WLS_DST, 32)
  $pres.Close()
} finally {
  if ($app.Presentations.Count -eq 0) { $app.Quit() }
}`;

function findSoffice(env = process.env, exists = fs.existsSync) {
  const dirs = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432].filter(Boolean);
  for (const d of dirs) { const p = path.join(d, 'LibreOffice', 'program', 'soffice.exe'); if (exists(p)) return p; }
  return null;
}

async function viaPowerPoint(src, dst) {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await run(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT], { env: { ...process.env, WLS_SRC: src, WLS_DST: dst } });
}

async function viaLibreOffice(soffice, src, dst) {
  const tmp = path.join(path.dirname(dst), `.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await run(soffice, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', tmp, src]);
    const out = path.join(tmp, path.basename(src).replace(/\.[^.]+$/, '') + '.pdf');
    fs.renameSync(out, dst);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// Export de chaque diapositive en image PNG par PowerPoint (comme les lecteurs de chants/présentations : rendu fidèle, sans moteur PDF)
const PS_SLIDES = `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open($env:WLS_SRC, -1, 0, 0)
  $i = 1
  foreach ($s in $pres.Slides) { $s.Export((Join-Path $env:WLS_DST ('slide-{0:D3}.png' -f $i)), 'PNG', 1920, 1080); $i++ }
  $pres.Close()
} finally {
  if ($app.Presentations.Count -eq 0) { $app.Quit() }
}`;

const slideFiles = (dir) => { try { return fs.readdirSync(dir).filter((n) => /^slide-\d+\.png$/.test(n)).sort(); } catch { return []; } };
const pendingSlides = new Map();

/** Dossier des images de diapositives (généré si besoin par PowerPoint). Erreur : PPTX_NO_POWERPOINT. */
function exportSlides(srcAbs, { platform = process.platform, log = () => {} } = {}) {
  const st = fs.statSync(srcAbs);
  const cache = path.join(path.dirname(srcAbs), '.wls-cache');
  const dir = path.join(cache, `${path.basename(srcAbs).replace(/\.[^.]+$/, '')}-${st.size}-${Math.round(st.mtimeMs)}.slides`);
  if (slideFiles(dir).length) return Promise.resolve({ dir, files: slideFiles(dir) });
  if (pendingSlides.has(dir)) return pendingSlides.get(dir);
  const p = (async () => {
    if (platform !== 'win32') throw new Error('PPTX_NO_POWERPOINT');
    const tmp = `${dir}.tmp-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      await run(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', PS_SLIDES], { env: { ...process.env, WLS_SRC: srcAbs, WLS_DST: tmp }, timeout: 300000 });
      if (!slideFiles(tmp).length) throw new Error('no slide exported');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(tmp, dir);
      return { dir, files: slideFiles(dir) };
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      log(`pptx slides: ${e.message} ${e.stderr || ''}`);
      throw new Error('PPTX_NO_POWERPOINT');
    }
  })().finally(() => pendingSlides.delete(dir));
  pendingSlides.set(dir, p);
  return p;
}

const pending = new Map();

/** Retourne le chemin du PDF (généré si besoin). Erreurs : PPTX_NO_CONVERTER, PPTX_CONVERT_FAILED. */
function convert(srcAbs, { platform = process.platform, log = () => {}, skipPowerPoint = false } = {}) {
  const st = fs.statSync(srcAbs);
  const dir = path.join(path.dirname(srcAbs), '.wls-cache');
  const dst = path.join(dir, `${path.basename(srcAbs).replace(/\.[^.]+$/, '')}-${st.size}-${Math.round(st.mtimeMs)}.pdf`);
  if (fs.existsSync(dst)) return Promise.resolve(dst);
  if (pending.has(dst)) return pending.get(dst);
  const p = (async () => {
    if (platform !== 'win32') throw new Error('PPTX_NO_CONVERTER');
    fs.mkdirSync(dir, { recursive: true });
    const errors = [];
    if (!skipPowerPoint) try { await viaPowerPoint(srcAbs, dst); if (fs.existsSync(dst)) return dst; } catch (e) { errors.push(`PowerPoint: ${e.message} ${e.stderr || ''}`); }
    const so = findSoffice();
    if (so) { try { await viaLibreOffice(so, srcAbs, dst); if (fs.existsSync(dst)) return dst; } catch (e) { errors.push(`LibreOffice: ${e.message}`); } }
    log(`pptx: ${errors.join(' | ')}`);
    throw new Error(so || errors.length ? 'PPTX_CONVERT_FAILED' : 'PPTX_NO_CONVERTER');
  })().finally(() => pending.delete(dst));
  pending.set(dst, p);
  return p;
}

module.exports = { convert, exportSlides, findSoffice };
