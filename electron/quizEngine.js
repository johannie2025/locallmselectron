'use strict';
/**
 * Moteur de quiz (Node pur). La CORRECTION se fait côté processus principal :
 * le renderer ne reçoit jamais les bonnes réponses (publicQuestions).
 */
const fs = require('fs');

const QUIZ_TEMPLATE = {
  version: 1,
  title: 'Test du module',
  passingScore: 80,
  timeLimitSec: 600,
  shuffleQuestions: true,
  questions: [
    { id: 'q1', type: 'mcq', text: 'Choisissez la bonne forme : She ___ to school.', options: ['go', 'goes', 'going'], answer: [1], points: 1, explanation: 'Troisième personne du singulier : -es.' },
    { id: 'q2', type: 'true_false', text: '"I am agree" est correct.', answer: false, points: 1, explanation: 'On dit "I agree".' },
    { id: 'q3', type: 'fill_blank', text: 'I ___ to school every day.', answers: ['go'], points: 1 },
  ],
};

const TYPES = new Set(['mcq', 'true_false', 'fill_blank']);

function validateQuiz(q) {
  const errors = [];
  if (!q || typeof q !== 'object') return ['Le quiz doit être un objet JSON'];
  if (!Array.isArray(q.questions) || !q.questions.length) errors.push('"questions" doit être un tableau non vide');
  if (q.passingScore != null && !(q.passingScore >= 0 && q.passingScore <= 100)) errors.push('"passingScore" doit être entre 0 et 100');
  const ids = new Set();
  (q.questions || []).forEach((x, i) => {
    const n = `Question ${i + 1}`;
    if (!x.id || ids.has(x.id)) errors.push(`${n} : "id" manquant ou en double`);
    ids.add(x.id);
    if (!TYPES.has(x.type)) errors.push(`${n} : type inconnu (mcq | true_false | fill_blank)`);
    if (!x.text) errors.push(`${n} : "text" manquant`);
    if (x.type === 'mcq') {
      if (!Array.isArray(x.options) || x.options.length < 2) errors.push(`${n} : "options" (≥ 2) requis`);
      else if (!Array.isArray(x.answer) || !x.answer.length || x.answer.some((a) => !Number.isInteger(a) || a < 0 || a >= x.options.length))
        errors.push(`${n} : "answer" doit être un tableau d'indices valides`);
    }
    if (x.type === 'true_false' && typeof x.answer !== 'boolean') errors.push(`${n} : "answer" doit être true/false`);
    if (x.type === 'fill_blank' && (!Array.isArray(x.answers) || !x.answers.length)) errors.push(`${n} : "answers" (liste de réponses acceptées) requis`);
  });
  return errors;
}

function readQuizFile(file) {
  try {
    const quiz = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    const errors = validateQuiz(quiz);
    return errors.length ? { errors } : { quiz };
  } catch (e) {
    return { errors: [`Lecture impossible : ${e.message}`] };
  }
}

function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function shuffle(arr, rnd) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Questions envoyées au renderer : sans réponses ni explications. */
function publicQuestions(quiz) {
  const qs = quiz.questions.map((q) => ({
    id: q.id, type: q.type, text: q.text, points: q.points || 1,
    ...(q.type === 'mcq' ? { options: q.options, multiple: q.answer.length > 1 } : {}),
  }));
  return quiz.shuffleQuestions ? shuffle(qs, Math.random) : qs;
}

const norm = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** answers : { [questionId]: number[] | boolean | string } */
function grade(quiz, answers = {}) {
  let got = 0, total = 0;
  const details = quiz.questions.map((q) => {
    const pts = q.points || 1;
    total += pts;
    const a = answers[q.id];
    let ok = false;
    if (q.type === 'mcq' && Array.isArray(a)) {
      const x = [...new Set(a)].sort(); const y = [...q.answer].sort();
      ok = x.length === y.length && x.every((v, i) => v === y[i]);
    } else if (q.type === 'true_false') ok = a === q.answer;
    else if (q.type === 'fill_blank') {
      const cs = q.caseSensitive;
      ok = q.answers.some((s) => (cs ? String(a ?? '').trim() === String(s).trim() : norm(a) === norm(s)));
    }
    if (ok) got += pts;
    return { id: q.id, correct: ok, explanation: q.explanation || null };
  });
  const score = total ? Math.round((got / total) * 1000) / 10 : 0;
  return { score, details };
}

/**
 * Fallback sans quiz.json : quiz de reconnaissance généré à partir des titres des contenus
 * (« Quel contenu fait partie du module X ? »), avec leurres pris dans les autres modules du cours.
 * Retourne null s'il n'y a pas assez de matière (aucun leurre) → validation par visionnage seul.
 */
function autoQuiz(course, module) {
  const own = module.items.filter((i) => i.required).slice(0, 5);
  const decoys = course.modules.filter((m) => m.id !== module.id).flatMap((m) => m.items.filter((i) => i.required).map((i) => i.title));
  const ownTitles = new Set(module.items.map((i) => i.title));
  const pool = [...new Set(decoys)].filter((t) => !ownTitles.has(t));
  if (!own.length || pool.length < 2) return null;
  const rnd = mulberry32(hashStr(module.id));
  const questions = own.map((it, i) => {
    const wrong = shuffle(pool, rnd).slice(0, 3);
    const options = shuffle([it.title, ...wrong], rnd);
    return { id: `auto${i + 1}`, type: 'mcq', text: `Quel contenu fait partie du module « ${module.title} » ?`, options, answer: [options.indexOf(it.title)], points: 1 };
  });
  return { version: 1, title: `Révision — ${module.title}`, passingScore: null, questions, auto: true };
}

module.exports = { QUIZ_TEMPLATE, validateQuiz, readQuizFile, publicQuestions, grade, autoQuiz };
