import { useEffect, useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useUi } from '../components/ui.jsx';

/** Applications (suite Office, outils de développement…) mises à disposition par le centre. */
export default function Apps({ go }) {
  const { t } = useI18n();
  const { toast } = useUi();
  const [apps, setApps] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { api('apps:list').then(setApps).catch(() => setApps([])); }, []);
  const launch = async (a) => {
    setBusy(a.id);
    try { await api('apps:launch', a.id); } catch (e) { toast(errText(e, t), 'err'); }
    setTimeout(() => setBusy(''), 2500);
  };
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost btn-sm" onClick={() => go({ name: 'dashboard' })}>← {t('app.back')}</button>
        <h2 className="text-2xl font-semibold">🧰 {t('apps.title')}</h2>
      </div>
      <p className="text-slate-300">{t('apps.help')}</p>
      {apps && !apps.length && <div className="card text-slate-300">{t('apps.none')}</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(apps || []).map((a) => (
          <button key={a.id} disabled={!!busy} onClick={() => launch(a)}
            className="card text-left flex items-center gap-4 hover:border-sky-400/60 hover:-translate-y-0.5 transition disabled:opacity-60">
            <span className="text-4xl" aria-hidden="true">{a.icon}</span>
            <span className="font-semibold text-lg">{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
