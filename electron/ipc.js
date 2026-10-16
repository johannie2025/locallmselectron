'use strict';
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const { scanRoot, VIDEO_EXT, PDF_EXT } = require('./courseScanner');
const { buildView } = require('./gating');
const quizEngine = require('./quizEngine');

const MEDIA_EXT = new Set([...VIDEO_EXT, ...PDF_EXT]);
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));

function createServices({ db, config, getWindow, quitApp, log }) {
  let session = null; // une seule session à la fois (poste kiosque)
  let tree = null;
  let watcher = null;
  let watchedRoot = null;
  const itemIndex = new Map();
  const moduleIndex = new Map(); // moduleId -> { course, module }

  // ---------- Paramètres ----------
  const getSetting = (k, def) => {
    const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
    return r ? JSON.parse(r.value) : def;
  };
  const setSetting = (k, v) =>
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  const getSettings = () => ({
    courseRoot: getSetting('courseRoot', config.courseRoot),
    minScore: getSetting('minScore', 80),
    autoQuiz: getSetting('autoQuiz', true),
    allowSkip: getSetting('allowSkip', false), // autoriser l'avance rapide vidéo
  });
  const getCourseRoot = () => path.resolve(getSettings().courseRoot);

  // ---------- Scan & cache ----------
  function getTree(force = false) {
    if (tree && !force) return tree;
    const t = scanRoot(getSettings().courseRoot);
    if (t.error) {
      const cached = db.prepare("SELECT payload FROM course_cache WHERE id='tree'").get();
      tree = cached ? { ...JSON.parse(cached.payload), stale: true, error: t.error } : { ...t, courses: [] };
    } else {
      tree = t;
      db.prepare(
        `INSERT INTO course_cache(id,payload,fingerprint,scanned_at) VALUES('tree',?,?,?)
         ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, fingerprint=excluded.fingerprint, scanned_at=excluded.scanned_at`
      ).run(JSON.stringify(t), t.fingerprint, t.scannedAt);
    }
    itemIndex.clear(); moduleIndex.clear();
    for (const c of tree.courses) for (const m of c.modules) {
      moduleIndex.set(m.id, { course: c, module: m });
      for (const it of m.items) itemIndex.set(it.id, it);
    }
    startWatch();
    return tree;
  }

  /** Surveillance du dossier des cours (recursive supporté sur Windows). Debounce 1,5 s. */
  function startWatch() {
    const root = getCourseRoot();
    if (watcher && watchedRoot === root) return;
    try { watcher?.close(); } catch { /* ignoré */ }
    watcher = null; watchedRoot = root;
    if (!fs.existsSync(root)) return;
    let timer = null;
    try {
      watcher = fs.watch(root, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          tree = null;
          getWindow()?.webContents.send('courses:changed');
        }, 1500);
      });
      watcher.on('error', () => { watcher = null; });
    } catch (e) { log(`watch: ${e.message}`); }
  }

  function currentView() {
    const t = getTree();
    const progress = new Map(db.prepare('SELECT * FROM progress WHERE user_id=?').all(session.id).map((r) => [r.item_id, r]));
    const quizBest = new Map(
      db.prepare('SELECT module_id, MAX(score) best, COUNT(*) attempts FROM quiz_results WHERE user_id=? GROUP BY module_id').all(session.id)
        .map((r) => [r.module_id, r])
    );
    const view = buildView(t, { progress, quizBest, settings: getSettings(), isAdmin: session.role === 'admin' });
    return { ...view, error: t.error || null, stale: !!t.stale, scannedAt: t.scannedAt, warnings: session.role === 'admin' ? t.warnings || [] : [], settings: { allowSkip: getSettings().allowSkip } };
  }
  function moduleState(moduleId) {
    const v = currentView();
    for (const c of v.courses) { const m = c.modules.find((x) => x.id === moduleId); if (m) return m; }
    throw new Error('MODULE_UNKNOWN');
  }

  /** Résolution SÉCURISÉE d'un média : reste dans la racine, extension autorisée, fichier existant. */
  function resolveMedia(rel) {
    const root = getCourseRoot();
    const abs = path.resolve(root, rel);
    const r = path.relative(root, abs);
    if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
    if (!MEDIA_EXT.has(path.extname(abs).toLowerCase())) return null;
    try { if (!fs.statSync(abs).isFile()) return null; } catch { return null; }
    return abs;
  }

  function resolveQuiz(moduleId) {
    getTree();
    const e = moduleIndex.get(moduleId);
    if (!e) throw new Error('MODULE_UNKNOWN');
    if (e.module.quiz?.valid) {
      const r = quizEngine.readQuizFile(path.join(getCourseRoot(), e.module.quiz.file));
      if (r.quiz) return { quiz: r.quiz, source: 'file', ...e };
    }
    if (getSettings().autoQuiz) {
      const q = quizEngine.autoQuiz(e.course, e.module);
      if (q) return { quiz: q, source: 'auto', ...e };
    }
    return null;
  }

  // ---------- Enregistrement des handlers ----------
  const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, fullName: u.full_name || u.fullName || '', mustChange: !!(u.must_change_password ?? u.mustChange) });
  function handle(channel, role, fn) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        if (role && !session) throw new Error('AUTH_REQUIRED');
        if (role === 'admin' && session.role !== 'admin') throw new Error('FORBIDDEN');
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        if (!/^[A-Z_]+$/.test(err.message)) log(`${channel}: ${err.stack || err.message}`);
        return { ok: false, error: err.message };
      }
    });
  }

  // Auth
  handle('auth:login', null, (username, password) => {
    const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username || '').trim());
    // comparaison toujours exécutée pour limiter l'énumération de comptes par temps de réponse
    const ok = bcrypt.compareSync(String(password || ''), u ? u.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
    if (!u || !ok) throw new Error('BAD_CREDENTIALS');
    db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(Date.now(), u.id);
    session = publicUser(u);
    return session;
  });
  handle('auth:logout', null, () => { session = null; return true; });
  handle('auth:me', null, () => session);
  handle('auth:changePassword', 'user', (oldPwd, newPwd) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(session.id);
    if (!bcrypt.compareSync(String(oldPwd || ''), u.password_hash)) throw new Error('BAD_CREDENTIALS');
    if (String(newPwd || '').length < 6) throw new Error('PASSWORD_TOO_SHORT');
    db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(bcrypt.hashSync(newPwd, 10), u.id);
    session.mustChange = false;
    return session;
  });

  // Cours / progression
  handle('courses:list', 'user', () => currentView());
  handle('courses:rescan', 'admin', () => { tree = null; return currentView(); });
  handle('progress:update', 'user', ({ itemId, percent, positionSec }) => {
    getTree();
    if (!itemIndex.has(itemId)) throw new Error('ITEM_UNKNOWN');
    const pct = clamp(percent, 0, 100);
    db.prepare(
      `INSERT INTO progress(user_id,item_id,percent,position_sec,completed,updated_at) VALUES(?,?,?,?,?,?)
       ON CONFLICT(user_id,item_id) DO UPDATE SET percent=MAX(percent,excluded.percent), position_sec=excluded.position_sec,
         completed=MAX(completed,excluded.completed), updated_at=excluded.updated_at`
    ).run(session.id, itemId, pct, Number(positionSec) || 0, pct >= 98 ? 1 : 0, Date.now());
    return true;
  });
  handle('media:readPdf', 'user', (itemId) => {
    getTree();
    const it = itemIndex.get(itemId);
    if (!it || it.type !== 'pdf') throw new Error('ITEM_UNKNOWN');
    const abs = resolveMedia(it.relPath);
    if (!abs) throw new Error('FILE_NOT_FOUND');
    return fs.readFileSync(abs);
  });

  // Quiz (correction côté main uniquement)
  handle('quiz:get', 'user', (moduleId) => {
    const st = moduleState(moduleId);
    if (session.role !== 'admin' && (!st.unlocked || !st.viewed)) throw new Error('MODULE_LOCKED');
    const r = resolveQuiz(moduleId);
    if (!r) throw new Error('NO_QUIZ');
    return {
      moduleId, title: r.quiz.title || `Test — ${r.module.title}`, source: r.source,
      passingScore: st.quiz.passingScore, timeLimitSec: r.quiz.timeLimitSec || null,
      questions: quizEngine.publicQuestions(r.quiz),
    };
  });
  handle('quiz:submit', 'user', (moduleId, answers, durationSec) => {
    const st = moduleState(moduleId);
    if (session.role !== 'admin' && (!st.unlocked || !st.viewed)) throw new Error('MODULE_LOCKED');
    const r = resolveQuiz(moduleId);
    if (!r) throw new Error('NO_QUIZ');
    const { score, details } = quizEngine.grade(r.quiz, answers);
    const passed = score >= st.quiz.passingScore;
    db.prepare('INSERT INTO quiz_results(user_id,module_id,score,passed,answers_json,duration_sec,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(session.id, moduleId, score, passed ? 1 : 0, JSON.stringify(answers || {}), Math.round(Number(durationSec) || 0), Date.now());
    return { score, passed, passingScore: st.quiz.passingScore, details };
  });

  // ---------- Admin ----------
  handle('admin:users:list', 'admin', () =>
    db.prepare('SELECT id,username,role,full_name,active,created_at,last_login_at FROM users ORDER BY role, username').all());
  handle('admin:users:create', 'admin', ({ username, password, fullName, role }) => {
    username = String(username || '').trim();
    if (!/^[\w.\-@]{3,40}$/.test(username)) throw new Error('BAD_USERNAME');
    if (String(password || '').length < 6) throw new Error('PASSWORD_TOO_SHORT');
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw new Error('USER_EXISTS');
    db.prepare('INSERT INTO users(username,password_hash,role,full_name,must_change_password,created_at) VALUES(?,?,?,?,1,?)')
      .run(username, bcrypt.hashSync(password, 10), role === 'admin' ? 'admin' : 'student', fullName || '', Date.now());
    return true;
  });
  handle('admin:users:resetPassword', 'admin', (id, password) => {
    if (String(password || '').length < 6) throw new Error('PASSWORD_TOO_SHORT');
    db.prepare('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?').run(bcrypt.hashSync(password, 10), id);
    return true;
  });
  handle('admin:users:setActive', 'admin', (id, active) => {
    if (id === session.id) throw new Error('SELF_FORBIDDEN');
    db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, id); return true;
  });
  handle('admin:users:resetProgress', 'admin', (id) => {
    db.prepare('DELETE FROM progress WHERE user_id=?').run(id);
    db.prepare('DELETE FROM quiz_results WHERE user_id=?').run(id); return true;
  });
  handle('admin:users:delete', 'admin', (id) => {
    if (id === session.id) throw new Error('SELF_FORBIDDEN');
    db.prepare('DELETE FROM users WHERE id=?').run(id); return true;
  });

  const resultsRows = () => {
    getTree();
    return db.prepare(
      `SELECT q.id, u.username, u.full_name, q.module_id, q.score, q.passed, q.duration_sec, q.created_at
       FROM quiz_results q JOIN users u ON u.id=q.user_id ORDER BY q.created_at DESC LIMIT 5000`
    ).all().map((r) => ({ ...r, module: moduleIndex.get(r.module_id)?.module.title || r.module_id, course: moduleIndex.get(r.module_id)?.course.title || '' }));
  };
  handle('admin:results:list', 'admin', () => resultsRows().slice(0, 1000));
  handle('admin:results:export', 'admin', () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Date', 'Utilisateur', 'Nom', 'Cours', 'Module', 'Score (%)', 'Réussi', 'Durée (s)'];
    const lines = resultsRows().map((r) => [new Date(r.created_at).toISOString(), r.username, r.full_name, r.course, r.module, r.score, r.passed ? 'oui' : 'non', r.duration_sec].map(esc).join(';'));
    const dir = path.join(config.dataDir, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `resultats_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}.csv`);
    fs.writeFileSync(file, '﻿' + [head.map(esc).join(';'), ...lines].join('\r\n'), 'utf8');
    return { file };
  });

  handle('admin:settings:get', 'admin', () => getSettings());
  handle('admin:settings:set', 'admin', (s) => {
    if (typeof s.courseRoot === 'string' && s.courseRoot.trim()) setSetting('courseRoot', s.courseRoot.trim());
    if (s.minScore != null) setSetting('minScore', clamp(s.minScore, 0, 100));
    if (s.autoQuiz != null) setSetting('autoQuiz', !!s.autoQuiz);
    if (s.allowSkip != null) setSetting('allowSkip', !!s.allowSkip);
    tree = null; return getSettings();
  });
  handle('admin:quiz:read', 'admin', (moduleId) => {
    getTree();
    const e = moduleIndex.get(moduleId);
    if (!e) throw new Error('MODULE_UNKNOWN');
    const f = path.join(e.module.absPath, 'quiz.json');
    return { exists: fs.existsSync(f), text: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : JSON.stringify(quizEngine.QUIZ_TEMPLATE, null, 2) };
  });
  handle('admin:quiz:save', 'admin', (moduleId, text) => {
    getTree();
    const e = moduleIndex.get(moduleId);
    if (!e) throw new Error('MODULE_UNKNOWN');
    let obj;
    try { obj = JSON.parse(text); } catch (err) { return { saved: false, errors: [`JSON invalide : ${err.message}`] }; }
    const errors = quizEngine.validateQuiz(obj);
    if (errors.length) return { saved: false, errors };
    fs.writeFileSync(path.join(e.module.absPath, 'quiz.json'), JSON.stringify(obj, null, 2), 'utf8');
    tree = null;
    return { saved: true, errors: [] };
  });
  handle('admin:modules:list', 'admin', () => { getTree(); return [...moduleIndex.values()].map(({ course, module }) => ({ id: module.id, label: `${course.title} › ${module.title}` })); });
  // Sortie contrôlée de l'application (seul moyen de quitter) : re-saisie du mot de passe admin.
  handle('admin:exit', 'admin', (password) => {
    const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(session.id);
    if (!bcrypt.compareSync(String(password || ''), u.password_hash)) throw new Error('BAD_CREDENTIALS');
    quitApp(); return true;
  });

  return {
    getCourseRoot, resolveMedia,
    isLoggedIn: () => !!session,
    stop: () => { try { watcher?.close(); } catch { /* ignoré */ } },
  };
}

module.exports = { createServices };
