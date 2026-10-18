import { useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useUi } from './ui.jsx';

const PLANS = ['monthly', 'quarterly', 'semester', 'annual'];

/**
 * Émission de licence par Wise Design.
 *  - mode "lock"    : depuis l'écran verrouillé, identifiants superadmin demandés, la clé est activée sur CE poste.
 *  - mode "session" : superadmin connecté, génération pour n'importe quel poste (ID saisi), activation locale en option.
 * La clé privée est collée ou chargée à chaque fois ; elle est effacée de l'écran dès l'envoi et jamais stockée.
 */
export default function LicenseIssuer({ mode, machineId, onDone }) {
  const { t } = useI18n();
  const { toast } = useUi();
  const lock = mode === 'lock';
  const [f, setF] = useState({ username: '', password: '', machine: machineId || '', plan: 'annual', customer: '', start: new Date().toISOString().slice(0, 10) });
  const [pem, setPem] = useState('');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const onFile = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || file.size > 4096) { if (file) toast(t('err.PEM_INVALID'), 'err'); return; }
    const r = new FileReader(); r.onload = () => setPem(String(r.result)); r.readAsText(file);
  };
  const run = async (activate) => {
    setBusy(true);
    const opts = { plan: f.plan, customer: f.customer, start: f.start };
    try {
      if (lock) { await api('license:issueHere', f.username, f.password, pem, opts); setPem(''); onDone?.(); return; }
      const r = await api('license:issue', pem, { ...opts, machine: f.machine, activate });
      setPem(''); setOut(r);
      if (r.activated) { toast(t('lic.activated')); onDone?.(); }
    } catch (e) { toast(errText(e, t), 'err'); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(out.key); toast(t('iss.copied')); } catch { /* sélection manuelle */ } };
  const ready = pem.trim() && (lock ? f.username && f.password : f.machine);
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">🔏 {t('iss.title')}</h3>
      <p className="text-sm text-slate-300">{t(lock ? 'iss.helpLock' : 'iss.helpSession')}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {lock && <>
          <div><label className="label">{t('common.username')}</label><input className="input" value={f.username} onChange={set('username')} autoComplete="off" /></div>
          <div><label className="label">{t('common.password')}</label><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="off" /></div>
        </>}
        {!lock && <div className="sm:col-span-2"><label className="label">{t('iss.machine')}</label>
          <div className="flex gap-2"><input className="input font-mono" value={f.machine} onChange={set('machine')} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" />
            {machineId && <button type="button" className="btn-ghost btn-sm whitespace-nowrap" onClick={() => setF({ ...f, machine: machineId })}>{t('iss.thisPc')}</button>}</div></div>}
        <div><label className="label">{t('lic.plan')}</label><select className="input" value={f.plan} onChange={set('plan')}>{PLANS.map((p) => <option key={p} value={p}>{t(`lic.plan.${p}`)}</option>)}</select></div>
        <div><label className="label">{t('iss.start')}</label><input className="input" type="date" value={f.start} onChange={set('start')} /></div>
        <div className="sm:col-span-2"><label className="label">{t('iss.customer')}</label><input className="input" value={f.customer} maxLength={80} onChange={set('customer')} /></div>
      </div>
      <div>
        <div className="flex items-center justify-between"><label className="label">{t('iss.pem')}</label>
          <label className="btn-ghost btn-sm cursor-pointer">📂 {t('iss.pemLoad')}<input type="file" accept=".pem,.key,.txt" className="hidden" onChange={onFile} /></label></div>
        <textarea className="input font-mono text-xs h-24" value={pem} onChange={(e) => setPem(e.target.value)} spellCheck={false} autoComplete="off" placeholder="-----BEGIN PRIVATE KEY-----" />
      </div>
      <div className="flex flex-wrap gap-2">
        {lock
          ? <button className="btn-primary" disabled={!ready || busy} onClick={() => run(true)}>🔑 {t('iss.issueActivate')}</button>
          : <>
            <button className="btn-primary" disabled={!ready || busy} onClick={() => run(false)}>🔏 {t('iss.issue')}</button>
            {machineId && f.machine === machineId && <button className="btn-ghost" disabled={!ready || busy} onClick={() => run(true)}>🔑 {t('iss.issueActivate')}</button>}
          </>}
      </div>
      {out && (
        <div className="rounded-lg bg-slate-950/70 p-3 space-y-2">
          <div className="text-xs text-slate-400">{t('iss.result')} · {out.machine} · {t(`lic.plan.${out.plan}`)} · {out.expires.slice(0, 10)}</div>
          <textarea readOnly className="input font-mono text-xs h-24 select-text" value={out.key} onFocus={(e) => e.target.select()} />
          <button className="btn-ghost btn-sm" onClick={copy}>📋 {t('iss.copy')}</button>
        </div>
      )}
    </div>
  );
}
