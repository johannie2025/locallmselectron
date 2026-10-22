import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useBrand } from '../brand/BrandProvider.jsx';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const mediaUrl = (rel) => 'lms-media://f/' + rel.split('/').map(encodeURIComponent).join('/');
// Pas de téléchargement, pas de lecture à distance, pas d'image dans l'image, pas de menu contextuel
const LOCKED = { controlsList: 'nodownload noremoteplayback', disablePictureInPicture: true, onContextMenu: (e) => e.preventDefault() };

/** Lecteur vidéo ET audio : reprise de position, progression, saut en avant interdit (sauf réglage), sans bouton de téléchargement. */
function Media({ item, allowSkip, onProgress }) {
  const { t } = useI18n();
  const brand = useBrand();
  const ref = useRef(null);
  const maxRef = useRef(0);
  const lastSent = useRef(0);
  const [playing, setPlaying] = useState(false);
  const isAudio = item.type === 'audio';
  const [err, setErr] = useState(false);
  const [boost, setBoost] = useState(100);      // 100 % = volume normal, jusqu'à 400 % (amplification type VLC)
  const [comp, setComp] = useState(false);      // compresseur : rapproche les passages faibles et forts
  const [showBoost, setShowBoost] = useState(false);
  const fx = useRef(null);
  // Chaîne Web Audio créée seulement à la première utilisation de l'amplificateur
  useEffect(() => {
    if ((boost === 100 && !comp) && !fx.current) return;
    const el = ref.current;
    if (!el) return;
    try {
      if (!fx.current) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        const dyn = ctx.createDynamicsCompressor();
        fx.current = { ctx, src, gain, dyn };
      }
      const { ctx, src, gain, dyn } = fx.current;
      src.disconnect(); gain.disconnect(); dyn.disconnect();
      gain.gain.value = boost / 100;
      if (comp) { dyn.threshold.value = -40; dyn.knee.value = 24; dyn.ratio.value = 8; dyn.attack.value = 0.003; dyn.release.value = 0.25; src.connect(dyn); dyn.connect(gain); } else src.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* non disponible : volume normal */ }
  }, [boost, comp]);
  useEffect(() => () => { try { fx.current?.ctx.close(); } catch { /* ignoré */ } }, []);

  const send = (force) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    const now = Date.now();
    if (!force && now - lastSent.current < 5000) return;
    lastSent.current = now;
    onProgress(Math.min(100, (maxRef.current / v.duration) * 100), v.currentTime);
  };
  useEffect(() => () => send(true), []); // sauvegarde en quittant

  const props = {
    ref, crossOrigin: 'anonymous', src: mediaUrl(item.id), controls: true, onError: () => setErr(true), autoPlay: true, ...LOCKED,
    onLoadedMetadata: (e) => {
      const pos = item.positionSec || 0;
      if (pos > 0 && pos < e.target.duration - 2) { e.target.currentTime = pos; maxRef.current = pos; }
    },
    onTimeUpdate: (e) => {
      const v = e.target;
      if (!allowSkip && v.currentTime > maxRef.current + 2) { v.currentTime = maxRef.current; return; }
      maxRef.current = Math.max(maxRef.current, v.currentTime);
      send(false);
    },
    onEnded: (e) => { maxRef.current = e.target.duration; setPlaying(false); send(true); },
    onPlay: () => setPlaying(true),
    onPause: () => { setPlaying(false); send(true); },
  };

  const boostBar = (
    <div className="relative flex justify-center mt-2">
      <button className="btn-ghost btn-sm" onClick={() => setShowBoost(!showBoost)} title={t('player.boost')}>🔊 {boost}%{comp ? ' · C' : ''}</button>
      {showBoost && (
        <div className="absolute bottom-full mb-2 z-20 rounded-xl border border-white/10 bg-slate-900 shadow-xl p-3 text-sm w-72 space-y-2 animate-pop">
          <div className="flex justify-between"><span>{t('player.boost')}</span><b>{boost}%</b></div>
          <input type="range" min="100" max="400" step="10" value={boost} onChange={(e) => setBoost(+e.target.value)} className="w-full" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} /> {t('player.compress')}</label>
          <button className="btn-ghost btn-sm" onClick={() => { setBoost(100); setComp(false); }}>{t('player.boostReset')}</button>
        </div>
      )}
    </div>
  );
  const errBox = err && <div className="mt-2 text-center text-sm text-amber-300">⚠ {t('player.codecError')}</div>;
  if (!isAudio) return <div className="flex flex-col h-full w-full items-center justify-center min-h-0"><video {...props} className="max-h-[calc(100%-4rem)] max-w-full bg-black rounded-lg" />{errBox}{boostBar}</div>;
  return (
    <div className="card w-full max-w-xl text-center space-y-5 bg-slate-900/70">
      <span className="logo-badge"><img src={brand.logoSrc} alt="" className="h-14 w-auto" /></span>
      <div className="text-xl font-semibold">🎧 {item.title}</div>
      <div className="flex items-end justify-center gap-1.5 h-16" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="w-1.5 rounded bg-brand origin-bottom"
            style={{ height: `${25 + ((i * 37) % 70)}%`, animation: playing ? `eq ${0.7 + ((i * 13) % 7) / 10}s ease-in-out ${-(i % 5) * 0.2}s infinite alternate` : 'none', opacity: playing ? 1 : 0.4 }} />
        ))}
      </div>
      <audio {...props} className="w-full" />
      {errBox}{boostBar}
      <style>{'@keyframes eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}'}</style>
      <p className="sr-only">{t('player.next')}</p>
    </div>
  );
}

function Pdf({ item, onProgress }) {
  const { t } = useI18n();
  const canvas = useRef(null);
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(Math.max(1, Math.round(item.positionSec || 1)));
  const [err, setErr] = useState('');
  const maxPage = useRef(0);
  const box = useRef(null);
  const [fs, setFs] = useState(false);
  const [vw, setVw] = useState([window.innerWidth, window.innerHeight]);
  const toggleFs = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else box.current?.requestFullscreen(); } catch { /* refusé */ } };
  useEffect(() => {
    const onFs = () => setFs(document.fullscreenElement === box.current);
    const onSize = () => setVw([window.innerWidth, window.innerHeight]);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('resize', onSize);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('resize', onSize); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);
  // Navigation au clavier (utile en plein écran)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => (doc ? Math.min(p + 1, doc.numPages) : p));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api('media:readPdf', item.id);
        const d = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
        if (alive) { setDoc(d); setPage((p) => Math.min(p, d.numPages)); }
      } catch { setErr(t('player.pdfError')); }
    })();
    return () => { alive = false; };
  }, [item.id]);

  useEffect(() => {
    if (!doc) return;
    let task;
    (async () => {
      const pg = await doc.getPage(page);
      const base = pg.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const scale = (fs ? Math.min(vw[0] / base.width, (vw[1] - 64) / base.height) : Math.min((vw[0] - 80) / base.width, (vw[1] - 260) / base.height)) * dpr;
      const vp = pg.getViewport({ scale });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${vp.width / dpr}px`;
      task = pg.render({ canvasContext: c.getContext('2d'), viewport: vp });
      try { await task.promise; } catch { /* rendu annulé */ }
    })();
    maxPage.current = Math.max(maxPage.current, page);
    onProgress((maxPage.current / doc.numPages) * 100, page);
    return () => task?.cancel();
  }, [doc, page, fs, vw]);

  if (err) return <p className="text-rose-400">{err}</p>;
  return (
    <div ref={box} className={`flex flex-col items-center gap-3 h-full ${fs ? 'justify-center bg-slate-950' : ''}`}>
      <canvas ref={canvas} className="bg-white rounded shadow" />
      <div className="flex items-center gap-4">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>◀</button>
        <span className="text-sm">{t('player.page', { a: page, b: doc?.numPages || '…' })}</span>
        <button className="btn-ghost" disabled={!doc || page >= doc.numPages} onClick={() => setPage(page + 1)}>▶</button>
        <button className="btn-ghost" title={t(fs ? 'player.exitFullscreen' : 'player.fullscreen')} aria-label={t(fs ? 'player.exitFullscreen' : 'player.fullscreen')} onClick={toggleFs}>{fs ? '⤡' : '⛶'}</button>
      </div>
    </div>
  );
}

/** PowerPoint : converti en PDF par le poste (PowerPoint / LibreOffice) puis affiché comme un PDF. */
function Pptx({ item, onProgress }) {
  const { t } = useI18n();
  const [pdf, setPdf] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    api('pptx:prepare', item.id).then((r) => alive && setPdf(r)).catch((e) => alive && setErr(errText(e, t)));
    return () => { alive = false; };
  }, [item.id]);
  if (err) return <div className="card max-w-lg text-center text-amber-300">⚠ {err}</div>;
  if (!pdf) return <div className="text-slate-300 animate-pulse">📊 {t('player.pptxConverting')}</div>;
  return <Pdf item={{ ...item, id: pdf.id }} onProgress={onProgress} />;
}

export default function Player({ item, module, data, go }) {
  const { t } = useI18n();
  const allowSkip = !!data?.settings?.allowSkip;
  const [reached, setReached] = useState(!!item.completed);
  const hasQuiz = !!item.quiz;
  const quizPassed = !hasQuiz || !!item.quiz.passed;
  const onProgress = (percent, positionSec) => { if (percent >= 98) setReached(true); return api('progress:update', { itemId: item.id, percent, positionSec }).catch(() => {}); };
  const idx = module.items.findIndex((i) => i.id === item.id);
  const next = module.items.slice(idx + 1).find((i) => i.viewable);

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between gap-3">
        <button className="btn-ghost" onClick={() => go({ name: 'dashboard' })}>← {t('app.back')}</button>
        <div className="font-medium truncate">{item.title}</div>
        {hasQuiz && !quizPassed && (reached || !item.required) && <button className="btn-primary" onClick={() => go({ name: 'quiz', moduleId: `lq:${item.id}` })}>📝 {t('dash.takeLessonTest')}</button>}
        {next && (quizPassed || next.unlocked === true) ? <button className="btn-primary" disabled={!reached && !data?.isStaff && next.unlocked === false} onClick={() => go({ name: 'player', item: next, module })}>{t('player.next')} ▶</button> : <span className="w-24" />}
      </div>
      <div className="flex-1 min-h-0 grid place-items-center overflow-auto">
        {item.type === 'pdf' ? <Pdf key={item.id} item={item} onProgress={onProgress} /> : item.type === 'pptx' ? <Pptx key={item.id} item={item} onProgress={onProgress} /> : <Media key={item.id} item={item} allowSkip={allowSkip} onProgress={onProgress} />}
      </div>
    </div>
  );
}
