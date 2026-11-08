#!/usr/bin/env node
'use strict';
/**
 * Génère les quiz (quiz.json / <leçon>.quiz.json) avec Gemini à partir des vidéos YouTube des cours.
 * Outil à lancer sur VOTRE PC (l'application, elle, reste 100 % hors ligne). Node 18+ requis, aucune dépendance.
 *
 *   set GEMINI_API_KEY=votre_cle            (jamais écrite sur disque par cet outil)
 *   node tools/gemini-quiz.js quiz-sources.csv --root C:\formations_wls [--lang fr] [--questions 8] [--model gemini-2.5-flash] [--force]
 *
 * quiz-sources.csv (séparateur « ; » ou « , ») :
 *   type;chemin;youtube
 *   lecon;Anglais_A1/Module_1_Base/01-intro.mp4;https://www.youtube.com/watch?v=XXXX
 *   module;Anglais_A1/Module_1_Base;https://youtu.be/AAA | https://youtu.be/BBB
 *   - « lecon » : crée <chemin sans extension>.quiz.json à côté de la leçon (test à réussir avant la leçon suivante)
 *   - « module » : crée quiz.json dans le dossier du module (test final) ; plusieurs vidéos séparées par « | »
 * Les quiz existants ne sont pas écrasés (sauf --force). Chaque quiz généré est validé avec le moteur de l'application.
 * Contrôlez toujours les questions (éditeur de quiz de l'application) : une IA peut se tromper.
 */
const fs = require('fs');
const path = require('path');
const { validateQuiz } = require('../electron/quizEngine');

const LANG_NAME = { fr: 'français', en: 'English', es: 'español' };

function promptFor({ kind, count, langs = ['fr', 'en', 'es'] }) {
  return `Tu es un formateur. Regarde la/les vidéo(s) et écris un ${kind === 'module' ? 'test final de module' : 'test de leçon'} de ${count} questions qui vérifient la compréhension du contenu réellement enseigné (pas de questions sur la vidéo elle-même : durée, auteur…).
Le test est TRILINGUE : chaque texte (title, text, options, explanation) est un objet {"fr":"…","en":"…","es":"…"} ; les 3 versions disent la même chose, les options sont dans le MÊME ORDRE dans les 3 langues.
Réponds UNIQUEMENT par un objet JSON de cette forme :
{"title":{"fr":"…","en":"…","es":"…"},"questions":[
 {"id":"q1","type":"mcq","text":{"fr":"…","en":"…","es":"…"},"options":[{"fr":"…","en":"…","es":"…"},{"fr":"…","en":"…","es":"…"},{"fr":"…","en":"…","es":"…"}],"answer":[1],"explanation":{"fr":"…","en":"…","es":"…"}},
 {"id":"q2","type":"true_false","text":{"fr":"…","en":"…","es":"…"},"answer":false,"explanation":{"fr":"…","en":"…","es":"…"}},
 {"id":"q3","type":"fill_blank","text":{"fr":"Phrase avec ___","en":"Sentence with ___","es":"Frase con ___"},"answers":{"fr":["mot"],"en":["word"],"es":["palabra"]},"explanation":{"fr":"…","en":"…","es":"…"}},
 {"id":"q4","type":"translate","text":{"fr":"Traduisez en anglais : « Je mange une pomme. »","en":"Translate into English: \"Je mange une pomme.\"","es":"Traduzca al inglés: «Je mange une pomme.»"},"to":"en","answers":["I eat an apple.","I am eating an apple."]}]}
Règles : mélange les 4 types (surtout "mcq" avec 3 à 4 options, "answer" = indices des bonnes options en comptant à partir de 0) ; "id" uniques q1, q2… ; réponses sans ambiguïté ; "fill_blank" : réponse d'un ou deux mots ; pour un cours de langue, ajoute des questions "translate" (la phrase à traduire est dans la langue étudiée ou dans la langue de l'étudiant, "to" = code de la langue cible, "answers" = traductions acceptées dans cette langue cible) ; "explanation" courte.`;
}

/** Appelle Gemini ; fetchImpl injectable pour les tests. Retourne un quiz validé. */
async function generateQuiz({ urls, kind, lang = 'fr', count = 8, model = 'gemini-2.5-flash', key, fetchImpl = fetch, retries = 1 }) {
  if (!key) throw new Error('GEMINI_API_KEY manquante');
  const parts = [...urls.map((u) => ({ file_data: { file_uri: u } })), { text: promptFor({ kind, count }) }];
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
    });
    if (!res.ok) { lastErr = new Error(`Gemini HTTP ${res.status} : ${String(await res.text()).slice(0, 300)}`); if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); continue; } throw lastErr; }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    try {
      const raw = JSON.parse(text.replace(/^```json\s*|```\s*$/g, '').trim());
      const quiz = {
        version: 1, title: raw.title || '', passingScore: kind === 'module' ? 80 : 70, shuffleQuestions: true,
        questions: (raw.questions || []).map((q, i) => ({ ...q, id: `q${i + 1}`, points: 1 })),
      };
      const errors = validateQuiz(quiz);
      if (errors.length) throw new Error(`quiz invalide : ${errors.join(' ; ')}`);
      return quiz;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  if (/^type$/i.test(rows[0][0])) rows.shift();
  return rows.filter((r) => r.length >= 3).map(([type, p, yt]) => ({ type: type.toLowerCase().startsWith('m') ? 'module' : 'lecon', path: p, urls: yt.split('|').map((u) => u.trim()).filter(Boolean) }));
}

function targetFile(root, row) {
  const abs = path.resolve(root, row.path);
  if (!abs.startsWith(path.resolve(root) + path.sep)) throw new Error(`chemin hors du dossier des cours : ${row.path}`);
  return row.type === 'module' ? path.join(abs, 'quiz.json') : abs.replace(/\.[^.\\/]+$/, '') + '.quiz.json';
}

async function main(argv) {
  const args = argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const csv = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--root' && !['--lang', '--questions', '--model'].includes(args[args.indexOf(a) - 1]));
  const root = path.resolve(opt('root', 'C:\\formations_wls'));
  if (!csv || !fs.existsSync(csv)) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[#!].*\n/, '')); process.exit(csv ? 1 : 0); }
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('Définissez GEMINI_API_KEY (clé Google AI Studio).'); process.exit(1); }
  const rows = parseCsv(fs.readFileSync(csv, 'utf8'));
  let ok = 0, skip = 0, fail = 0;
  for (const row of rows) {
    let file;
    try { file = targetFile(root, row); } catch (e) { console.error(`✗ ${e.message}`); fail++; continue; }
    if (fs.existsSync(file) && !args.includes('--force')) { console.log(`= existe déjà : ${path.relative(root, file)}`); skip++; continue; }
    try {
      const quiz = await generateQuiz({ urls: row.urls, kind: row.type, lang: opt('lang', 'fr'), count: Number(opt('questions', 8)), model: opt('model', 'gemini-2.5-flash'), key });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(quiz, null, 2));
      console.log(`✓ ${path.relative(root, file)} (${quiz.questions.length} questions)`); ok++;
    } catch (e) { console.error(`✗ ${row.path} : ${e.message}`); fail++; }
  }
  console.log(`\nTerminé : ${ok} créé(s), ${skip} ignoré(s), ${fail} échec(s). Relisez les questions avant de déployer.`);
}

module.exports = { generateQuiz, parseCsv, targetFile, promptFor };
if (require.main === module) main(process.argv).catch((e) => { console.error(e.message); process.exit(1); });
