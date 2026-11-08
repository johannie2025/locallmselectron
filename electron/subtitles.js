'use strict';
/**
 * subtitles.js — sous-titres / transcriptions à côté d'une vidéo ou d'un audio.
 *
 * Convention : <nom du média>.<langue>.vtt (ou .srt) dans le même dossier
 *   cours1.mp4  +  cours1.fr.vtt  cours1.en.vtt  cours1.es.srt
 * La langue est un code (fr, en, es, pt, ar…) ; les formes longues (fra, english, en-US) sont normalisées.
 * Les .srt sont convertis en WebVTT. Fichier lu en UTF-8 (BOM ignoré), 2 Mo maximum.
 */
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 2 * 1024 * 1024;
const ALIAS = { fre: 'fr', fra: 'fr', french: 'fr', francais: 'fr', français: 'fr', eng: 'en', english: 'en', spa: 'es', esp: 'es', spanish: 'es', espanol: 'es', español: 'es', por: 'pt', portuguese: 'pt', ara: 'ar', arabic: 'ar' };

function normLang(tag) {
  const k = String(tag || '').trim().toLowerCase().replace(/_/g, '-');
  if (ALIAS[k]) return ALIAS[k];
  const base = k.split('-')[0];
  if (ALIAS[base]) return ALIAS[base];
  return /^[a-z]{2,3}$/.test(base) ? base : null;
}

/** SRT → WebVTT (virgules de millisecondes, en-tête, numéros de bloc conservés) */
function srtToVtt(text) {
  const body = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2');
  return `WEBVTT\n\n${body.trim()}\n`;
}

/** Sous-titres disponibles pour un média : [{ lang, ext, vtt }] (une piste par langue ; .vtt prioritaire sur .srt) */
function listSubtitles(mediaAbs) {
  const dir = path.dirname(mediaAbs);
  const base = path.basename(mediaAbs).replace(/\.[^.]+$/, '').toLowerCase();
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = new Map();
  for (const n of names.sort()) {
    const m = /^(.*)\.([^.]+)\.(vtt|srt)$/i.exec(n);
    if (!m || m[1].toLowerCase() !== base) continue;
    const lang = normLang(m[2]);
    if (!lang) continue;
    const ext = m[3].toLowerCase();
    if (out.has(lang) && out.get(lang).ext === 'vtt') continue;
    const abs = path.join(dir, n);
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > MAX_BYTES) continue;
      const raw = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');
      out.set(lang, { lang, ext, vtt: ext === 'srt' ? srtToVtt(raw) : raw.replace(/\r\n?/g, '\n') });
    } catch { /* fichier illisible : ignoré */ }
  }
  return [...out.values()];
}

module.exports = { listSubtitles, srtToVtt, normLang };
