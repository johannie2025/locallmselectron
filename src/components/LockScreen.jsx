import { useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n, LangSwitch } from '../i18n/index.jsx';
import { useBrand } from '../brand/BrandProvider.jsx';
import { useUi } from './ui.jsx';
import { PHONES } from '../brand.js';
import BackgroundFX from './BackgroundFX.jsx';
import Footer from './Footer.jsx';
import About from './About.jsx';
import AdminExit from './AdminExit.jsx';
import LicenseIssuer from './LicenseIssuer.jsx';
import PowerMenu from './PowerMenu.jsx';

/** Écran affiché quand la licence du poste est absente, invalide ou expirée : tout le reste est verrouillé. */
export default function LockScreen({ lic, onActivated, sys }) {
  const { t, fmtDate } = useI18n();
  const brand = useBrand();
  const { toast } = useUi();
  const [key, setKey] = useState('');
  const [issuer, setIssuer] = useState(false);
  const activate = async () => {
    try { await api('license:activate', key); setKey(''); toast(t('lic.activated')); onActivated(); } catch (e) { toast(errText(e, t), 'err'); }
  };
  return (
    <div className="h-full flex flex-col relative">
      <BackgroundFX image={brand.loginBg} calm />
      <div className="relative z-10 flex items-center justify-between p-4"><About /><div className="flex items-center gap-2"><LangSwitch /><PowerMenu sys={sys} /></div></div>
      <div className="relative z-10 flex-1 min-h-0 overflow-auto grid place-items-center p-4">
        <div className="card w-full max-w-2xl space-y-5 bg-slate-900/95 backdrop-blur-md animate-fade-up">
          <div className="flex items-center gap-4">
            <span className="logo-badge"><img src={brand.logoSrc} alt={brand.name} className="h-14 w-auto" /></span>
            <div>
              <h1 className="text-2xl font-bold">🔒 {t('lock.title')}</h1>
              <span className="inline-block mt-1 rounded-full bg-rose-600/30 text-rose-300 px-3 py-0.5 text-sm font-semibold">{t(`lic.state.${lic.state}`)}</span>
            </div>
          </div>
          <p className="text-slate-200">{lic.state === 'clock' ? t('lock.clock') : lic.state === 'noid' ? t('lock.noid') : t('lock.help')}</p>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            {lic.plan && <><dt className="text-slate-400">{t('lic.plan')}</dt><dd>{t(`lic.plan.${lic.plan}`)}</dd></>}
            {lic.expiresAt && <><dt className="text-slate-400">{t('lic.expires')}</dt><dd>{fmtDate(lic.expiresAt)}</dd></>}
          </dl>
          {lic.machineId && (
            <div className="rounded-lg bg-slate-950/70 p-3">
              <div className="text-xs text-slate-400">{t('lic.machineId')}</div>
              <div className="font-mono text-xl tracking-wider select-text">{lic.machineId}</div>
              {lic.idStrength === 'os' && <p className="mt-2 text-xs text-amber-300">{t('lic.idWeak')}</p>}
            </div>
          )}
          <div className="space-y-2">
            <label className="label">{t('lic.enterKey')}</label>
            <p className="text-sm text-slate-300">{t('lic.howTo')}</p>
            <textarea className="input font-mono text-xs h-24" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t('lic.keyPlaceholder')} />
            <button className="btn-primary" disabled={!key.trim()} onClick={activate}>🔑 {t('lic.activate')}</button>
          </div>
          <div className="text-sm text-slate-300">
            <div>{t('lock.contact')}</div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">{PHONES.map((p) => <span key={p} className="font-mono whitespace-nowrap">WhatsApp {p}</span>)}</div>
          </div>
          <div>
            <button className="btn-ghost btn-sm" onClick={() => setIssuer(!issuer)}>🔏 {t('iss.open')}</button>
            {issuer && <div className="mt-3 rounded-lg border border-white/10 p-4"><LicenseIssuer mode="lock" onDone={() => { toast(t('lic.activated')); onActivated(); }} /></div>}
          </div>
          <AdminExit />
        </div>
      </div>
      <Footer />
    </div>
  );
}
