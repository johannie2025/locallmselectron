'use strict';
/**
 * courseScanner.js — module AUTONOME (Node.js pur, aucune dépendance Electron).
 *
 * Convention de dossiers :
 *   <racine>/<Cours>/<Module>/<fichiers .mp4 .webm .pdf .pptx, quiz.json, manifest.json>
 *
 * - Ordre : tri naturel sur les noms (Module_2 < Module_10). Un manifest.json peut
 *   surcharger { title, description, order, prerequisites, minScore, items }.
 * - Sans manifest.json : 100 % basé sur les noms de fichiers/dossiers.
 * - Les .pptx ne sont PAS convertibles hors-ligne sans LibreOffice : si un .pdf du même
 *   nom existe à côté, il remplace le .pptx ; sinon le .pptx est listé « non lisible »
 *   (non requis pour la progression).
 * - Les liens symboliques sont ignorés (pas d'évasion hors de la racine).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIDEO_EXT = new Set(['.mp4', '.webm', '.m4v', '.mov', '.mkv', '.ogv']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.opus', '.flac']);
const UNSUPPORTED_EXT = new Set(['.avi', '.wmv', '.flv', '.mpg', '.mpeg', '.3gp', '.ts', '.wma']); // listés dans les avertissements : à convertir en .mp4 (H.264)
const PDF_EXT = new Set(['.pdf']);
const PPT_EXT = new Set(['.pptx', '.ppt']);
const IGNORED = /^(\.|~\$|thumbs\.db$|desktop\.ini$|\$recycle)/i;
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const naturalCompare = (a, b) => collator.compare(a, b);

const toPosix = (p) => p.split(path.sep).join('/');
const prettify = (name) =>
  name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

function readJson(file, warnings) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e.code !== 'ENOENT') warnings.push(`JSON invalide : ${file} (${e.message})`);
    return null;
  }
}

function safeReaddir(dir, warnings) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(
      (d) => !IGNORED.test(d.name) && !d.isSymbolicLink()
    );
  } catch (e) {
    warnings.push(`Dossier illisible : ${dir} (${e.code || e.message})`);
    return [];
  }
}

/** Collecte récursivement les fichiers média d'un module (sous-dossiers inclus). */
function collectFiles(dir, warnings, acc = []) {
  for (const d of safeReaddir(dir, warnings).sort((a, b) => naturalCompare(a.name, b.name))) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) collectFiles(abs, warnings, acc);
    else if (d.isFile()) acc.push(abs);
  }
  return acc;
}

function buildItems(moduleDir, root, manifest, warnings) {
  const files = collectFiles(moduleDir, warnings);
  const lower = new Map(files.map((f) => [f.toLowerCase(), f]));
  let items = [];
  for (const abs of files) {
    const ext = path.extname(abs).trim().toLowerCase();
    let type = null;
    if (VIDEO_EXT.has(ext)) type = 'video';
    else if (AUDIO_EXT.has(ext)) type = 'audio';
    else if (PDF_EXT.has(ext)) type = 'pdf';
    else if (PPT_EXT.has(ext)) type = 'pptx';
    if (!type) { if (UNSUPPORTED_EXT.has(ext)) warnings.push(`Format non lisible (à convertir en .mp4 H.264) : ${toPosix(path.relative(root, abs))}`); continue; }
    if (type === 'pptx' && lower.has(abs.slice(0, -ext.length).toLowerCase() + '.pdf')) continue; // PDF équivalent
    let size = 0;
    try { size = fs.statSync(abs).size; } catch { /* ignoré */ }
    const rel = toPosix(path.relative(root, abs));
    items.push({
      id: rel,
      type,
      title: prettify(path.basename(abs)),
      relPath: rel,
      size,
      viewable: type !== 'pptx',
      required: type !== 'pptx',
      _name: toPosix(path.relative(moduleDir, abs)),
    });
  }
  // manifest.items = liste de chemins relatifs au module : ordre imposé, le reste suit
  if (Array.isArray(manifest?.items)) {
    const rank = new Map(manifest.items.map((n, i) => [String(n).toLowerCase(), i]));
    items.sort((a, b) => {
      const ra = rank.has(a._name.toLowerCase()) ? rank.get(a._name.toLowerCase()) : Infinity;
      const rb = rank.has(b._name.toLowerCase()) ? rank.get(b._name.toLowerCase()) : Infinity;
      return ra === rb ? naturalCompare(a._name, b._name) : ra - rb;
    });
  }
  return items.map(({ _name, ...it }, i) => ({ ...it, order: i + 1 }));
}

function readQuizInfo(moduleDir, root, warnings) {
  const file = path.join(moduleDir, 'quiz.json');
  if (!fs.existsSync(file)) return null;
  const rel = toPosix(path.relative(root, file));
  const data = readJson(file, warnings);
  if (!data || !Array.isArray(data.questions)) {
    return { file: rel, valid: false, error: 'quiz.json illisible ou sans "questions"' };
  }
  return {
    file: rel,
    valid: true,
    title: data.title || null,
    passingScore: typeof data.passingScore === 'number' ? data.passingScore : null,
    questionCount: data.questions.length,
  };
}

const byOrderThenName = (a, b) => {
  const oa = Number.isFinite(a.order) ? a.order : Infinity;
  const ob = Number.isFinite(b.order) ? b.order : Infinity;
  return oa === ob ? naturalCompare(a._dir, b._dir) : oa - ob;
};

function buildModule(moduleDir, root, courseId, dirName, warnings, opts = {}) {
  const manifest = readJson(path.join(moduleDir, 'manifest.json'), warnings) || {};
  const items = buildItems(moduleDir, root, manifest, warnings);
  const quiz = readQuizInfo(moduleDir, root, warnings);
  if (!items.length && !quiz) return null;
  // Pour le module « racine du cours » (fichiers posés directement dans le cours) on ne descend pas dans les modules.
  return {
    id: `${courseId}/${opts.rootModule ? '_general' : dirName}`,
    _dir: dirName,
    title: manifest.title || (opts.rootModule ? 'Général' : prettify(dirName)),
    description: manifest.description || '',
    order: Number.isFinite(manifest.order) ? manifest.order : (opts.rootModule ? -Infinity : null),
    prerequisites: Array.isArray(manifest.prerequisites) ? manifest.prerequisites.map(String) : [],
    minScore: typeof manifest.minScore === 'number' ? manifest.minScore : null,
    items,
    quiz,
    absPath: moduleDir,
  };
}

function scanCourse(courseDir, root, warnings) {
  const dirName = path.basename(courseDir);
  const id = dirName;
  const manifest = readJson(path.join(courseDir, 'manifest.json'), warnings) || {};
  const entries = safeReaddir(courseDir, warnings);
  const modules = [];

  // fichiers à la racine du cours → module « Général » (non récursif : les sous-dossiers sont des modules)
  const looseFiles = entries.filter((e) => e.isFile() && [VIDEO_EXT, AUDIO_EXT, PDF_EXT, PPT_EXT].some((s) => s.has(path.extname(e.name).toLowerCase())));
  if (looseFiles.length) {
    const items = buildItems(courseDir, root, null, warnings).filter((it) => !it.relPath.slice(id.length + 1).includes('/'));
    if (items.length) {
      modules.push({
        id: `${id}/_general`, _dir: '', title: 'Général', description: '', order: -Infinity,
        prerequisites: [], minScore: null, items: items.map((it, i) => ({ ...it, order: i + 1 })),
        quiz: null, absPath: courseDir,
      });
    }
  }
  for (const d of entries.filter((e) => e.isDirectory() && !/^[_.]/.test(e.name))) {
    const m = buildModule(path.join(courseDir, d.name), root, id, d.name, warnings);
    if (m) modules.push(m);
  }
  modules.sort(byOrderThenName);
  modules.forEach((m, i) => { m.order = i + 1; delete m._dir; });
  if (!modules.length) return null;
  return {
    id,
    _dir: dirName,
    title: manifest.title || prettify(dirName),
    description: manifest.description || '',
    order: Number.isFinite(manifest.order) ? manifest.order : null,
    minScore: typeof manifest.minScore === 'number' ? manifest.minScore : null,
    modules,
    absPath: courseDir,
  };
}

/**
 * Scanne la racine. Retourne { root, scannedAt, courses, warnings, fingerprint }
 * ou { error: 'ROOT_NOT_FOUND' | 'ROOT_NOT_DIRECTORY', root }.
 */
function scanRoot(rootPath) {
  const root = path.resolve(rootPath);
  const warnings = [];
  try {
    if (!fs.statSync(root).isDirectory()) return { error: 'ROOT_NOT_DIRECTORY', root };
  } catch {
    return { error: 'ROOT_NOT_FOUND', root };
  }
  const courses = [];
  for (const d of safeReaddir(root, warnings).filter((e) => e.isDirectory() && !/^[_.]/.test(e.name))) {
    const c = scanCourse(path.join(root, d.name), root, warnings);
    if (c) courses.push(c);
  }
  courses.sort(byOrderThenName);
  courses.forEach((c) => delete c._dir);

  const hash = crypto.createHash('sha1');
  for (const c of courses) for (const m of c.modules) {
    for (const it of m.items) {
      let mt = 0;
      try { mt = fs.statSync(path.join(root, it.relPath)).mtimeMs; } catch { /* ignoré */ }
      hash.update(`${it.relPath}:${it.size}:${mt}|`);
    }
    if (m.quiz) hash.update(`${m.quiz.file}:${m.quiz.questionCount}|`);
  }
  return { root, scannedAt: Date.now(), courses, warnings, fingerprint: hash.digest('hex') };
}

const MEDIA_EXT = new Set([...VIDEO_EXT, ...AUDIO_EXT, ...PDF_EXT]); // extensions servies à l'interface (pptx exclu)
module.exports = { scanRoot, naturalCompare, prettify, VIDEO_EXT, AUDIO_EXT, PDF_EXT, PPT_EXT, MEDIA_EXT };

// Utilisation CLI : node electron/courseScanner.js "C:\Formation_Langues"
if (require.main === module) {
  const out = scanRoot(process.argv[2] || '.');
  console.log(JSON.stringify(out, (k, v) => (k === 'absPath' ? undefined : v), 2));
}
