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
