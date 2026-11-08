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
    { id: 'q4', type: 'translate', text: 'Je mange une pomme.', to: 'en', answers: ['I eat an apple.', 'I am eating an apple.'], points: 1 },
  ],
};

const TYPES = new Set(['mcq', 'true_false', 'fill_blank', 'translate']);
const LANG_ORDER = ['fr', 'en', 'es'];

/** Texte multilingue : « chaîne » ou { fr, en, es }. Repli : langue demandée → fr → en → es → première valeur. */
const isI18n = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
function L(v, lang = 'fr') {
  if (!isI18n(v)) return v == null ? '' : String(v);
  const k = [lang, ...LANG_ORDER].find((x) => v[x] != null && String(v[x]).trim() !== '');
  return k ? String(v[k]) : String(Object.values(v)[0] ?? '');
}
/** Réponses acceptées (fill_blank / translate) : tableau, ou { fr:[…], en:[…], es:[…] } */
function answersOf(q, lang = 'fr') {
  const a = q.answers;
  if (Array.isArray(a)) return a.map((x) => L(x, lang));
  if (isI18n(a)) { const k = [lang, ...LANG_ORDER].find((x) => Array.isArray(a[x]) && a[x].length); return k ? a[k].map(String) : []; }
  return [];
}
/** Le quiz contient-il des textes multilingues ? (l'éditeur en formulaire ne doit pas les aplatir) */
const hasI18n = (v) => (Array.isArray(v) ? v.some(hasI18n) : isI18n(v) ? (Object.keys(v).some((k) => LANG_ORDER.includes(k)) || Object.values(v).some(hasI18n)) : false);
const quizTitle = (quiz, lang) => L(quiz.title, lang);

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
    if (!TYPES.has(x.type)) errors.push(`${n} : type inconnu (mcq | true_false | fill_blank | translate)`);
    if (!L(x.text).trim()) errors.push(`${n} : "text" manquant`);
    if (x.type === 'mcq') {
      if (!Array.isArray(x.options) || x.options.length < 2 || x.options.some((o) => !L(o).trim())) errors.push(`${n} : "options" (≥ 2, non vides) requis`);
      else if (!Array.isArray(x.answer) || !x.answer.length || x.answer.some((a) => !Number.isInteger(a) || a < 0 || a >= x.options.length))
        errors.push(`${n} : "answer" doit être un tableau d'indices valides`);
    }
    if (x.type === 'true_false' && typeof x.answer !== 'boolean') errors.push(`${n} : "answer" doit être true/false`);
    if ((x.type === 'fill_blank' || x.type === 'translate') && (!answersOf(x).length || answersOf(x).some((a) => !String(a).trim()))) errors.push(`${n} : "answers" (liste de réponses acceptées) requis`);
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
function publicQuestions(quiz, lang = 'fr') {
  const qs = quiz.questions.map((q) => ({
    id: q.id, type: q.type, text: L(q.text, lang), points: q.points || 1,
    ...(q.type === 'mcq' ? { options: q.options.map((o) => L(o, lang)), multiple: q.answer.length > 1 } : {}),
    ...(q.type === 'translate' ? { to: q.to || null, from: q.from || null } : {}),
  }));
  return quiz.shuffleQuestions ? shuffle(qs, Math.random) : qs;
}

const norm = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

const normT = (s) => norm(String(s ?? '').replace(/[’‘`´]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,;:!?¡¿"«»()\-–—]/g, ' '));

/** answers : { [questionId]: number[] | boolean | string } */
function grade(quiz, answers = {}, lang = 'fr', reveal = false) {
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
      ok = answersOf(q, lang).some((s) => (cs ? String(a ?? '').trim() === String(s).trim() : norm(a) === norm(s)));
    } else if (q.type === 'translate') {
      // traduction : insensible à la casse, aux accents, à la ponctuation et aux apostrophes typographiques
      ok = answersOf(q, lang).some((s) => normT(a) === normT(s));
    }
    if (ok) got += pts;
    const d = { id: q.id, correct: ok, explanation: q.explanation ? L(q.explanation, lang) : null };
    if (reveal) d.expected = q.type === 'mcq' ? q.answer : q.type === 'true_false' ? q.answer : answersOf(q, lang); // aperçu formateur : bonnes réponses
    return d;
  });
  const score = total ? Math.round((got / total) * 1000) / 10 : 0;
  return { score, details };
}

/**
 * Fallback sans quiz.json : quiz de reconnaissance généré à partir des titres des contenus
 * (« Quel contenu fait partie du module X ? »), avec leurres pris dans les autres modules du cours.
 * Retourne null s'il n'y a pas assez de matière (aucun leurre) → validation par visionnage seul.
 */
const AUTO_TEXT = {
  fr: (m) => `Quel contenu fait partie du module « ${m} » ?`,
  en: (m) => `Which content belongs to the module "${m}"?`,
  es: (m) => `¿Qué contenido forma parte del módulo «${m}»?`,
};
function autoQuiz(course, module, lang = 'fr') {
  const own = module.items.filter((i) => i.required).slice(0, 5);
  const decoys = course.modules.filter((m) => m.id !== module.id).flatMap((m) => m.items.filter((i) => i.required).map((i) => i.title));
  const ownTitles = new Set(module.items.map((i) => i.title));
  const pool = [...new Set(decoys)].filter((t) => !ownTitles.has(t));
  if (!own.length || pool.length < 2) return null;
  const rnd = mulberry32(hashStr(module.id));
  const questions = own.map((it, i) => {
    const wrong = shuffle(pool, rnd).slice(0, 3);
    const options = shuffle([it.title, ...wrong], rnd);
    return { id: `auto${i + 1}`, type: 'mcq', text: (AUTO_TEXT[lang] || AUTO_TEXT.fr)(module.title), options, answer: [options.indexOf(it.title)], points: 1 };
  });
  return { version: 1, title: `Révision — ${module.title}`, passingScore: null, questions, auto: true };
}

module.exports = { QUIZ_TEMPLATE, validateQuiz, readQuizFile, publicQuestions, grade, autoQuiz, L, answersOf, hasI18n, quizTitle, isI18n };
