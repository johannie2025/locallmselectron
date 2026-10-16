import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../api.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const mediaUrl = (rel) => 'lms-media://f/' + rel.split('/').map(encodeURIComponent).join('/');

function Video({ item, allowSkip, onProgress }) {
  const ref = useRef(null);
  const maxRef = useRef(0);
  const lastSent = useRef(0);

  const send = (force) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    const now = Date.now();
    if (!force && now - lastSent.current < 5000) return;
    lastSent.current = now;
    onProgress(Math.min(100, (maxRef.current / v.duration) * 100), v.currentTime);
  };
  useEffect(() => () => send(true), []); // sauvegarde en quittant

  return (
    <video
      ref={ref} src={mediaUrl(item.id)} controls autoPlay className="max-h-full max-w-full bg-black rounded-lg"
      onLoadedMetadata={(e) => {
        const pos = item.positionSec || 0;
        if (pos > 0 && pos < e.target.duration - 2) { e.target.currentTime = pos; maxRef.current = pos; }
      }}
      onTimeUpdate={(e) => {
        const v = e.target;
        // Interdit de sauter en avant au-delà de ce qui a déjà été regardé (sauf réglage admin)
        if (!allowSkip && v.currentTime > maxRef.current + 2) { v.currentTime = maxRef.current; return; }
        maxRef.current = Math.max(maxRef.current, v.currentTime);
        send(false);
      }}
      onEnded={(e) => { maxRef.current = e.target.duration; send(true); }}
      onPause={() => send(true)}
    />
  );
}

function Pdf({ item, onProgress }) {
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
      } catch (e) { setErr('Impossible de lire ce PDF.'); }
    })();
    return () => { alive = false; };
  }, [item.id]);

  useEffect(() => {
    if (!doc) return;
    let task;
    (async () => {
      const pg = await doc.getPage(page);
      const base = pg.getViewport({ scale: 1 });
      const scale = Math.min((window.innerWidth - 80) / base.width, (window.innerHeight - 220) / base.height) * (window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`;
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
        <span className="text-sm">Page {page} / {doc?.numPages || '…'}</span>
        <button className="btn-ghost" disabled={!doc || page >= doc.numPages} onClick={() => setPage(page + 1)}>▶</button>
      </div>
    </div>
  );
}

export default function Player({ item, module, data, go }) {
  const allowSkip = !!data?.settings?.allowSkip;
  const onProgress = (percent, positionSec) => api('progress:update', { itemId: item.id, percent, positionSec }).catch(() => {});
  const idx = module.items.findIndex((i) => i.id === item.id);
  const next = module.items.slice(idx + 1).find((i) => i.viewable);

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between">
        <button className="btn-ghost" onClick={() => go({ name: 'dashboard' })}>← Retour au cours</button>
        <div className="font-medium">{item.title}</div>
        {next ? <button className="btn-primary" onClick={() => go({ name: 'player', item: next, module })}>Suivant ▶</button> : <span />}
      </div>
      <div className="flex-1 min-h-0 grid place-items-center overflow-auto">
        {item.type === 'video' ? <Video item={item} allowSkip={allowSkip} onProgress={onProgress} /> : <Pdf item={item} onProgress={onProgress} />}
      </div>
    </div>
  );
}
