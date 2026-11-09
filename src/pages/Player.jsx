import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'; // build « legacy » : compatible avec le Chromium d'Electron
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useBrand } from '../brand/BrandProvider.jsx';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const mediaUrl = (rel) => 'lms-media://f/' + rel.split('/').map(encodeURIComponent).join('/');
// Pas de téléchargement, pas de lecture à distance, pas d'image dans l'image, pas de menu contextuel
const LOCKED = { controlsList: 'nodownload noremoteplayback', disablePictureInPicture: true, onContextMenu: (e) => e.preventDefault() };

/** WebVTT → [{ start, end, text }] (balises retirées) */
export function parseVtt(vtt) {
  const sec = (x) => { const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(x.trim()); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000 : NaN; };
  const cues = [];
  for (const block of String(vtt).replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const k = lines.findIndex((l) => l.includes('-->'));
    if (k < 0) continue;
    const [a, b] = lines[k].split('-->');
    const start = sec(a); const end = sec((b || '').trim().split(/\s+/)[0] || '');
    const text = lines.slice(k + 1).join(' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (Number.isFinite(start) && Number.isFinite(end) && text) cues.push({ start, end, text });
  }
  return cues;
}
const langLabel = (code, ui) => { try { const n = new Intl.DisplayNames([ui], { type: 'language' }).of(code); return n ? n.charAt(0).toUpperCase() + n.slice(1) : code; } catch { return code; } };
const stamp = (x) => { const n = Math.floor(x); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

/** Lecteur vidéo ET audio : reprise de position, progression, saut en avant interdit (sauf réglage), sans bouton de téléchargement. */
function Media({ item, free, onProgress }) {
  const { t, lang } = useI18n();
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

  // Sous-titres / transcriptions : fichiers <média>.<langue>.vtt|srt à côté du média. La langue suit celle de l'interface.
  const [subs, setSubs] = useState([]);
  const [subLang, setSubLang] = useState(''); // langue choisie, partagée entre sous-titres et transcription
  const [ccOn, setCcOn] = useState(false);
  const [trOpen, setTrOpen] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let alive = true; let urls = [];
    api('media:subtitles', item.id).then((list) => {
      if (!alive) return;
      const mapped = (list || []).map((x) => { const url = URL.createObjectURL(new Blob([x.vtt], { type: 'text/vtt' })); urls.push(url); return { lang: x.lang, url, cues: parseVtt(x.vtt) }; });
      setSubs(mapped);
    }).catch(() => {});
    return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [item.id]);
  useEffect(() => {
    const own = subs.find((x) => x.lang === lang);
    setCcOn(!!own);
    setSubLang((own || subs.find((x) => x.lang === 'en') || subs[0])?.lang || '');
  }, [subs, lang]);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    for (const tr of Array.from(v.textTracks || [])) tr.mode = ccOn && tr.language === subLang ? 'showing' : 'disabled';
  }, [subs, subLang, ccOn]);
  const cuesAll = subs.find((x) => x.lang === subLang)?.cues || [];
  const cues = !free && item.clip ? cuesAll.filter((c) => c.end > item.clip.start && c.start < item.clip.end) : cuesAll;
  const active = cues.findIndex((c) => now >= c.start && now < c.end);
  const panelRef = useRef(null);
  useEffect(() => { if (active >= 0) panelRef.current?.querySelector(`[data-cue="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, trOpen]);

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
    const span = (x) => (!free && item.clip ? item.clip.end - item.clip.start : x.duration);
    const now = Date.now();
    if (!force && now - lastSent.current < 5000) return;
    lastSent.current = now;
    const from = !free && item.clip ? item.clip.start : 0;
    onProgress(Math.min(100, ((maxRef.current - from) / span(v)) * 100), v.currentTime);
  };
  useEffect(() => () => send(true), []); // sauvegarde en quittant

  // Portion visible (clip) : seulement pour les étudiants ; formateurs/admins voient toute la vidéo
  const clip = !free && item.clip ? item.clip : null;
  const lastT = useRef(0);
  const props = {
    ref, crossOrigin: 'anonymous', src: mediaUrl(item.id), controls: true, onError: () => setErr(true), autoPlay: true, ...LOCKED,
    onLoadedMetadata: (e) => {
      const v = e.target;
      const from = clip ? clip.start : 0;
      const pos = Math.max(from, item.positionSec || 0);
      const limit = clip ? clip.end - 1 : v.duration - 2;
      const t0 = pos < limit ? pos : from;
      // zone déjà vue : mémorisée côté serveur (pourcentage de la portion) — leçon terminée = tout est accessible
      const end = clip ? clip.end : v.duration;
      const seen = item.completed ? end : from + (Math.min(100, item.percent || 0) / 100) * (end - from);
      maxRef.current = Math.max(seen, t0); lastT.current = t0;
      if (t0 > 0) v.currentTime = t0;
    },
    // Saut (barre de progression) : refusé au-delà de la position déjà vue (sauf avance autorisée / formateur) et hors de la portion
    onSeeking: (e) => {
      const v = e.target; const t0 = v.currentTime;
      let to = t0;
      if (!free && t0 > maxRef.current + 1.5) to = maxRef.current;
      if (clip) to = Math.min(Math.max(to, clip.start), clip.end);
      if (Math.abs(to - t0) > 0.05) v.currentTime = to;
      lastT.current = to;
    },
    onTimeUpdate: (e) => {
      const v = e.target; const t0 = v.currentTime;
      setNow(t0);
      // la position « vue » n'avance que par lecture normale (petits pas), pas par un saut
      if (free || (t0 > lastT.current && t0 - lastT.current < 1.5)) maxRef.current = Math.max(maxRef.current, t0);
      lastT.current = t0;
      if (clip && t0 >= clip.end - 0.05) { v.pause(); v.currentTime = clip.end; maxRef.current = clip.end; send(true); return; }
      send(false);
    },
    onEnded: (e) => { maxRef.current = clip ? clip.end : e.target.duration; setPlaying(false); send(true); },
    onPlay: (e) => { setPlaying(true); if (clip && e.target.currentTime >= clip.end - 0.1) e.target.currentTime = clip.start; },
    onPause: () => { setPlaying(false); send(true); },
  };

  const boostBar = (
    <div className="relative">
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
  const tools = (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
      {boostBar}
      {subs.length > 0 && !isAudio && (
        <label className="flex items-center gap-1 text-sm">💬
          <select className="input !py-1 !w-auto" value={ccOn ? subLang : 'off'} onChange={(e) => { if (e.target.value === 'off') setCcOn(false); else { setSubLang(e.target.value); setCcOn(true); } }} aria-label={t('player.subtitles')}>
            <option value="off">{t('player.subsOff')}</option>
            {subs.map((x) => <option key={x.lang} value={x.lang}>{langLabel(x.lang, lang)}</option>)}
          </select>
        </label>
      )}
      {subs.length > 0 && <button className={trOpen ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setTrOpen(!trOpen)}>📄 {t('player.transcript')}</button>}
    </div>
  );
  const panel = trOpen && (
    <aside className="w-80 shrink-0 card !p-3 flex flex-col min-h-0 max-h-full text-left">
      <div className="flex items-center gap-2 mb-2">
        <b className="flex-1">{t('player.transcript')}</b>
        <select className="input !py-1 !w-auto" value={subLang} onChange={(e) => setSubLang(e.target.value)}>
          {subs.map((x) => <option key={x.lang} value={x.lang}>{langLabel(x.lang, lang)}</option>)}
        </select>
        <button className="text-slate-400 hover:text-white" onClick={() => setTrOpen(false)} aria-label="close">✕</button>
      </div>
      <div ref={panelRef} className="overflow-auto space-y-1 text-sm">
        {cues.map((c, i) => (
          <button key={i} data-cue={i} className={`w-full text-left rounded px-2 py-1 flex gap-2 ${i === active ? 'bg-brand/30 ring-1 ring-brand' : 'hover:bg-white/5'}`}
            onClick={() => { const v = ref.current; if (v) { v.currentTime = c.start; v.play?.().catch(() => {}); } }}>
            <span className="font-mono text-xs text-slate-400 pt-0.5">{stamp(c.start)}</span><span className="flex-1">{c.text}</span>
          </button>
        ))}
        {!cues.length && <p className="text-slate-400">{t('player.noTranscript')}</p>}
      </div>
    </aside>
  );
  const errBox = err && <div className="mt-2 text-center text-sm text-amber-300">⚠ {t('player.codecError')}</div>;
  if (!isAudio) {
    return (
      <div className="flex h-full w-full gap-4 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 items-center justify-center min-h-0">
          <video {...props} className="max-h-[calc(100%-4rem)] max-w-full bg-black rounded-lg">
            {subs.map((x) => <track key={x.lang} kind="subtitles" srcLang={x.lang} label={langLabel(x.lang, lang)} src={x.url} />)}
          </video>
          {errBox}{tools}
        </div>
        {panel}
      </div>
    );
  }
  return (
    <div className="flex w-full max-h-full gap-4 justify-center">
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
      {errBox}{tools}
      <style>{'@keyframes eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}'}</style>
      <p className="sr-only">{t('player.next')}</p>
    </div>
    {panel}
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
      } catch (e) { setErr(`${t('player.pdfError')} (${errText(e, t) || e?.message || e})`); }
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

/** Diapositives exportées en images par PowerPoint (affichage direct, sans moteur PDF) */
function Slides({ item, count, onProgress }) {
  const { t } = useI18n();
  const box = useRef(null);
  const [page, setPage] = useState(Math.min(count, Math.max(1, Math.round(item.positionSec || 1))));
  const [img, setImg] = useState('');
  const [err, setErr] = useState('');
  const [fs, setFs] = useState(false);
  const cache = useRef(new Map());
  const maxPage = useRef(0);
  const toggleFs = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else box.current?.requestFullscreen(); } catch { /* refusé */ } };
  useEffect(() => {
    const onFs = () => setFs(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) setPage((p) => Math.min(p + 1, count));
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);
  const load = (n) => {
    if (!cache.current.has(n)) cache.current.set(n, api('pptx:slide', item.id, n));
    return cache.current.get(n);
  };
  useEffect(() => {
    let alive = true;
    load(page).then((d) => { if (alive) setImg(d); if (page < count) load(page + 1).catch(() => {}); }).catch((e) => alive && setErr(errText(e, t) || String(e?.message || e)));
    maxPage.current = Math.max(maxPage.current, page);
    onProgress((maxPage.current / count) * 100, page);
    return () => { alive = false; };
  }, [page]);
  if (err) return <p className="text-rose-400">{t('player.pdfError')} ({err})</p>;
  return (
    <div ref={box} className={`flex flex-col items-center gap-3 h-full w-full ${fs ? 'justify-center bg-slate-950' : ''}`}>
      <div className="flex-1 min-h-0 w-full grid place-items-center">
        {img && <img src={img} alt="" draggable={false} onClick={() => setPage((p) => Math.min(p + 1, count))} className="max-w-full max-h-full object-contain bg-white rounded shadow cursor-pointer" />}
      </div>
      <div className="flex items-center gap-4">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>◀</button>
        <span className="text-sm">{t('player.page', { a: page, b: count })}</span>
        <button className="btn-ghost" disabled={page >= count} onClick={() => setPage(page + 1)}>▶</button>
        <button className="btn-ghost" title={t(fs ? 'player.exitFullscreen' : 'player.fullscreen')} aria-label={t(fs ? 'player.exitFullscreen' : 'player.fullscreen')} onClick={toggleFs}>{fs ? '⤡' : '⛶'}</button>
      </div>
    </div>
  );
}

/** PowerPoint : lu directement via le PowerPoint installé (images des diapositives) ; à défaut PDF (PowerPoint / LibreOffice). */
function Pptx({ item, onProgress }) {
  const { t } = useI18n();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    api('pptx:prepare', item.id).then((r) => alive && setRes(r)).catch((e) => alive && setErr(errText(e, t)));
    return () => { alive = false; };
  }, [item.id]);
  if (err) return <div className="card max-w-lg text-center text-amber-300">⚠ {err}</div>;
  if (!res) return <div className="text-slate-300 animate-pulse">📊 {t('player.pptxConverting')}</div>;
  if (res.kind === 'slides') return <Slides item={item} count={res.count} onProgress={onProgress} />;
  return <Pdf item={{ ...item, id: res.id }} onProgress={onProgress} />;
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
        {item.type === 'pdf' ? <Pdf key={item.id} item={item} onProgress={onProgress} /> : item.type === 'pptx' ? <Pptx key={item.id} item={item} onProgress={onProgress} /> : <Media key={item.id} item={item} free={allowSkip || !!data?.isStaff} onProgress={onProgress} />}
      </div>
    </div>
  );
}
