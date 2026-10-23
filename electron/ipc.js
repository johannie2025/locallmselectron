'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const { scanRoot, MEDIA_EXT } = require('./courseScanner');
const pptxConvert = require('./pptxConvert');
const { buildView } = require('./gating');
const quizEngine = require('./quizEngine');
const license = require('./license');
const clockGuard = require('./clockGuard');
const appCatalog = require('./appCatalog');
const { spawn: nodeSpawn } = require('child_process');
const { AsyncLocalStorage } = require('async_hooks');

const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
const toPosix = (p) => p.split(path.sep).join('/');
const DUMMY_HASH = bcrypt.hashSync('wls-dummy', 10); // temps de réponse constant même si l'utilisateur n'existe pas
// Anti force-brute : 5 échecs consécutifs sur un identifiant → blocage de 30 s
const fails = new Map();
const guard = (key) => { const f = fails.get(key); if (f && f.until > Date.now()) throw new Error('TOO_MANY_ATTEMPTS'); };
const fail = (key) => { const f = fails.get(key) || { n: 0, until: 0 }; f.n += 1; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 30000; } fails.set(key, f); };
const pass = (key) => fails.delete(key);
const LANGS = new Set(['fr', 'en', 'es']);
const HEX = /^#[0-9a-f]{6}$/i;
const IMG_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
// Canaux utilisables même quand la licence est expirée (écran de verrouillage)
const LICENSE_OPEN = new Set(['net:verifyAdmin', 'license:status', 'license:activate', 'license:issueHere', 'system:info', 'system:power', 'auth:adminExit', 'branding:get', 'auth:me', 'auth:logout']);
// Canaux qui concernent CE poste (jamais transmis au serveur, jamais appelables à distance) : licence du poste, applications installées,
// alimentation, impression, sortie du kiosque, configuration réseau.
const LOCAL_ONLY = new Set([
  'license:status', 'license:activate', 'license:issueHere', 'license:issue', 'maintenance:create', 'system:info', 'system:power',
  'apps:list', 'apps:launch', 'admin:apps:get', 'admin:apps:save', 'print:page', 'print:pdf', 'auth:adminExit', 'admin:exit',
  'net:getConfig', 'net:setMode', 'net:newPairCode', 'net:revokeClient', 'net:pair', 'net:restart',
]);
const CSV_HEAD = {
  fr: ['Date', 'Utilisateur', 'Nom', 'Classe', 'Cours', 'Module', 'Score (%)', 'Réussi', 'Durée (s)'],
  en: ['Date', 'Username', 'Name', 'Class', 'Course', 'Module', 'Score (%)', 'Passed', 'Duration (s)'],
  es: ['Fecha', 'Usuario', 'Nombre', 'Clase', 'Curso', 'Módulo', 'Nota (%)', 'Aprobado', 'Duración (s)'],
};
const YES = { fr: ['oui', 'non'], en: ['yes', 'no'], es: ['sí', 'no'] };

function createServices({ db, config, getWindow, quitApp, setOnTop, log, onExternalApp = () => {}, sysInfo = () => ({ platform: process.platform }), power = () => false, net = {}, spawn = nodeSpawn, exists = fs.existsSync, platform = process.platform }) {
  const netClient = net.client || null; // mode client : les canaux de données sont transmis au serveur
  let treeVersion = 1;
  // Session : poste local = une seule session à la fois ; serveur réseau = un « holder » par poste client (AsyncLocalStorage)
  const als = new AsyncLocalStorage();
  const localHolder = { session: null };
  const H = () => als.getStore() || localHolder;
  const cur = () => H().session;
  let tree = null;
  let watcher = null;
  let watchedRoot = null;
  const itemIndex = new Map();
  const itemModule = new Map(); // id d'item → module (pour l'ordre des leçons)
  const moduleIndex = new Map(); // moduleId -> { course, module }
  let licCache = null;

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
    allowSkip: getSetting('allowSkip', false), // autoriser l'avance rapide vidéo/audio
  });
  const getCourseRoot = () => path.resolve(getSettings().courseRoot);

  // ---------- Licence ----------
  function licenseInfo(force = false) {
    const now = Date.now();
    if (!force && licCache && now - licCache.at < 15000) return licCache.v;
    const info = license.machineInfo();
    let v;
    if (!info.ok) {
      // Identifiant matériel illisible (PowerShell/WMI bloqués ?) : on verrouille, mais SANS mémoriser l'échec (nouvelle tentative sous 60 s)
      v = { machineId: '', plan: null, expiresAt: null, daysLeft: null, customer: null, locked: true, state: 'noid' };
    } else {
      let first = getSetting('license.firstRun', null);
      if (first == null) { first = now; setSetting('license.firstRun', first); }
      // dernière date vue : le plus récent des 3 emplacements (base, fichier caché, registre) — voir clockGuard.js
      const lastSeen = Math.max(getSetting('license.lastSeen', 0), clockGuard.readSeen(config.dataDir, info.id));
      v = license.evaluate({ machine: info.id, key: getSetting('license.key', null), firstRun: first, lastSeen, trialDays: license.TRIAL_DAYS, now });
      if (v.state !== 'clock' && now - lastSeen > 60000) { setSetting('license.lastSeen', now); clockGuard.writeSeen(config.dataDir, info.id, now); }
    }
    v = { ...v, idStrength: info.strength || null };
    licCache = { at: now, v };
    return v;
  }

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
    itemIndex.clear(); moduleIndex.clear(); itemModule.clear();
    for (const c of tree.courses) for (const m of c.modules) {
      moduleIndex.set(m.id, { course: c, module: m });
      for (const it of m.items) { itemIndex.set(it.id, it); itemModule.set(it.id, m); }
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
        timer = setTimeout(() => { tree = null; treeVersion += 1; getWindow()?.webContents.send('courses:changed'); }, 1500);
      });
      watcher.on('error', () => { watcher = null; });
    } catch (e) { log(`watch: ${e.message}`); }
  }

  // ---------- Inscriptions / périmètre d'un utilisateur ----------
  const allowedCourseIds = (uid) =>
    new Set(db.prepare(
      `SELECT course_id FROM enrollments WHERE user_id=?
       UNION SELECT cc.course_id FROM class_courses cc JOIN users u ON u.class_id=cc.class_id WHERE u.id=?`
    ).all(uid, uid).map((r) => r.course_id));

  const progressMapFor = (uid) => new Map(db.prepare('SELECT * FROM progress WHERE user_id=?').all(uid).map((r) => [r.item_id, r]));
  const quizBestFor = (uid) => new Map(
    db.prepare('SELECT module_id, MAX(score) best, COUNT(*) attempts FROM quiz_results WHERE user_id=? GROUP BY module_id').all(uid)
      .map((r) => [r.module_id, r]));

  /** Vue (déblocage, progression) d'un utilisateur ; un étudiant ne voit que ses cours inscrits. */
  function viewFor(uid, isAdmin, progress = progressMapFor(uid), quizBest = quizBestFor(uid), allowed = allowedCourseIds(uid)) {
    const t = getTree();
    const scoped = isAdmin ? t : { ...t, courses: t.courses.filter((c) => allowed.has(c.id)) };
    return buildView(scoped, { progress, quizBest, settings: getSettings(), isAdmin });
  }

  function ensureCertificates(uid) {
    const v = viewFor(uid, false);
    const best = quizBestFor(uid);
    for (const c of v.courses) {
      if (!c.totalModules || c.percent !== 100) continue;
      if (db.prepare('SELECT 1 FROM certificates WHERE user_id=? AND course_id=?').get(uid, c.id)) continue;
      const scores = c.modules.filter((m) => m.quiz.required).map((m) => best.get(m.id)?.best).filter((x) => x != null);
      const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
      const r = db.prepare('INSERT INTO certificates(number,user_id,course_id,avg_score,issued_at) VALUES(?,?,?,?,?)')
        .run(`TMP-${uid}-${Date.now()}-${Math.random()}`, uid, c.id, avg, Date.now());
      db.prepare('UPDATE certificates SET number=? WHERE id=?')
        .run(`WLS-${new Date().getFullYear()}-${String(r.lastInsertRowid).padStart(5, '0')}`, r.lastInsertRowid);
    }
  }

  function currentView() {
    const v = viewFor(cur().id, isStaff(cur().role));
    const t = getTree();
    const certs = new Map(db.prepare('SELECT course_id, number, issued_at FROM certificates WHERE user_id=?').all(cur().id).map((r) => [r.course_id, r]));
    v.courses.forEach((c) => { const x = certs.get(c.id); c.certificate = x ? { number: x.number, issuedAt: x.issued_at } : null; });
    return { ...v, error: t.error || null, stale: !!t.stale, scannedAt: t.scannedAt, warnings: isStaff(cur().role) ? t.warnings || [] : [], settings: { allowSkip: getSettings().allowSkip } };
  }
  function moduleState(moduleId) {
    const v = currentView();
    for (const c of v.courses) { const m = c.modules.find((x) => x.id === moduleId); if (m) return m; }
    throw new Error('MODULE_UNKNOWN');
  }

  /** Résolution SÉCURISÉE d'un média : reste dans la racine, extension autorisée, cours autorisé pour l'étudiant. */
  function resolveMedia(rel) {
    if (!cur() || licenseInfo().locked) return null;
    const root = getCourseRoot();
    const abs = path.resolve(root, rel);
    const r = path.relative(root, abs);
    if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
    if (!MEDIA_EXT.has(path.extname(abs).toLowerCase())) return null;
    if (!isStaff(cur().role) && !allowedCourseIds(cur().id).has(toPosix(r).split('/')[0])) return null;
    if (!isStaff(cur().role) && itemIndex.has(toPosix(r)) && !lessonUnlocked(toPosix(r))) return null;
    try { if (!fs.statSync(abs).isFile()) return null; } catch { return null; }
    return abs;
  }

  /** Leçons en séquence (étudiants) : une leçon n'est lisible que si les leçons obligatoires qui la précèdent dans le module sont terminées. */
  function lessonUnlocked(itemId) {
    if (isStaff(cur().role)) return true;
    const m = itemModule.get(itemId);
    if (!m) return true;
    const idx = m.items.findIndex((i) => i.id === itemId);
    const prev = m.items.slice(0, idx);
    if (!prev.length) return true;
    const done = new Set(db.prepare('SELECT item_id FROM progress WHERE user_id=? AND completed=1').all(cur().id).map((r) => r.item_id));
    return prev.every((i) => (!i.required || done.has(i.id)) && (!i.quizFile || lessonQuizPassed(i, m)));
  }
  /** Test de leçon réussi ? (meilleure note ≥ seuil) */
  function lessonQuizPassed(it, m) {
    const e = moduleIndex.get(m.id);
    const ps = it.quizPassingScore ?? m.minScore ?? e?.course.minScore ?? getSettings().minScore;
    const r = db.prepare('SELECT MAX(score) best FROM quiz_results WHERE user_id=? AND module_id=?').get(cur().id, `lq:${it.id}`);
    return r?.best != null && r.best >= ps;
  }
  /** Contexte d'un test de leçon (identifiant « lq:<id de la leçon> »), ou null pour un test de module. */
  function lessonQuizCtx(id) {
    if (!String(id).startsWith('lq:')) return null;
    getTree();
    const itemId = String(id).slice(3);
    const it = itemIndex.get(itemId); const m = itemModule.get(itemId);
    if (!it || !m || !it.quizFile) throw new Error('MODULE_UNKNOWN');
    const course = moduleIndex.get(m.id).course;
    const passingScore = it.quizPassingScore ?? m.minScore ?? course.minScore ?? getSettings().minScore;
    if (!isStaff(cur().role)) {
      if (!allowedCourseIds(cur().id).has(course.id) || !lessonUnlocked(itemId)) throw new Error('LESSON_LOCKED');
      if (it.required && !db.prepare('SELECT 1 FROM progress WHERE user_id=? AND item_id=? AND completed=1').get(cur().id, itemId)) throw new Error('LESSON_LOCKED');
    }
    const r = quizEngine.readQuizFile(path.join(getCourseRoot(), it.quizFile));
    if (!r.quiz) throw new Error('NO_QUIZ');
    return { it, m, course, passingScore, quiz: r.quiz };
  }

  function resolveQuiz(moduleId, lang) {
    getTree();
    const e = moduleIndex.get(moduleId);
    if (!e) throw new Error('MODULE_UNKNOWN');
    if (e.module.quiz?.valid) {
      const r = quizEngine.readQuizFile(path.join(getCourseRoot(), e.module.quiz.file));
      if (r.quiz) return { quiz: r.quiz, source: 'file', ...e };
    }
    if (getSettings().autoQuiz) {
      const q = quizEngine.autoQuiz(e.course, e.module, LANGS.has(lang) ? lang : 'fr');
      if (q) return { quiz: q, source: 'auto', ...e };
    }
    return null;
  }

  // ---------- Relevés / certificats / statistiques ----------
  function buildTranscript(uid) {
    const u = db.prepare('SELECT u.id,u.username,u.full_name,c.name class_name FROM users u LEFT JOIN classes c ON c.id=u.class_id WHERE u.id=?').get(uid);
    if (!u) throw new Error('USER_UNKNOWN');
    const v = viewFor(uid, false);
    const certs = new Map(db.prepare('SELECT * FROM certificates WHERE user_id=?').all(uid).map((r) => [r.course_id, r]));
    return {
      generatedAt: Date.now(),
      student: { id: u.id, username: u.username, fullName: u.full_name || u.username, className: u.class_name || '' },
      courses: v.courses.map((c) => ({
        id: c.id, title: c.title, progress: c.progress, completed: c.percent === 100 && c.totalModules > 0,
        certificate: certs.get(c.id) ? { number: certs.get(c.id).number, issuedAt: certs.get(c.id).issued_at, avgScore: certs.get(c.id).avg_score } : null,
        modules: c.modules.map((m) => ({ title: m.title, viewedPercent: m.viewedPercent, quizRequired: m.quiz.required, bestScore: m.quiz.bestScore, passingScore: m.quiz.passingScore, attempts: m.quiz.attempts, completed: m.completed })),
      })),
    };
  }

  function certificateData(uid, courseId) {
    const c = db.prepare('SELECT * FROM certificates WHERE user_id=? AND course_id=?').get(uid, courseId);
    if (!c) throw new Error('NOT_COMPLETED');
    const u = db.prepare('SELECT username, full_name FROM users WHERE id=?').get(uid);
    getTree();
    const course = tree.courses.find((x) => x.id === courseId);
    return { number: c.number, issuedAt: c.issued_at, avgScore: c.avg_score, student: { fullName: u.full_name || u.username, username: u.username }, course: { id: courseId, title: course?.title || courseId } };
  }

  function statsOverview() {
    getTree();
    const students = db.prepare(`SELECT u.id,u.username,u.full_name,u.class_id,u.last_login_at,c.name class_name FROM users u LEFT JOIN classes c ON c.id=u.class_id WHERE u.role='student' AND u.active=1`).all();
    const progress = new Map(); for (const r of db.prepare('SELECT * FROM progress').all()) { if (!progress.has(r.user_id)) progress.set(r.user_id, new Map()); progress.get(r.user_id).set(r.item_id, r); }
    const best = new Map(); for (const r of db.prepare('SELECT user_id, module_id, MAX(score) best, COUNT(*) attempts FROM quiz_results GROUP BY user_id, module_id').all()) { if (!best.has(r.user_id)) best.set(r.user_id, new Map()); best.get(r.user_id).set(r.module_id, r); }
    const allowed = new Map(); const add = (uid, cid) => { if (!allowed.has(uid)) allowed.set(uid, new Set()); allowed.get(uid).add(cid); };
    db.prepare('SELECT user_id, course_id FROM enrollments').all().forEach((r) => add(r.user_id, r.course_id));
    db.prepare('SELECT u.id user_id, cc.course_id FROM users u JOIN class_courses cc ON cc.class_id=u.class_id').all().forEach((r) => add(r.user_id, r.course_id));
    const certCount = new Map(db.prepare('SELECT user_id, COUNT(*) n FROM certificates GROUP BY user_id').all().map((r) => [r.user_id, r.n]));
    const weekAgo = Date.now() - 7 * 86400000;

    const byCourse = new Map(tree.courses.map((c) => [c.id, { id: c.id, title: c.title, enrolled: 0, sumProgress: 0, completed: 0 }]));
    const byClass = new Map();
    const rows = students.map((s) => {
      const v = viewFor(s.id, false, progress.get(s.id) || new Map(), best.get(s.id) || new Map(), allowed.get(s.id) || new Set());
      const courses = v.courses.map((c) => ({ id: c.id, title: c.title, progress: c.progress, completed: c.percent === 100 && c.totalModules > 0 }));
      courses.forEach((c) => { const b = byCourse.get(c.id); if (b) { b.enrolled++; b.sumProgress += c.progress; if (c.completed) b.completed++; } });
      const avg = courses.length ? Math.round(courses.reduce((a, c) => a + c.progress, 0) / courses.length) : 0;
      const key = s.class_id ?? 0;
      if (!byClass.has(key)) byClass.set(key, { id: key, name: s.class_name || '', students: 0, sum: 0, withCourses: 0, completed: 0 });
      const k = byClass.get(key); k.students++; if (courses.length) { k.sum += avg; k.withCourses++; } k.completed += courses.filter((c) => c.completed).length;
      return { id: s.id, username: s.username, fullName: s.full_name || s.username, classId: s.class_id, className: s.class_name || '', courses, avg, lastLogin: s.last_login_at, certificates: certCount.get(s.id) || 0 };
    });

    // activité des 14 derniers jours + distribution des notes
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ ts: d.getTime(), day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, attempts: 0, passed: 0 }); }
    const buckets = [0, 0, 0, 0, 0, 0]; // <50, 50-59, 60-69, 70-79, 80-89, 90+
    let scoreSum = 0, scoreN = 0;
    for (const r of db.prepare('SELECT score, passed, created_at FROM quiz_results').all()) {
      scoreSum += r.score; scoreN++;
      buckets[r.score < 50 ? 0 : r.score >= 90 ? 5 : Math.floor(r.score / 10) - 4]++;
      for (let i = days.length - 1; i >= 0; i--) if (r.created_at >= days[i].ts) { days[i].attempts++; if (r.passed) days[i].passed++; break; }
    }
    const completedPairs = rows.reduce((a, r) => a + r.courses.filter((c) => c.completed).length, 0);
    const totalPairs = rows.reduce((a, r) => a + r.courses.length, 0);
    return {
      totals: {
        students: rows.length, classes: db.prepare('SELECT COUNT(*) c FROM classes').get().c, courses: tree.courses.length,
        enrollments: totalPairs, active7: students.filter((s) => (s.last_login_at || 0) > weekAgo).length,
        certificates: db.prepare('SELECT COUNT(*) c FROM certificates').get().c, avgScore: scoreN ? Math.round((scoreSum / scoreN) * 10) / 10 : null,
        completionRate: totalPairs ? Math.round((completedPairs / totalPairs) * 100) : 0, attempts: scoreN,
      },
      byCourse: [...byCourse.values()].map((b) => ({ id: b.id, title: b.title, enrolled: b.enrolled, avgProgress: b.enrolled ? Math.round(b.sumProgress / b.enrolled) : 0, completed: b.completed })),
      byClass: [...byClass.values()].map((k) => ({ id: k.id, name: k.name, students: k.students, avgProgress: k.withCourses ? Math.round(k.sum / k.withCourses) : 0, completed: k.completed })),
      activity: days.map(({ day, attempts, passed }) => ({ day, attempts, passed })),
      scoreDist: buckets,
      students: rows,
    };
  }

  // ---------- Enregistrement des handlers ----------
  // Profils : superadmin (Wise Design) > admin (centre) > trainer (formateur du centre) > student
  const RANK = { student: 0, trainer: 1, admin: 2, superadmin: 3 };
  const isStaff = (r) => RANK[r] >= 1;
  const isManager = (r) => RANK[r] >= 2;
  /** Rôles qu'un profil peut créer / attribuer : toujours inférieurs au sien (le superadmin peut créer un autre superadmin). */
  const grantable = (r) => (r === 'superadmin' ? ['student', 'trainer', 'admin', 'superadmin'] : Object.keys(RANK).filter((k) => RANK[k] < RANK[r]));
  /** Cible modifiable par la session : rôle strictement inférieur (superadmin : tous). */
  function manageable(id) {
    const u = db.prepare('SELECT id,role FROM users WHERE id=?').get(id);
    if (!u) throw new Error('NOT_FOUND');
    if (cur().role !== 'superadmin' && RANK[u.role] >= RANK[cur().role]) throw new Error('FORBIDDEN');
    return u;
  }
  const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, fullName: u.full_name || '', mustChange: !!u.must_change_password, lang: u.lang || null });
  const dec = (v) => (v == null ? null : v);
  const registry = new Map(); // canal → { role, fn }
  /**
   * Exécute un canal. holder = null : appel local (interface de ce poste) ; sinon appel d'un poste client via le serveur réseau
   * (session propre au client). En mode client, les canaux de données sont transmis au serveur ; les canaux « poste » restent locaux
   * et s'appuient alors sur l'identité connue du serveur (auth:me).
   */
  async function invoke(channel, args, holder = null) {
    try {
      const reg = registry.get(channel);
      if (!reg) throw new Error('NOT_FOUND');
      if (holder && LOCAL_ONLY.has(channel)) throw new Error('FORBIDDEN');
      if (!LICENSE_OPEN.has(channel) && licenseInfo().locked) throw new Error('LICENSE_LOCKED');
      let h = holder || localHolder;
      if (netClient && !holder) {
        if (!LOCAL_ONLY.has(channel)) return await netClient.call(channel, args);
        h = { session: null };
        if (reg.role) { const me = await netClient.call('auth:me'); h = { session: me.ok ? me.data : null }; }
      }
      return await als.run(h, async () => {
        if (reg.role && !cur()) throw new Error('AUTH_REQUIRED');
        if (reg.role === 'staff' && !isStaff(cur().role)) throw new Error('FORBIDDEN');
        if (reg.role === 'manager' && !isManager(cur().role)) throw new Error('FORBIDDEN');
        if (reg.role === 'super' && cur().role !== 'superadmin') throw new Error('FORBIDDEN');
        return { ok: true, data: await reg.fn(...args) };
      });
    } catch (err) {
      if (!/^[A-Z_]+$/.test(err.message)) log(`${channel}: ${err.stack || err.message}`);
      return { ok: false, error: err.message };
    }
  }
  function handle(channel, role, fn) {
    registry.set(channel, { role, fn });
    ipcMain.handle(channel, (_e, ...args) => invoke(channel, args));
  }

  /**
   * Vérifie les identifiants d'un compte d'administration. En mode client c'est le SERVEUR qui vérifie ; s'il est injoignable,
   * seul le super-administrateur LOCAL de ce poste (mot de passe changé à l'installation) peut encore faire sortir le kiosque.
   */
  async function checkAdminCreds(username, password, roles) {
    username = String(username || '').trim();
    if (netClient) {
      const r = await netClient.call('net:verifyAdmin', [username, password]);
      if (r.ok) { if (!roles.includes(r.data.role)) throw new Error('BAD_CREDENTIALS'); return r.data.role; }
      if (r.error !== 'SERVER_UNREACHABLE') throw new Error(r.error);
      roles = ['superadmin'];
    }
    const key = 'exit:' + username.toLowerCase();
    guard(key);
    const marks = roles.map(() => '?').join(',');
    const u = db.prepare(`SELECT * FROM users WHERE username=? AND role IN (${marks}) AND active=1`).get(username, ...roles);
    const ok = bcrypt.compareSync(String(password || ''), u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok) { fail(key); throw new Error('BAD_CREDENTIALS'); }
    pass(key);
    return u.role;
  }
  // Appelé par les postes clients (jamais par l'interface) : vérification d'un compte admin/superadmin du serveur
  handle('net:verifyAdmin', null, async (username, password) => ({ role: await checkAdminCreds(username, password, ['admin', 'superadmin']) }));

  // Auth
  handle('auth:login', null, (username, password) => {
    const key = 'login:' + String(username || '').trim().toLowerCase();
    guard(key);
    const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username || '').trim());
    const ok = bcrypt.compareSync(String(password || ''), u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok) { fail(key); throw new Error('BAD_CREDENTIALS'); }
    pass(key);
    db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(Date.now(), u.id);
    H().session = publicUser(u);
    return H().session;
  });
  handle('auth:logout', null, () => { H().session = null; return true; });
  handle('auth:me', null, () => cur());
  handle('auth:changePassword', 'user', (oldPwd, newPwd) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(cur().id);
    if (!bcrypt.compareSync(String(oldPwd || ''), u.password_hash)) throw new Error('BAD_CREDENTIALS');
    if (String(newPwd || '').length < 6) throw new Error('PASSWORD_TOO_SHORT');
    db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(bcrypt.hashSync(newPwd, 10), u.id);
    cur().mustChange = false;
    return cur();
  });
  handle('auth:setLang', 'user', (lang) => {
    if (!LANGS.has(lang)) throw new Error('BAD_LANG');
    db.prepare('UPDATE users SET lang=? WHERE id=?').run(lang, cur().id); cur().lang = lang; return true;
  });
  // Sortie contrôlée depuis l'écran de connexion / de licence : identifiants admin requis
  handle('auth:adminExit', null, async (username, password, maintenance) => {
    const role = await checkAdminCreds(username, password, ['admin', 'superadmin']);
    quitApp(!!maintenance); return true; // mot de passe admin / superadmin vérifié ci-dessus
  });

  // ---------- Réseau local : serveur / clients ----------
  const localAddresses = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const netStore = net.store || { get: () => ({ mode: 'standalone', port: 47800, clients: [], server: '', token: '', name: '', pairHash: null, pairExpires: 0 }), update() {}, newPairCode() { throw new Error('NET_NOT_SERVER'); }, revoke() {} };
  const netView = () => {
    const c = netStore.get();
    return {
      mode: netClient ? 'client' : c.mode, configuredMode: c.mode, port: c.port, name: c.name, serverAddr: c.server, paired: !!c.token,
      clients: c.clients.map(({ id, name, pairedAt, lastSeen, addr }) => ({ id, name, pairedAt, lastSeen, addr })),
      pairActive: !!c.pairHash && Date.now() < c.pairExpires, pairExpires: c.pairExpires,
      addresses: localAddresses(), listening: net.serverStatus ? net.serverStatus() : null,
    };
  };
  handle('net:getConfig', 'super', () => netView());
  handle('net:setMode', 'super', ({ mode, port, name } = {}) => {
    if (!['standalone', 'server'].includes(mode)) throw new Error('BAD_MODE'); // le mode client s'obtient par jumelage
    const p = port === undefined || port === '' ? netStore.get().port : Number(port);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Error('BAD_PORT');
    netStore.update(mode === 'server'
      ? { mode, port: p, name: String(name || '').slice(0, 40) }
      : { mode, port: p, server: '', token: '' });
    return netView();
  });
  handle('net:newPairCode', 'super', () => {
    if (netStore.get().mode !== 'server') throw new Error('NET_NOT_SERVER');
    const code = netStore.newPairCode();
    return { code, expires: netStore.get().pairExpires };
  });
  handle('net:revokeClient', 'super', (id) => { netStore.revoke(String(id)); return netView(); });
  handle('net:pair', 'super', async ({ server, code, name } = {}) => {
    const pair = net.pair || require('./netClient').pairWithServer;
    const r = await pair(server, String(code || ''), String(name || os.hostname()).slice(0, 40));
    netStore.update({ mode: 'client', server: r.server, token: r.token, name: String(name || os.hostname()).slice(0, 40) });
    return { ...netView(), serverName: r.serverName };
  });
  handle('net:restart', 'super', () => { setTimeout(() => net.restart && net.restart(), 400); return true; });

  // Poste : informations (compte Windows, mode kiosque/cybercafé/portable) et boutons d'alimentation (fermer la session, redémarrer, éteindre)
  handle('system:info', null, () => sysInfo());
  handle('system:power', null, async (action) => {
    if (!['logoff', 'restart', 'shutdown'].includes(action)) throw new Error('BAD_ACTION');
    log(`power ${action} (${cur() ? cur().username : 'sans session'})`);
    if (!(await power(action))) throw new Error('POWER_FAILED');
    return true;
  });

  // Personnalisation du centre (logo, nom, couleurs) — lisible avant connexion
  handle('branding:get', null, () => {
    const dir = path.join(getCourseRoot(), '_branding');
    const find = (base) => {
      for (const ext of Object.keys(IMG_EXT)) {
        const f = path.join(dir, base + ext);
        try { const st = fs.statSync(f); if (st.isFile() && st.size <= 8 * 1024 * 1024) return `data:${IMG_EXT[ext]};base64,` + fs.readFileSync(f).toString('base64'); } catch { /* absent */ }
      }
      return null;
    };
    return {
      centerName: getSetting('center.name', ''), slogan: getSetting('center.slogan', ''),
      primary: getSetting('center.primary', ''), secondary: getSetting('center.secondary', ''),
      address: getSetting('center.address', ''), phone: getSetting('center.phone', ''), email: getSetting('center.email', ''), website: getSetting('center.website', ''),
      logo: find('logo'), loginBg: find('login-bg'), appBg: find('app-bg'),
    };
  });

  // Licence
  handle('license:status', null, () => ({ ...licenseInfo(true), trialDays: license.TRIAL_DAYS }));
  function activateKey(key) {
    const info = license.machineInfo();
    if (!info.ok) throw new Error('NO_MACHINE_ID');
    const r = license.verifyKey(key, info.id);
    if (!r.payload) throw new Error(r.error);
    if (Date.parse(r.payload.expires) <= Date.now()) throw new Error('KEY_EXPIRED');
    setSetting('license.key', String(key).replace(/\s+/g, ''));
    // Seule une clé ÉMISE PLUS RÉCEMMENT que la précédente remet la protection d'horloge à zéro (déblocage après une horloge
    // déréglée, via une clé de renouvellement de Wise Design). Ressaisir une ancienne clé ne débloque rien.
    const issued = String(r.payload.issued || '');
    const prev = getSetting('license.issued', '');
    if (!prev || issued > prev) {
      setSetting('license.issued', issued);
      setSetting('license.lastSeen', Date.now());
      clockGuard.writeSeen(config.dataDir, info.id, Date.now());
    }
    return licenseInfo(true);
  }
  handle('license:activate', null, (key) => activateKey(key));

  // Émission SUR SITE par Wise Design. La clé privée n'est jamais stockée : elle est collée/choisie à chaque fois, utilisée
  // en mémoire pour signer, puis oubliée. Depuis l'écran verrouillé : identifiants superadmin requis.
  const issueOpts = (o = {}) => ({ plan: o.plan, customer: o.customer, start: o.start || undefined });
  handle('license:issueHere', null, async (username, password, pem, opts) => {
    await checkAdminCreds(username, password, ['superadmin']);
    const info = license.machineInfo();
    if (!info.ok) throw new Error('NO_MACHINE_ID');
    const { key: k } = license.issueKey({ machine: info.id, privateKeyPem: pem, ...issueOpts(opts) });
    return activateKey(k);
  });
  // Superadmin connecté : génère une clé pour N'IMPORTE QUEL poste (ID saisi) ; l'active ici si c'est ce poste.
  handle('license:issue', 'super', (pem, { machine, activate, ...opts } = {}) => {
    const { key, payload } = license.issueKey({ machine: String(machine || '').trim().toUpperCase(), privateKeyPem: pem, ...issueOpts(opts) });
    const info = license.machineInfo();
    const here = info.ok && info.id === payload.mid;
    if (activate && here) activateKey(key);
    return { key, plan: payload.plan, expires: payload.expires, machine: payload.mid, activated: !!(activate && here) };
  });

  // Clé de maintenance (super-administrateur) : écrit WLS-Maintenance\maintenance.json (+ installeur) sur la clé USB indiquée. La clé privée n'est jamais conservée.
  handle('maintenance:create', 'super', (pem, { hours, target, installer } = {}) => {
    const dir = String(target || '').trim();
    if (!path.isAbsolute(dir) || !(() => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } })()) throw new Error('BAD_TARGET');
    let inst = null;
    const ip = String(installer || '').trim();
    if (ip) {
      if (!path.isAbsolute(ip) || !/\.exe$/i.test(ip) || !(() => { try { return fs.statSync(ip).isFile(); } catch { return false; } })()) throw new Error('BAD_INSTALLER');
      const h = require('crypto').createHash('sha256'); const fd = fs.openSync(ip, 'r'); const buf = Buffer.alloc(1 << 20);
      try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
      inst = { name: path.basename(ip), sha256: h.digest('hex'), src: ip };
    }
    const { token, payload } = require('./maintenanceKey').issueToken({ hours: Number(hours) || 24, installer: inst, privateKeyPem: pem });
    const out = path.join(dir, 'WLS-Maintenance'); fs.mkdirSync(out, { recursive: true });
    if (inst) fs.copyFileSync(inst.src, path.join(out, inst.name));
    fs.writeFileSync(path.join(out, 'maintenance.json'), token + '\n');
    log(`maintenance:create → ${out} (${hours} h${inst ? ', installeur ' + inst.name : ''})`);
    return { dir: out, expires: payload.expires, installer: inst ? inst.name : null };
  });

  // PowerPoint : conversion en PDF (PowerPoint ou LibreOffice), mise en cache ; renvoie le chemin relatif du PDF, servi ensuite comme un PDF ordinaire
  handle('pptx:prepare', 'user', async (itemId) => {
    getTree();
    const it = itemIndex.get(String(itemId));
    if (!it || it.type !== 'pptx') throw new Error('NOT_FOUND');
    const root = getCourseRoot();
    const abs = path.resolve(root, it.relPath);
    if (!isStaff(cur().role) && !allowedCourseIds(cur().id).has(toPosix(it.relPath).split('/')[0])) throw new Error('FORBIDDEN');
    if (!lessonUnlocked(it.id)) throw new Error('LESSON_LOCKED');
    const pdf = await pptxConvert.convert(abs, { platform, log });
    return { id: toPosix(path.relative(root, pdf)) };
  });

  // ---------- Applications externes (Office, outils de dev…) choisies par le centre ----------
  const getApps = () => getSetting('apps', []);
  handle('apps:list', 'user', () => getApps().filter((a) => a.enabled && exists(a.path)).map(({ id, name, icon }) => ({ id, name, icon })));
  handle('apps:launch', 'user', (id) => {
    const a = getApps().find((x) => x.id === String(id) && x.enabled);
    if (!a) throw new Error('NOT_FOUND');
    const v = appCatalog.validateApp(a, platform === 'win32'); // revalidé à chaque lancement (liste noire, chemin)
    if (!exists(v.path)) throw new Error('APP_MISSING');
    const child = spawn(v.path, appCatalog.splitArgs(v.args), { detached: true, stdio: 'ignore', cwd: path.dirname(v.path) });
    child.on('error', (e) => log(`apps:launch ${v.name}: ${e.message}`));
    if (child.unref) child.unref();
    log(`apps:launch ${v.name} (${cur().username})`);
    onExternalApp({ name: v.name, child });
    return true;
  });
  handle('admin:apps:get', 'manager', () => ({ apps: getApps().map((a) => ({ ...a, exists: exists(a.path) })), detected: appCatalog.detect(process.env, exists) }));
  handle('admin:apps:save', 'manager', (list) => {
    if (!Array.isArray(list) || list.length > 40) throw new Error('BAD_NAME');
    const seen = new Set();
    const out = list.map((a, i) => {
      const v = appCatalog.validateApp(a, platform === 'win32');
      let id = v.id || `app${Date.now().toString(36)}${i}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      return { ...v, id };
    });
    setSetting('apps', out);
    return out.map((a) => ({ ...a, exists: exists(a.path) }));
  });

  // Cours / progression
  handle('courses:list', 'user', () => currentView());
  handle('courses:rescan', 'staff', () => { tree = null; treeVersion += 1; return currentView(); });
  handle('progress:update', 'user', ({ itemId, percent, positionSec }) => {
    getTree();
    const it = itemIndex.get(itemId);
    if (!it) throw new Error('ITEM_UNKNOWN');
    if (!isStaff(cur().role) && !allowedCourseIds(cur().id).has(itemId.split('/')[0])) throw new Error('FORBIDDEN');
    if (!lessonUnlocked(itemId)) throw new Error('LESSON_LOCKED');
    const pct = clamp(percent, 0, 100);
    db.prepare(
      `INSERT INTO progress(user_id,item_id,percent,position_sec,completed,updated_at) VALUES(?,?,?,?,?,?)
       ON CONFLICT(user_id,item_id) DO UPDATE SET percent=MAX(percent,excluded.percent), position_sec=excluded.position_sec,
         completed=MAX(completed,excluded.completed), updated_at=excluded.updated_at`
    ).run(cur().id, itemId, pct, Number(positionSec) || 0, pct >= 98 ? 1 : 0, Date.now());
    if (pct >= 98 && cur().role === 'student') ensureCertificates(cur().id);
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
  handle('quiz:get', 'user', (moduleId, lang) => {
    const lc = lessonQuizCtx(moduleId);
    if (lc) return { moduleId, title: lc.quiz.title || lc.it.title, source: 'lesson', passingScore: lc.passingScore, timeLimitSec: lc.quiz.timeLimitSec || null, questions: quizEngine.publicQuestions(lc.quiz) };
    const st = moduleState(moduleId);
    if (!isStaff(cur().role) && (!st.unlocked || !st.viewed)) throw new Error('MODULE_LOCKED');
    const r = resolveQuiz(moduleId, lang);
    if (!r) throw new Error('NO_QUIZ');
    return {
      moduleId, title: r.quiz.title || '', source: r.source, passingScore: st.quiz.passingScore,
      timeLimitSec: r.quiz.timeLimitSec || null, questions: quizEngine.publicQuestions(r.quiz),
    };
  });
  handle('quiz:submit', 'user', (moduleId, answers, durationSec, lang) => {
    const lc = lessonQuizCtx(moduleId);
    if (lc) {
      const { score, details } = quizEngine.grade(lc.quiz, answers);
      const passed = score >= lc.passingScore;
      db.prepare('INSERT INTO quiz_results(user_id,module_id,score,passed,answers_json,duration_sec,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(cur().id, moduleId, score, passed ? 1 : 0, JSON.stringify(answers || {}), Math.round(Number(durationSec) || 0), Date.now());
      let certificate = false;
      if (passed && cur().role === 'student') {
        const before = db.prepare('SELECT COUNT(*) c FROM certificates WHERE user_id=?').get(cur().id).c;
        ensureCertificates(cur().id);
        certificate = db.prepare('SELECT COUNT(*) c FROM certificates WHERE user_id=?').get(cur().id).c > before;
      }
      return { score, passed, passingScore: lc.passingScore, details, certificate };
    }
    const st = moduleState(moduleId);
    if (!isStaff(cur().role) && (!st.unlocked || !st.viewed)) throw new Error('MODULE_LOCKED');
    const r = resolveQuiz(moduleId, lang);
    if (!r) throw new Error('NO_QUIZ');
    const { score, details } = quizEngine.grade(r.quiz, answers);
    const passed = score >= st.quiz.passingScore;
    db.prepare('INSERT INTO quiz_results(user_id,module_id,score,passed,answers_json,duration_sec,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(cur().id, moduleId, score, passed ? 1 : 0, JSON.stringify(answers || {}), Math.round(Number(durationSec) || 0), Date.now());
    let certificate = false;
    if (passed && cur().role === 'student') {
      const before = db.prepare('SELECT COUNT(*) c FROM certificates WHERE user_id=?').get(cur().id).c;
      ensureCertificates(cur().id);
      certificate = db.prepare('SELECT COUNT(*) c FROM certificates WHERE user_id=?').get(cur().id).c > before;
    }
    return { score, passed, passingScore: st.quiz.passingScore, details, certificate };
  });

  // Certificat : l'étudiant voit le sien, le formateur celui de n'importe qui
  handle('cert:get', 'user', (courseId, userId) => certificateData(isStaff(cur().role) && userId ? userId : cur().id, courseId));

  // Impression (réservée au formateur) — la boîte de dialogue système passe au premier plan
  handle('print:page', 'staff', () => new Promise((resolve) => {
    const win = getWindow(); if (!win) return resolve(false);
    setOnTop(false);
    win.webContents.print({ silent: false, printBackground: true }, (ok) => { setOnTop(true); resolve(ok); });
  }));
  handle('print:pdf', 'staff', async (name) => {
    const win = getWindow(); if (!win) throw new Error('NO_WINDOW');
    const dir = path.join(config.dataDir, 'exports'); fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'document').replace(/[^\w.\-]+/g, '_').slice(0, 60);
    const file = path.join(dir, `${safe}_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}.pdf`);
    fs.writeFileSync(file, await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }));
    return { file };
  });

  // ---------- Admin : utilisateurs, classes, inscriptions ----------
  handle('admin:users:list', 'staff', () =>
    db.prepare(`SELECT u.id,u.username,u.role,u.full_name,u.active,u.created_at,u.last_login_at,u.class_id,c.name class_name
                FROM users u LEFT JOIN classes c ON c.id=u.class_id ORDER BY u.role, u.username`).all()
      .filter((u) => RANK[u.role] <= RANK[cur().role]) // un profil ne voit jamais les comptes de rang supérieur
      .map((u) => ({ ...u, courses: u.role === 'student' ? allowedCourseIds(u.id).size : null })));
  handle('admin:users:create', 'staff', ({ username, password, fullName, role, classId }) => {
    username = String(username || '').trim();
    if (!/^[\w.\-@]{3,40}$/.test(username)) throw new Error('BAD_USERNAME');
    if (String(password || '').length < 6) throw new Error('PASSWORD_TOO_SHORT');
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw new Error('USER_EXISTS');
    role = grantable(cur().role).includes(role) ? role : 'student';
    db.prepare('INSERT INTO users(username,password_hash,role,full_name,must_change_password,created_at,class_id) VALUES(?,?,?,?,1,?,?)')
      .run(username, bcrypt.hashSync(password, 10), role, fullName || '', Date.now(), classId || null);
    return true;
  });
  handle('admin:users:update', 'staff', (id, { fullName, classId, role }) => {
    const target = manageable(id);
    if (id === cur().id && role && role !== cur().role) throw new Error('SELF_FORBIDDEN');
    if (role && role !== target.role && !grantable(cur().role).includes(role)) throw new Error('FORBIDDEN');
    db.prepare('UPDATE users SET full_name=COALESCE(?,full_name), class_id=?, role=COALESCE(?,role) WHERE id=?')
      .run(dec(fullName), classId || null, role && RANK[role] != null ? role : null, id);
    return true;
  });
  handle('admin:users:resetPassword', 'staff', (id, password) => {
    if (String(password || '').length < 6) throw new Error('PASSWORD_TOO_SHORT');
    if (id !== cur().id) manageable(id);
    db.prepare('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?').run(bcrypt.hashSync(password, 10), id);
    return true;
  });
  handle('admin:users:setActive', 'staff', (id, active) => {
    if (id === cur().id) throw new Error('SELF_FORBIDDEN');
    manageable(id);
    db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, id); return true;
  });
  handle('admin:users:resetProgress', 'staff', (id) => {
    manageable(id);
    db.prepare('DELETE FROM progress WHERE user_id=?').run(id);
    db.prepare('DELETE FROM quiz_results WHERE user_id=?').run(id);
    db.prepare('DELETE FROM certificates WHERE user_id=?').run(id); return true;
  });
  handle('admin:users:delete', 'staff', (id) => {
    if (id === cur().id) throw new Error('SELF_FORBIDDEN');
    manageable(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id); return true;
  });

  handle('admin:classes:list', 'staff', () =>
    db.prepare(`SELECT c.id, c.name, (SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student') students FROM classes c ORDER BY c.name`).all()
      .map((c) => ({ ...c, courseIds: db.prepare('SELECT course_id FROM class_courses WHERE class_id=?').all(c.id).map((r) => r.course_id) })));
  handle('admin:classes:save', 'staff', ({ id, name, courseIds }) => {
    name = String(name || '').trim();
    if (!name || name.length > 60) throw new Error('BAD_NAME');
    db.transaction(() => {
      let cid = id;
      if (cid) {
        if (db.prepare('SELECT 1 FROM classes WHERE name=? AND id<>?').get(name, cid)) throw new Error('NAME_EXISTS');
        db.prepare('UPDATE classes SET name=? WHERE id=?').run(name, cid);
      } else {
        if (db.prepare('SELECT 1 FROM classes WHERE name=?').get(name)) throw new Error('NAME_EXISTS');
        cid = db.prepare('INSERT INTO classes(name,created_at) VALUES(?,?)').run(name, Date.now()).lastInsertRowid;
      }
      db.prepare('DELETE FROM class_courses WHERE class_id=?').run(cid);
      for (const c of new Set(courseIds || [])) db.prepare('INSERT INTO class_courses(class_id,course_id) VALUES(?,?)').run(cid, String(c));
    })();
    return true;
  });
  handle('admin:classes:delete', 'staff', (id) => { db.prepare('DELETE FROM classes WHERE id=?').run(id); return true; });

  handle('admin:courses:meta', 'staff', () => { getTree(); return tree.courses.map((c) => ({ id: c.id, title: c.title, modules: c.modules.length })); });
  handle('admin:enroll:getUser', 'staff', (uid) => {
    const direct = db.prepare('SELECT course_id FROM enrollments WHERE user_id=?').all(uid).map((r) => r.course_id);
    const all = allowedCourseIds(uid);
    return { direct, viaClass: [...all].filter((c) => !direct.includes(c)) };
  });
  handle('admin:enroll:setUser', 'staff', (uid, courseIds) => {
    db.transaction(() => {
      db.prepare('DELETE FROM enrollments WHERE user_id=?').run(uid);
      for (const c of new Set(courseIds || [])) db.prepare('INSERT INTO enrollments(user_id,course_id,enrolled_at) VALUES(?,?,?)').run(uid, String(c), Date.now());
    })();
    return true;
  });
  handle('admin:enroll:getCourse', 'staff', (courseId) => ({
    direct: db.prepare('SELECT user_id FROM enrollments WHERE course_id=?').all(courseId).map((r) => r.user_id),
    viaClass: db.prepare(`SELECT u.id FROM users u JOIN class_courses cc ON cc.class_id=u.class_id WHERE cc.course_id=? AND u.role='student'`).all(courseId).map((r) => r.id),
  }));
  handle('admin:enroll:setCourse', 'staff', (courseId, userIds) => {
    db.transaction(() => {
      db.prepare('DELETE FROM enrollments WHERE course_id=?').run(courseId);
      for (const u of new Set(userIds || [])) db.prepare('INSERT INTO enrollments(user_id,course_id,enrolled_at) VALUES(?,?,?)').run(u, courseId, Date.now());
    })();
    return true;
  });

  // ---------- Admin : ordre des modules / leçons ----------
  handle('admin:order:get', 'staff', (courseId) => {
    getTree();
    const c = tree.courses.find((x) => x.id === courseId);
    if (!c) throw new Error('COURSE_UNKNOWN');
    return c.modules.filter((m) => !m.id.endsWith('/_general')).map((m) => ({ id: m.id, title: m.title, items: m.items.map((i) => ({ id: i.id, title: i.title, type: i.type })) }));
  });
  handle('admin:order:save', 'staff', (courseId, modules) => {
    getTree();
    const course = tree.courses.find((c) => c.id === courseId);
    if (!course) throw new Error('COURSE_UNKNOWN');
    const root = getCourseRoot();
    let order = 0;
    for (const mp of modules || []) {
      const m = course.modules.find((x) => x.id === mp.id);
      if (!m || m.id.endsWith('/_general')) continue;
      order += 1;
      const file = path.join(m.absPath, 'manifest.json');
      let mf = {};
      try { mf = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { /* nouveau manifest */ }
      mf.order = order;
      if (Array.isArray(mp.items)) {
        mf.items = mp.items.map((id) => m.items.find((i) => i.id === id)).filter(Boolean)
          .map((it) => toPosix(path.relative(m.absPath, path.join(root, it.relPath))));
      }
      fs.writeFileSync(file, JSON.stringify(mf, null, 2), 'utf8');
    }
    tree = null;
    return true;
  });

  // ---------- Admin : éditeur de quiz ----------
  handle('admin:modules:list', 'staff', () => {
    getTree();
    const out = [];
    for (const { course, module } of moduleIndex.values()) {
      out.push({ id: module.id, label: `${course.title} › ${module.title} — test final` });
      for (const it of module.items) out.push({ id: `lq:${it.id}`, label: `${course.title} › ${module.title} › ${it.title} — test de la leçon` });
    }
    return out;
  });
  /** Fichier d'un test : quiz.json du module, ou <leçon>.quiz.json pour « lq:<leçon> » */
  const quizTargetFile = (id) => {
    getTree();
    if (String(id).startsWith('lq:')) {
      const it = itemIndex.get(String(id).slice(3));
      if (!it) throw new Error('MODULE_UNKNOWN');
      return path.join(getCourseRoot(), it.relPath).replace(/\.[^.\\/]+$/, '') + '.quiz.json';
    }
    const e = moduleIndex.get(id);
    if (!e) throw new Error('MODULE_UNKNOWN');
    return path.join(e.module.absPath, 'quiz.json');
  };
  handle('admin:quiz:read', 'staff', (moduleId) => {
    const f = quizTargetFile(moduleId);
    const blank = { version: 1, title: '', passingScore: getSettings().minScore, timeLimitSec: null, shuffleQuestions: false, questions: [] };
    if (!fs.existsSync(f)) return { exists: false, quiz: blank };
    try { return { exists: true, quiz: { ...blank, ...JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) } }; }
    catch (err) { return { exists: true, quiz: blank, broken: err.message }; }
  });
  handle('admin:quiz:save', 'staff', (moduleId, quiz) => {
    const target = quizTargetFile(moduleId);
    const errors = quizEngine.validateQuiz(quiz);
    if (errors.length) return { saved: false, errors };
    const clean = { version: 1, title: String(quiz.title || ''), passingScore: quiz.passingScore ?? null, timeLimitSec: quiz.timeLimitSec || null, shuffleQuestions: !!quiz.shuffleQuestions, questions: quiz.questions };
    fs.writeFileSync(target, JSON.stringify(clean, null, 2), 'utf8');
    tree = null;
    return { saved: true, errors: [] };
  });

  // ---------- Admin : statistiques, relevés, résultats ----------
  handle('admin:stats:overview', 'staff', () => statsOverview());
  handle('admin:report:transcript', 'staff', (uid) => buildTranscript(uid));
  handle('admin:report:certificate', 'staff', (uid, courseId) => certificateData(uid, courseId));
  const lessonLabel = (mid) => { if (!String(mid).startsWith('lq:')) return null; const it = itemIndex.get(String(mid).slice(3)); return it ? `Test : ${it.title}` : mid; };
  const lessonCourse = (mid) => { if (!String(mid).startsWith('lq:')) return null; const m = itemModule.get(String(mid).slice(3)); return m ? moduleIndex.get(m.id)?.course.title || '' : ''; };
  const resultsRows = () => {
    getTree();
    return db.prepare(
      `SELECT q.id, u.username, u.full_name, c.name class_name, q.module_id, q.score, q.passed, q.duration_sec, q.created_at
       FROM quiz_results q JOIN users u ON u.id=q.user_id LEFT JOIN classes c ON c.id=u.class_id ORDER BY q.created_at DESC LIMIT 5000`
    ).all().map((r) => ({ ...r, module: lessonLabel(r.module_id) || moduleIndex.get(r.module_id)?.module.title || r.module_id, course: lessonCourse(r.module_id) || moduleIndex.get(r.module_id)?.course.title || '' }));
  };
  handle('admin:results:list', 'staff', () => resultsRows().slice(0, 1000));
  handle('admin:results:export', 'staff', (lang) => {
    const L = LANGS.has(lang) ? lang : 'fr';
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = resultsRows().map((r) => [new Date(r.created_at).toISOString(), r.username, r.full_name, r.class_name || '', r.course, r.module, r.score, r.passed ? YES[L][0] : YES[L][1], r.duration_sec].map(esc).join(';'));
    const dir = path.join(config.dataDir, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `results_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}.csv`);
    fs.writeFileSync(file, '﻿' + [CSV_HEAD[L].map(esc).join(';'), ...lines].join('\r\n'), 'utf8');
    return { file };
  });

  // ---------- Admin : paramètres & personnalisation ----------
  handle('admin:settings:get', 'staff', () => getSettings());
  handle('admin:settings:set', 'manager', (s) => {
    if (typeof s.courseRoot === 'string' && s.courseRoot.trim()) setSetting('courseRoot', s.courseRoot.trim());
    if (s.minScore != null) setSetting('minScore', clamp(s.minScore, 0, 100));
    if (s.autoQuiz != null) setSetting('autoQuiz', !!s.autoQuiz);
    if (s.allowSkip != null) setSetting('allowSkip', !!s.allowSkip);
    tree = null; return getSettings();
  });
  handle('admin:branding:set', 'manager', ({ centerName, slogan, primary, secondary, address, phone, email, website }) => {
    setSetting('center.address', String(address || '').trim().slice(0, 160));
    setSetting('center.phone', String(phone || '').trim().slice(0, 60));
    setSetting('center.email', String(email || '').trim().slice(0, 80));
    setSetting('center.website', String(website || '').trim().slice(0, 80));
    setSetting('center.name', String(centerName || '').trim().slice(0, 80));
    setSetting('center.slogan', String(slogan || '').trim().slice(0, 140));
    setSetting('center.primary', HEX.test(primary || '') ? primary : '');
    setSetting('center.secondary', HEX.test(secondary || '') ? secondary : '');
    return true;
  });
  const removeLogos = (dir) => { for (const ext of Object.keys(IMG_EXT)) { try { fs.unlinkSync(path.join(dir, 'logo' + ext)); } catch { /* absent */ } } };
  handle('admin:branding:saveLogo', 'manager', (dataUrl) => {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('BAD_IMAGE');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 4 * 1024 * 1024) throw new Error('IMAGE_TOO_BIG');
    const dir = path.join(getCourseRoot(), '_branding'); fs.mkdirSync(dir, { recursive: true });
    removeLogos(dir);
    fs.writeFileSync(path.join(dir, 'logo.' + (m[1] === 'jpeg' ? 'jpg' : m[1])), buf);
    return true;
  });
  handle('admin:branding:removeLogo', 'manager', () => { removeLogos(path.join(getCourseRoot(), '_branding')); return true; });

  // Sortie contrôlée (re-saisie du mot de passe admin) ; maintenance = lever les restrictions Windows
  handle('admin:exit', 'manager', async (password, maintenance) => {
    const role = await checkAdminCreds(cur().username, password, [cur().role]);
    quitApp(!!maintenance); return true;
  });

  return {
    // Serveur réseau : exécution d'un canal pour un poste client, session propre, accès média, version de l'arborescence
    dispatch: (channel, args, holder) => invoke(channel, args, holder),
    newHolder: () => ({ session: null }),
    mediaPath: (holder, rel) => als.run(holder, () => resolveMedia(rel)),
    treeVersion: () => treeVersion,
    getCourseRoot, resolveMedia, licenseInfo,
    isLoggedIn: () => !!localHolder.session,
    stop: () => { try { watcher?.close(); } catch { /* ignoré */ } },
  };
}

module.exports = { createServices };
