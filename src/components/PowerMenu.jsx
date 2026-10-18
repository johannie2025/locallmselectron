import { useEffect, useRef, useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useUi } from './ui.jsx';

/** Boutons d'alimentation (fermer la session, redémarrer, éteindre) : indispensables quand il n'y a plus de bureau Windows. */
export default function PowerMenu({ sys }) {
  const { t } = useI18n();
  const { confirm, toast } = useUi();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!sys || sys.platform !== 'win32') return null;
  const go = async (a) => {
    setOpen(false);
    if (!(await confirm(t(`pow.q.${a}`), { danger: a !== 'logoff' }))) return;
    try { await api('system:power', a); } catch (e) { toast(errText(e, t), 'err'); }
  };
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost btn-sm" title={t('pow.menu')} aria-label={t('pow.menu')} onClick={() => setOpen(!open)}>⏻</button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 w-56 rounded-xl border border-white/10 bg-slate-900 shadow-xl p-1 text-sm animate-pop">
          {['logoff', 'restart', 'shutdown'].map((a) => (
            <button key={a} className="block w-full text-left rounded-lg px-3 py-2 hover:bg-white/10" onClick={() => go(a)}>{{ logoff: '🚪', restart: '🔄', shutdown: '⏻' }[a]} {t(`pow.${a}`)}</button>
          ))}
        </div>
      )}
    </div>
  );
}
