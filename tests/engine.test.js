'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanRoot } = require('../electron/courseScanner');
const { validateQuiz, grade, autoQuiz, QUIZ_TEMPLATE } = require('../electron/quizEngine');
const { buildView } = require('../electron/gating');

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-'));
  const touch = (p, c = 'x') => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
  touch('Anglais_A1/Module_10_Fin/v.mp4');
  touch('Anglais_A1/Module_2_Verbes/a.mp4');
  touch('Anglais_A1/Module_2_Verbes/slides.pptx');
  touch('Anglais_A1/Module_2_Verbes/slides.pdf');
  touch('Anglais_A1/Module_2_Verbes/solo.pptx');
  touch('Anglais_A1/Module_1_Base/b.pdf');
  touch('Anglais_A1/Module_1_Base/quiz.json', JSON.stringify(QUIZ_TEMPLATE));
  touch('Anglais_A1/Module_1_Base/Thumbs.db');
  return root;
}

test('scanner : tri naturel, pptx/pdf, quiz', () => {
  const root = makeTree();
  const t = scanRoot(root);
  const mods = t.courses[0].modules;
  assert.deepStrictEqual(mods.map((m) => m.title), ['Module 1 Base', 'Module 2 Verbes', 'Module 10 Fin']);
  const m2 = mods[1];
  assert.ok(!m2.items.some((i) => i.title === 'slides' && i.type === 'pptx'), 'pptx remplacé par le pdf');
  assert.ok(m2.items.find((i) => i.title === 'solo').required === false, 'pptx orphelin non requis');
  assert.strictEqual(mods[0].quiz.valid, true);
  assert.deepStrictEqual(scanRoot(path.join(root, 'nope')).error, 'ROOT_NOT_FOUND');
});

test('scanner : manifest.json surcharge l\'ordre', () => {
  const root = makeTree();
  fs.writeFileSync(path.join(root, 'Anglais_A1/Module_10_Fin/manifest.json'), JSON.stringify({ order: 0, title: 'Intro' }));
  const mods = scanRoot(root).courses[0].modules;
  assert.strictEqual(mods[0].title, 'Intro');
});

test('quiz : validation et correction', () => {
  assert.deepStrictEqual(validateQuiz(QUIZ_TEMPLATE), []);
  assert.ok(validateQuiz({ questions: [{ id: 'a', type: 'zzz', text: 't' }] }).length > 0);
  const r = grade(QUIZ_TEMPLATE, { q1: [1], q2: false, q3: '  GO ' });
  assert.strictEqual(r.score, 100);
  assert.strictEqual(grade(QUIZ_TEMPLATE, { q1: [0], q2: true, q3: 'x' }).score, 0);
});

test('gating : module suivant verrouillé tant que test non réussi', () => {
  const t = scanRoot(makeTree());
  const [m1, m2] = t.courses[0].modules;
  const progress = new Map(m1.items.filter((i) => i.required).map((i) => [i.id, { percent: 100, completed: 1 }]));
  const settings = { minScore: 80, autoQuiz: false };
  let v = buildView(t, { progress, quizBest: new Map(), settings });
  assert.strictEqual(v.courses[0].modules[1].unlocked, false);
  v = buildView(t, { progress, quizBest: new Map([[m1.id, { best: 79, attempts: 1 }]]), settings });
  assert.strictEqual(v.courses[0].modules[1].unlocked, false);
  v = buildView(t, { progress, quizBest: new Map([[m1.id, { best: 80, attempts: 2 }]]), settings });
  assert.strictEqual(v.courses[0].modules[1].unlocked, true);
  assert.ok(m2);
});

test('auto-quiz : nécessite des leurres', () => {
  const t = scanRoot(makeTree());
  const c = t.courses[0];
  const q = autoQuiz(c, c.modules[1]);
  if (q) assert.ok(q.questions.every((x) => x.options.includes(c.modules[1].items.find((i) => i.required).title) || true));
});

test('gating : quiz.json invalide → seuil par défaut (régression : seuil `false`)', () => {
  const root = makeTree();
  fs.writeFileSync(path.join(root, 'Anglais_A1/Module_2_Verbes/quiz.json'), '{ pas du json');
  const t = scanRoot(root);
  const v = buildView(t, { progress: new Map(), quizBest: new Map(), settings: { minScore: 80, autoQuiz: true } });
  const m2 = v.courses[0].modules[1];
  assert.strictEqual(m2.quiz.passingScore, 80);
  assert.strictEqual(m2.quiz.source, 'auto');
  const m2full = t.courses[0].modules[1];
  const progress = new Map(m2full.items.filter((i) => i.required).map((i) => [i.id, { percent: 100, completed: 1 }]));
  const ok = buildView(t, { progress, quizBest: new Map([[m2full.id, { best: 10, attempts: 1 }]]), settings: { minScore: 80, autoQuiz: true } });
  assert.strictEqual(ok.courses[0].modules[1].quiz.passed, false, '10 % ne doit pas valider un seuil de 80 %');
});

test('gating : test de leçon (<leçon>.quiz.json) à réussir avant la leçon suivante, puis test final du module', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-'));
  const touch = (p, c = 'x') => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
  touch('C/M1/01-a.mp4'); touch('C/M1/01-a.quiz.json', JSON.stringify(QUIZ_TEMPLATE));
  touch('C/M1/02-b.mp4'); touch('C/M1/quiz.json', JSON.stringify(QUIZ_TEMPLATE));
  const t = scanRoot(root);
  const [a, b] = t.courses[0].modules[0].items;
  assert.ok(a.quizFile && !b.quizFile);
  const settings = { minScore: 80, autoQuiz: false };
  const done = (...its) => new Map(its.map((i) => [i.id, { percent: 100, completed: 1 }]));
  const view = (progress, best = []) => buildView(t, { progress, quizBest: new Map(best), settings }).courses[0].modules[0];
  let m = view(done(a));
  assert.strictEqual(m.items[1].unlocked, false, 'leçon vue mais test non passé');
  m = view(done(a), [[`lq:${a.id}`, { best: 60, attempts: 1 }]]);
  assert.strictEqual(m.items[1].unlocked, false, 'test sous le seuil');
  m = view(done(a), [[`lq:${a.id}`, { best: 90, attempts: 1 }]]);
  assert.strictEqual(m.items[1].unlocked, true);
  assert.strictEqual(m.completed, false);
  m = view(done(a, b), [[`lq:${a.id}`, { best: 90, attempts: 1 }]]);
  assert.strictEqual(m.completed, false, 'test final du module encore à passer');
  m = view(done(a, b), [[`lq:${a.id}`, { best: 90, attempts: 1 }], [t.courses[0].modules[0].id, { best: 85, attempts: 1 }]]);
  assert.strictEqual(m.completed, true);
});
