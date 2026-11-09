'use strict';
// Aperçu formateur des tests, liste des tests par module, sous-titres multilingues
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handlers } = require('./_shims');
const { openDb } = require('../electron/db');
const license = require('../electron/license');
const { createServices } = require('../electron/ipc');
const quizEngine = require('../electron/quizEngine');
const { listSubtitles, srtToVtt, normLang } = require('../electron/subtitles');

license.machineInfo = () => ({ ok: true, id: 'AAAA-BBBB-CCCC-DDDD-EEEE', strength: 'hardware' });
license.evaluate = () => ({ state: 'active', locked: false, plan: 'annual', daysLeft: 300 });
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('sous-titres : conversion SRT → VTT, langues normalisées, .vtt prioritaire', () => {
  assert.strictEqual(normLang('fra'), 'fr'); assert.strictEqual(normLang('en-US'), 'en'); assert.strictEqual(normLang('Spanish'), 'es'); assert.strictEqual(normLang('x'), null);
  assert.match(srtToVtt('﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nBonjour\r\n'), /^WEBVTT\n\n1\n00:00:01\.500 --> 00:00:03\.000\nBonjour/);
  const d = tmp('wls-sub-');
  for (const n of ['cours.mp4', 'cours.fr.vtt', 'cours.en.srt', 'cours.es.srt', 'cours.es.vtt', 'cours.zz9.vtt', 'autre.fr.vtt']) fs.writeFileSync(path.join(d, n), n.endsWith('.srt') ? '1\n00:00:00,000 --> 00:00:01,000\nHi\n' : 'WEBVTT\n\n00:00.000 --> 00:01.000\nHola\n');
  const l = listSubtitles(path.join(d, 'cours.mp4'));
  assert.deepStrictEqual(l.map((x) => x.lang).sort(), ['en', 'es', 'fr']);
  assert.strictEqual(l.find((x) => x.lang === 'es').ext, 'vtt');
  assert.ok(l.find((x) => x.lang === 'en').vtt.startsWith('WEBVTT'));
});

test('grade(reveal) : bonnes réponses exposées seulement à la demande', () => {
  const q = { questions: [{ id: 'a', type: 'mcq', text: 'x', options: ['1', '2'], answer: [1] }, { id: 'b', type: 'translate', text: 'x', to: 'en', answers: ['I eat'] }] };
  assert.strictEqual(quizEngine.grade(q, {}, 'fr').details[0].expected, undefined);
  const g = quizEngine.grade(q, {}, 'fr', true);
  assert.deepStrictEqual(g.details[0].expected, [1]); assert.deepStrictEqual(g.details[1].expected, ['I eat']);
});

test('aperçu formateur : liste par module, test désactivé accessible sans enregistrer de résultat, étudiant bloqué', async () => {
  const root = tmp('wls-prev-');
  const mod = path.join(root, 'Cours_A', 'Module_01'); fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, 'intro.mp4'), Buffer.alloc(100));
  fs.writeFileSync(path.join(mod, 'intro.fr.vtt'), 'WEBVTT\n\n00:00.000 --> 00:02.000\nBonjour\n');
  fs.writeFileSync(path.join(mod, 'intro.en.srt'), '1\n00:00:00,000 --> 00:00:02,000\nHello\n');
  const quiz = { version: 1, title: 'T', passingScore: 50, questions: [{ id: 'q1', type: 'true_false', text: 'Vrai ?', answer: true }] };
  fs.writeFileSync(path.join(mod, 'intro.quiz.json'), JSON.stringify(quiz));
  fs.writeFileSync(path.join(mod, 'quiz.json'), JSON.stringify(quiz));
  fs.writeFileSync(path.join(mod, 'manifest.json'), JSON.stringify({ quizEnabled: false, lessons: { 'intro.mp4': { quiz: false } } }));

  handlers.clear();
  const dir = tmp('wls-prevd-');
  const db = openDb(path.join(dir, 'lms.sqlite'));
  const svc = createServices({ db, config: { courseRoot: root, dataDir: dir }, getWindow: () => null, quitApp() {}, setOnTop() {}, log() {} });
  test.after(() => svc.stop());
  const h = new Map(handlers);
  const call = async (ch, ...a) => h.get(ch)({}, ...a);

  assert.ok((await call('auth:login', 'superadmin', 'Super@1234')).ok);
  const list = (await call('admin:quizzes:list')).data;
  const m = list[0].modules[0];
  assert.deepStrictEqual(m.tests.map((x) => [x.kind, x.exists, x.enabled, x.questions]), [['module', true, false, 1], ['lesson', true, false, 1]]);

  // sans aperçu : désactivé ; avec aperçu : accessible
  assert.strictEqual((await call('quiz:get', 'lq:Cours_A/Module_01/intro.mp4', 'fr')).error, 'QUIZ_DISABLED');
  let r = await call('quiz:get', 'lq:Cours_A/Module_01/intro.mp4', 'fr', true);
  assert.ok(r.ok && r.data.preview && r.data.questions.length === 1, r.error);
  r = await call('quiz:get', m.id, 'fr', true); assert.ok(r.ok, r.error);
  r = await call('quiz:submit', m.id, { q1: false }, 5, 'fr', true);
  assert.ok(r.ok && r.data.preview && r.data.score === 0 && r.data.details[0].expected === true, r.error);
  r = await call('quiz:submit', 'lq:Cours_A/Module_01/intro.mp4', { q1: true }, 5, 'fr', true);
  assert.ok(r.ok && r.data.passed);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM quiz_results').get().c, 0, "l'aperçu ne doit rien enregistrer");

  // sous-titres : formateur
  const s = await call('media:subtitles', 'Cours_A/Module_01/intro.mp4');
  assert.deepStrictEqual(s.data.map((x) => x.lang).sort(), ['en', 'fr']);
  assert.ok(s.data.find((x) => x.lang === 'en').vtt.includes('00:00:00.000 --> 00:00:02.000'));
});

test('cases « test activé » : la désactivation est enregistrée et relue', async () => {
  const root = tmp('wls-en-');
  const mod = path.join(root, 'Cours_A', 'Module_01'); fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, 'intro.mp4'), Buffer.alloc(100));
  const quiz = { version: 1, title: 'T', passingScore: 50, questions: [{ id: 'q1', type: 'true_false', text: 'Vrai ?', answer: true }] };
  fs.writeFileSync(path.join(mod, 'intro.quiz.json'), JSON.stringify(quiz));
  fs.writeFileSync(path.join(mod, 'quiz.json'), JSON.stringify(quiz));
  handlers.clear();
  const dir = tmp('wls-end-');
  const db = openDb(path.join(dir, 'lms.sqlite'));
  const svc = createServices({ db, config: { courseRoot: root, dataDir: dir }, getWindow: () => null, quitApp() {}, setOnTop() {}, log() {} });
  test.after(() => svc.stop());
  const h = new Map(handlers);
  const call = async (ch, ...a) => h.get(ch)({}, ...a);
  assert.ok((await call('auth:login', 'superadmin', 'Super@1234')).ok);
  let l = (await call('admin:lessons:list')).data[0].modules[0];
  assert.ok(l.items[0].quizEnabled && l.quizEnabled);
  let r = await call('admin:lessons:save', l.id, l.items[0].id, { quizEnabled: false }); assert.ok(r.ok, r.error);
  r = await call('admin:lessons:save', l.id, null, { quizEnabled: false }); assert.ok(r.ok, r.error);
  l = (await call('admin:lessons:list')).data[0].modules[0];
  assert.strictEqual(l.items[0].quizEnabled, false); assert.strictEqual(l.quizEnabled, false);
  await call('admin:lessons:save', l.id, l.items[0].id, { quizEnabled: true });
  l = (await call('admin:lessons:list')).data[0].modules[0];
  assert.strictEqual(l.items[0].quizEnabled, true);
});
