import { useEffect, useState } from 'react';
import { api, errText } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { useBrand, extractPalette } from '../../brand/BrandProvider.jsx';
import { useUi } from '../../components/ui.jsx';
import LicenseIssuer from '../../components/LicenseIssuer.jsx';
import MaintenanceKeyMaker from '../../components/MaintenanceKeyMaker.jsx';
import AdminNetwork from './AdminNetwork.jsx';

function Branding() {
  const { t } = useI18n();
  const { toast } = useUi();
  const brand = useBrand();
  const [name, setName] = useState(brand.centerName || '');
  const [slogan, setSlogan] = useState(brand.slogan || '');
  const [address, setAddress] = useState(brand.address || '');
  const [phone, setPhone] = useState(brand.phone || '');
  const [email, setEmail] = useState(brand.email || '');
  const [website, setWebsite] = useState(brand.website || '');
  const [primary, setPrimary] = useState(brand.primary || '#2563eb');
  const [secondary, setSecondary] = useState(brand.secondary || '#0ea5e9');

  const detect = async (src) => {
    const pal = await extractPalette(src);
    if (pal) { setPrimary(pal.primary); setSecondary(pal.secondary); toast(t('brand.paletteFound')); } else toast(t('brand.paletteNone'), 'err');
  };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast(t('err.IMAGE_TOO_BIG'), 'err'); return; }
    const r = new FileReader();
    r.onload = async () => {
      try { await api('admin:branding:saveLogo', r.result); await brand.reload(); await detect(r.result); }
      catch (err) { toast(errText(err, t), 'err'); }
    };
    r.readAsDataURL(f);
  };
  const save = async () => {
    try { await api('admin:branding:set', { centerName: name, slogan, primary, secondary, address, phone, email, website }); await brand.reload(); toast(t('common.saved')); }
    catch (e) { toast(errText(e, t), 'err'); }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="card space-y-4">
        <h3 className="font-semibold">{t('brand.identity')}</h3>
        <div><label className="label">{t('brand.centerName')}</label><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Wise Design Learning Systems" /></div>
        <div><label className="label">{t('brand.slogan')}</label><input className="input" value={slogan} maxLength={140} onChange={(e) => setSlogan(e.target.value)} /></div>
        <div><label className="label">{t('brand.address')}</label><input className="input" value={address} maxLength={160} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('brand.phone')}</label><input className="input" value={phone} maxLength={60} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="label">{t('brand.email')}</label><input className="input" value={email} maxLength={80} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div><label className="label">{t('brand.website')}</label><input className="input" value={website} maxLength={80} onChange={(e) => setWebsite(e.target.value)} /></div>
        <div>
          <label className="label">{t('brand.logo')}</label>
          <div className="flex items-center gap-4">
            <span className="logo-badge"><img src={brand.logoSrc} alt="" className="h-16 w-auto max-w-[220px] object-contain" /></span>
            <div className="space-y-2">
              <label className="btn-ghost btn-sm inline-block cursor-pointer">⬆ {t('brand.upload')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} /></label>
              {brand.logo && <button className="btn-ghost btn-sm block" onClick={async () => { await api('admin:branding:removeLogo'); await brand.reload(); }}>✕ {t('brand.removeLogo')}</button>}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t('brand.folderHelp')}</p>
        </div>
      </div>
      <div className="card space-y-4">
        <h3 className="font-semibold">{t('brand.colors')}</h3>
        <div className="flex items-center gap-6">
          <label className="text-sm">{t('brand.primary')}<input type="color" className="block w-20 h-10 mt-1 bg-transparent" value={primary} onChange={(e) => setPrimary(e.target.value)} /></label>
          <label className="text-sm">{t('brand.secondary')}<input type="color" className="block w-20 h-10 mt-1 bg-transparent" value={secondary} onChange={(e) => setSecondary(e.target.value)} /></label>
          <button className="btn-ghost btn-sm" onClick={() => detect(brand.logoSrc)}>🎨 {t('brand.detect')}</button>
        </div>
        <div className="rounded-xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
          <div className="font-bold text-lg">{name || 'Wise Design Learning Systems'}</div><div className="text-sm opacity-90">{slogan || t('login.tagline')}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={save}>💾 {t('common.save')}</button>
          <button className="btn-ghost" onClick={() => { setPrimary(''); setSecondary(''); setName(''); setSlogan(''); }}>↺ {t('brand.reset')}</button>
        </div>
        <p className="text-xs text-slate-400">{t('brand.note')}</p>
      </div>
    </div>
  );
}

function General() {
  const { t } = useI18n();
  const { toast } = useUi();
  const [s, setS] = useState(null);
  useEffect(() => { api('admin:settings:get').then(setS); }, []);
  if (!s) return null;
  const upd = (p) => setS({ ...s, ...p });
  return (
    <div className="card space-y-4 max-w-xl">
      <div><label className="label">{t('set.root')}</label><input className="input" value={s.courseRoot} onChange={(e) => upd({ courseRoot: e.target.value })} /></div>
      <div><label className="label">{t('set.minScore')}</label><input className="input" type="number" min="0" max="100" value={s.minScore} onChange={(e) => upd({ minScore: Number(e.target.value) })} /></div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoQuiz} onChange={(e) => upd({ autoQuiz: e.target.checked })} /> {t('set.autoQuiz')}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={s.allowSkip} onChange={(e) => upd({ allowSkip: e.target.checked })} /> {t('set.allowSkip')}</label>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={async () => { setS(await api('admin:settings:set', s)); toast(t('common.saved')); }}>💾 {t('common.save')}</button>
        <button className="btn-ghost" onClick={async () => { await api('courses:rescan'); toast(t('set.rescanned')); }}>⟳ {t('set.rescan')}</button>
      </div>
    </div>
  );
}

function AppsAdmin() {
  const { t } = useI18n();
  const { toast } = useUi();
  const [list, setList] = useState(null);
  const [detected, setDetected] = useState([]);
  useEffect(() => { api('admin:apps:get').then((r) => { setList(r.apps); setDetected(r.detected); }); }, []);
  if (!list) return null;
  const upd = (i, p) => setList(list.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const detect = () => {
    const have = new Set(list.map((a) => a.path.toLowerCase() + '|' + (a.args || '')));
    const fresh = detected.filter((d) => !have.has(d.path.toLowerCase() + '|' + (d.args || ''))).map((d) => ({ ...d, enabled: true, exists: true }));
    setList([...list, ...fresh]);
    toast(fresh.length ? t('apps.admin.found', { n: fresh.length }) : t('apps.admin.nothing'));
  };
  const save = async () => {
    try { setList(await api('admin:apps:save', list)); toast(t('common.saved')); } catch (e) { toast(errText(e, t), 'err'); }
  };
  return (
    <div className="card space-y-4">
      <p className="text-sm text-slate-300">{t('apps.admin.help')}</p>
      <p className="text-xs text-amber-300">{t('apps.admin.devWarn')}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost btn-sm" onClick={detect}>🔎 {t('apps.admin.detect')}</button>
        <button className="btn-ghost btn-sm" onClick={() => setList([...list, { id: '', name: '', path: '', args: '', enabled: true, icon: '🧩', exists: true }])}>＋ {t('apps.admin.add')}</button>
      </div>
      <div className="space-y-2">
        {list.map((a, i) => (
          <div key={i} className="grid md:grid-cols-[auto_1fr_2fr_1fr_auto] gap-2 items-end rounded-lg bg-slate-900/50 p-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} /> {a.icon} {t('apps.admin.enabled')}</label>
            <div><label className="label">{t('apps.admin.name')}</label><input className="input" value={a.name} maxLength={40} onChange={(e) => upd(i, { name: e.target.value })} /></div>
            <div><label className="label">{t('apps.admin.path')}</label><input className="input font-mono text-xs" value={a.path} onChange={(e) => upd(i, { path: e.target.value })} placeholder="C:\\Program Files\\…\\app.exe" />
              {a.path && a.exists === false && <span className="text-xs text-amber-300">{t('apps.admin.missing')}</span>}</div>
            <div><label className="label">{t('apps.admin.args')}</label><input className="input font-mono text-xs" value={a.args || ''} maxLength={200} onChange={(e) => upd(i, { args: e.target.value })} /></div>
            <button className="btn-danger btn-sm" onClick={() => setList(list.filter((_, k) => k !== i))}>🗑</button>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={save}>💾 {t('common.save')}</button>
    </div>
  );
}

function License({ lic, onLicense, user }) {
  const { t, fmtDate } = useI18n();
  const { toast } = useUi();
  const [key, setKey] = useState('');
  const ok = lic.state === 'active' || lic.state === 'trial';
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="card space-y-3">
        <h3 className="font-semibold">{t('lic.status')}</h3>
        <div className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${ok ? 'bg-emerald-600/30 text-emerald-300' : 'bg-rose-600/30 text-rose-300'}`}>{t(`lic.state.${lic.state}`)}</div>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-400">{t('lic.plan')}</dt><dd>{lic.plan ? t(`lic.plan.${lic.plan}`) : '—'}</dd>
          <dt className="text-slate-400">{t('lic.expires')}</dt><dd>{fmtDate(lic.expiresAt)}</dd>
          <dt className="text-slate-400">{t('lic.daysLeft')}</dt><dd>{lic.daysLeft ?? '—'}</dd>
          {lic.customer && <><dt className="text-slate-400">{t('lic.customer')}</dt><dd>{lic.customer}</dd></>}
        </dl>
        <div className="rounded-lg bg-slate-900/70 p-3"><div className="text-xs text-slate-400">{t('lic.machineId')}</div><div className="font-mono text-lg select-text">{lic.machineId}</div>{lic.idStrength === 'os' && <p className="mt-2 text-xs text-amber-300">{t('lic.idWeak')}</p>}</div>
      </div>
      <div className="card space-y-3">
        <h3 className="font-semibold">{t('lic.enterKey')}</h3>
        <p className="text-sm text-slate-300">{t('lic.howTo')}</p>
        <textarea className="input font-mono text-xs h-28" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t('lic.keyPlaceholder')} />
        <button className="btn-primary" onClick={async () => { try { await api('license:activate', key); setKey(''); toast(t('lic.activated')); onLicense(); } catch (e) { toast(errText(e, t), 'err'); } }}>🔑 {t('lic.activate')}</button>
      </div>
      {user.role === 'superadmin' && <div className="card lg:col-span-2"><MaintenanceKeyMaker /></div>}
      {user.role === 'superadmin' && <div className="card lg:col-span-2"><LicenseIssuer mode="session" machineId={lic.machineId} onDone={onLicense} /></div>}
    </div>
  );
}

function Exit({ user, sys }) {
  const { t } = useI18n();
  const [p, setP] = useState('');
  const [maint, setMaint] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="card space-y-3 max-w-md">
      {sys && (
        <div className="rounded-lg bg-slate-900/70 p-3 text-sm space-y-1">
          <div className="text-xs text-slate-400">{t('sys.title')}</div>
          <div><span className="text-slate-400">{t('sys.user')} : </span><span className="font-mono">{sys.winUser || '—'}</span></div>
          <div><span className="text-slate-400">{t('sys.mode')} : </span>{t(sys.shell ? 'sys.mode.shell' : sys.kiosk ? 'sys.mode.kiosk' : 'sys.mode.window')}</div>
          {sys.portable && <div>{t('sys.portable')}</div>}
          {sys.netMode && sys.netMode !== 'standalone' && <div><span className="text-slate-400">{t('sys.net')} : </span>{t(`net.badge.${sys.netMode}`)}{sys.netServer ? ` → ${sys.netServer}` : ''}</div>}
          {sys.shell && <p className="text-xs text-amber-300">{t('sys.shellHelp')}</p>}
        </div>
      )}
      <p>{t('exit.help')}</p>
      <input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder={t('common.password')} />
      {['admin','superadmin'].includes(user.role) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> {t('exit.maintenance')}</label>}
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button className="btn-danger" onClick={() => api('admin:exit', p, maint).catch((e) => setErr(errText(e, t)))}>⏻ {t('exit.quit')}</button>
    </div>
  );
}

export default function AdminSettings({ lic, onLicense, user, sys }) {
  const { t } = useI18n();
  const [sub, setSub] = useState('brand');
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold">{t('admin.settings')}</h2>
      <div className="flex gap-2 flex-wrap">
        {[['brand', 'set.brand'], ['general', 'set.general'], ['apps', 'set.apps'], ...(user.role === 'superadmin' ? [['network', 'set.network']] : []), ['license', 'set.license'], ['exit', 'set.exit']].map(([i, k]) => <button key={i} className={sub === i ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setSub(i)}>{t(k)}</button>)}
      </div>
      {sub === 'brand' && <Branding />}
      {sub === 'general' && <General />}
      {sub === 'apps' && <AppsAdmin />}
      {sub === 'network' && user.role === 'superadmin' && <AdminNetwork />}
      {sub === 'license' && <License lic={lic} onLicense={onLicense} user={user} />}
      {sub === 'exit' && <Exit user={user} sys={sys} />}
    </div>
  );
}
