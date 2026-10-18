import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../api.js';
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
    ref, src: mediaUrl(item.id), controls: true, autoPlay: true, ...LOCKED,
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

  if (!isAudio) return <video {...props} className="max-h-full max-w-full bg-black rounded-lg" />;
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
      const scale = Math.min((window.innerWidth - 80) / base.width, (window.innerHeight - 260) / base.height) * dpr;
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
  }, [doc, page]);

  if (err) return <p className="text-rose-400">{err}</p>;
  return (
    <div className="flex flex-col items-center gap-3 h-full">
      <canvas ref={canvas} className="bg-white rounded shadow" />
      <div className="flex items-center gap-4">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>◀</button>
        <span className="text-sm">{t('player.page', { a: page, b: doc?.numPages || '…' })}</span>
        <button className="btn-ghost" disabled={!doc || page >= doc.numPages} onClick={() => setPage(page + 1)}>▶</button>
      </div>
    </div>
  );
}

export default function Player({ item, module, data, go }) {
  const { t } = useI18n();
  const allowSkip = !!data?.settings?.allowSkip;
  const onProgress = (percent, positionSec) => api('progress:update', { itemId: item.id, percent, positionSec }).catch(() => {});
  const idx = module.items.findIndex((i) => i.id === item.id);
  const next = module.items.slice(idx + 1).find((i) => i.viewable);

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between gap-3">
        <button className="btn-ghost" onClick={() => go({ name: 'dashboard' })}>← {t('app.back')}</button>
        <div className="font-medium truncate">{item.title}</div>
        {next ? <button className="btn-primary" onClick={() => go({ name: 'player', item: next, module })}>{t('player.next')} ▶</button> : <span className="w-24" />}
      </div>
      <div className="flex-1 min-h-0 grid place-items-center overflow-auto">
        {item.type === 'pdf' ? <Pdf key={item.id} item={item} onProgress={onProgress} /> : <Media key={item.id} item={item} allowSkip={allowSkip} onProgress={onProgress} />}
      </div>
    </div>
  );
}
