import { useState } from 'react';
import { Modal } from './ui.jsx';
import { useI18n } from '../i18n/index.jsx';
import { api, errText } from '../api.js';

/** Sortie contrôlée depuis l'écran de connexion / de verrouillage : identifiants administrateur requis. */
export default function AdminExit({ className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [maint, setMaint] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api('auth:adminExit', u, p, maint); } catch (x) { setErr(errText(x, t)); }
  };
  return (
    <>
      <button className={`btn-ghost btn-sm ${className}`} onClick={() => setOpen(true)}>⏻ {t('login.exit')}</button>
      {open && (
        <Modal title={t('login.exit')} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-slate-300">{t('login.exitHelp')}</p>
            <input className="input" placeholder={t('common.username')} value={u} onChange={(e) => setU(e.target.value)} autoFocus />
            <input className="input" type="password" placeholder={t('common.password')} value={p} onChange={(e) => setP(e.target.value)} />
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> {t('exit.maintenance')}</label>
            {err && <p className="text-rose-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              <button className="btn-danger">⏻ {t('exit.quit')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
