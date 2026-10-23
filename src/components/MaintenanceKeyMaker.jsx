import { useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useUi } from './ui.jsx';

/** Super-administrateur : crée sur la clé USB le dossier WLS-Maintenance (clé signée valable pour tous les postes + installeur optionnel). */
export default function MaintenanceKeyMaker() {
  const { t, fmtDateTime } = useI18n();
  const { toast } = useUi();
  const [f, setF] = useState({ target: '', installer: '', hours: 24 });
  const [pem, setPem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const onFile = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || file.size > 4096) { if (file) toast(t('err.PEM_INVALID'), 'err'); return; }
    const r = new FileReader(); r.onload = () => setPem(String(r.result)); r.readAsText(file);
  };
  const run = async () => {
    setBusy(true); setDone(null);
    try { const r = await api('maintenance:create', pem, { hours: Number(f.hours), target: f.target, installer: f.installer }); setPem(''); setDone(r); }
    catch (e) { toast(errText(e, t), 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">🔑 {t('mk.title')}</h3>
      <p className="text-sm text-slate-300">{t('mk.help')}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">{t('mk.target')}</label><input className="input font-mono" value={f.target} onChange={set('target')} placeholder="E:\" /></div>
        <div><label className="label">{t('mk.hours')}</label><input className="input" type="number" min="1" max="744" value={f.hours} onChange={set('hours')} /></div>
        <div className="sm:col-span-2"><label className="label">{t('mk.installer')}</label><input className="input font-mono" value={f.installer} onChange={set('installer')} placeholder="C:\...\Wise-Design-Learning-Systems-Setup-1.7.0.exe" /></div>
      </div>
      <div>
        <div className="flex items-center justify-between"><label className="label">{t('iss.pem')}</label>
          <label className="btn-ghost btn-sm cursor-pointer">📂 {t('iss.pemLoad')}<input type="file" accept=".pem,.key,.txt" className="hidden" onChange={onFile} /></label></div>
        <textarea className="input font-mono text-xs h-20" value={pem} onChange={(e) => setPem(e.target.value)} spellCheck={false} autoComplete="off" placeholder="-----BEGIN PRIVATE KEY-----" />
      </div>
      <button className="btn-primary" disabled={!pem.trim() || !f.target || busy} onClick={run}>🔑 {t('mk.create')}</button>
      {done && <div className="rounded-lg bg-emerald-900/40 p-3 text-sm">✅ {t('mk.done', { dir: done.dir, date: fmtDateTime(done.expires) })}{done.installer ? ` · ${done.installer}` : ''}</div>}
    </div>
  );
}
