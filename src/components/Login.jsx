import { useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n, LangSwitch } from '../i18n/index.jsx';
import { useBrand } from '../brand/BrandProvider.jsx';
import BackgroundFX from './BackgroundFX.jsx';
import Globe from './Globe.jsx';
import Footer from './Footer.jsx';
import About from './About.jsx';
import AdminExit from './AdminExit.jsx';

/** Écran de connexion : logo, nom, slogan et couleurs du centre, fond animé (+ image personnalisable). */
export function Login({ onLogin }) {
  const { t } = useI18n();
  const brand = useBrand();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { onLogin(await api('auth:login', u, p)); } catch (x) { setErr(errText(x, t)); setBusy(false); }
  };
  return (
    <div className="h-full flex flex-col relative">
      <BackgroundFX image={brand.loginBg} />
      <div className="relative z-10 flex items-center justify-between p-4">
        <About />
        <LangSwitch />
      </div>
      <div className="relative z-10 flex-1 min-h-0 overflow-auto grid place-items-center p-4">
        <div className="grid md:grid-cols-2 gap-10 items-center max-w-5xl w-full">
          <div className="text-center md:text-left space-y-4 animate-fade-up">
            <span className="logo-badge"><img src={brand.logoSrc} alt={brand.name} className="h-24 w-auto max-w-[18rem] object-contain" /></span>
            <h1 className="text-4xl font-bold leading-tight">{brand.name}</h1>
            {brand.slogan && <p className="text-lg text-white/90 italic">{brand.slogan}</p>}
            <p className="text-slate-200">{t('login.tagline')}</p>
            <Globe size={220} className="hidden md:block opacity-90 -ml-4" />
          </div>
          <form onSubmit={submit} className="card w-full max-w-sm mx-auto space-y-4 animate-fade-up bg-slate-900/70" style={{ animationDelay: '.15s' }}>
            <h2 className="text-xl font-semibold">{t('login.submit')}</h2>
            <div><label className="label">{t('common.username')}</label><input className="input" value={u} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" /></div>
            <div><label className="label">{t('common.password')}</label><input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></div>
            {err && <p className="text-rose-400 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || !u || !p}>{t('login.submit')}</button>
            <div className="text-center"><AdminExit /></div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function ChangePassword({ onDone }) {
  const { t } = useI18n();
  const brand = useBrand();
  const [o, setO] = useState('');
  const [n, setN] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { onDone(await api('auth:changePassword', o, n)); } catch (x) { setErr(errText(x, t)); }
  };
  return (
    <div className="h-full flex flex-col relative">
      <BackgroundFX image={brand.loginBg} calm />
      <div className="relative z-10 flex-1 grid place-items-center p-4">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 bg-slate-900/70">
          <h1 className="text-xl font-semibold">{t('pwd.title')}</h1>
          <input className="input" type="password" placeholder={t('pwd.old')} value={o} onChange={(e) => setO(e.target.value)} autoFocus />
          <input className="input" type="password" placeholder={t('pwd.new')} value={n} onChange={(e) => setN(e.target.value)} />
          {err && <p className="text-rose-400 text-sm">{err}</p>}
          <button className="btn-primary w-full">{t('pwd.submit')}</button>
        </form>
      </div>
      <Footer />
    </div>
  );
}
