import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useI18n, LangSwitch } from './i18n/index.jsx';
import { useBrand } from './brand/BrandProvider.jsx';
import BackgroundFX from './components/BackgroundFX.jsx';
import Footer from './components/Footer.jsx';
import About from './components/About.jsx';
import LockScreen from './components/LockScreen.jsx';
import { Login, ChangePassword } from './components/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Apps from './pages/Apps.jsx';
import PowerMenu from './components/PowerMenu.jsx';
import Player from './pages/Player.jsx';
import Quiz from './pages/Quiz.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminPeople from './pages/admin/AdminPeople.jsx';
import AdminContent from './pages/admin/AdminContent.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';

const ADMIN_TABS = [['dash', 'admin.dash', '📊'], ['people', 'admin.people', '👥'], ['content', 'admin.content', '🗂️'], ['reports', 'admin.reports', '🎓'], ['settings', 'admin.settings', '⚙️']];

export default function App() {
  const { t, setLang } = useI18n();
  const brand = useBrand();
  const [lic, setLic] = useState(null);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState({ name: 'dashboard' });
  const [apps, setApps] = useState([]);
  const [sys, setSys] = useState(null);
  useEffect(() => { api('system:info').then(setSys).catch(() => {}); }, []);

  const refreshLic = useCallback(() => api('license:status').then(setLic).catch(() => {}), []);
  useEffect(() => { refreshLic(); const x = setInterval(refreshLic, 60000); return () => clearInterval(x); }, [refreshLic]);

  const reload = useCallback(async () => { try { setData(await api('courses:list')); } catch { /* session perdue ou licence expirée */ } }, []);
  useEffect(() => { if (user && !user.mustChange && !lic?.locked) reload(); }, [user, lic?.locked, reload]);
  useEffect(() => window.lms.onCoursesChanged(reload), [reload]);
  useEffect(() => { if (user && !user.mustChange && !lic?.locked) api('apps:list').then(setApps).catch(() => setApps([])); else setApps([]); }, [user, lic?.locked, page.name]);

  // Licence expirée en cours de session : retour immédiat à l'écran de verrouillage
  useEffect(() => { if (lic?.locked && user) { api('auth:logout').catch(() => {}); setUser(null); setData(null); } }, [lic?.locked, user]);

  const login = (u) => { if (u.lang) setLang(u.lang); setUser(u); setPage({ name: u.role !== 'student' ? 'admin' : 'dashboard', tab: 'dash' }); };
  const logout = async () => { await api('auth:logout').catch(() => {}); setUser(null); setData(null); setPage({ name: 'dashboard' }); };
  const go = (p) => { setPage(p); if (p.name === 'dashboard') reload(); };
  const onLang = (code) => { if (user) api('auth:setLang', code).catch(() => {}); };

  if (!lic) return <div className="h-full grid place-items-center text-slate-300">{t('common.loading')}</div>;
  if (lic.locked) return <LockScreen lic={lic} onActivated={refreshLic} sys={sys} />;
  if (!user) return <Login onLogin={login} sys={sys} />;
  if (user.mustChange) return <ChangePassword onDone={setUser} />;

  const isAdmin = user.role !== 'student'; // personnel : superadmin, admin, formateur
  const isManager = user.role === 'admin' || user.role === 'superadmin';
  const tabs = ADMIN_TABS.filter(([id]) => id !== 'settings' || isManager);
  const banner = lic.state === 'trial' ? t('lic.trialBanner', { n: lic.daysLeft }) : (isManager && lic.daysLeft != null && lic.daysLeft <= 14 ? t('lic.banner', { n: lic.daysLeft }) : null);
  const inAdmin = page.name === 'admin';

  return (
    <div className="h-full flex flex-col relative">
      <BackgroundFX image={brand.appBg} calm />
      <header className="relative z-10 flex flex-wrap items-center gap-3 px-5 py-2.5 bg-slate-900/80 backdrop-blur border-b border-white/10 no-print">
        <button className="flex items-center gap-3" onClick={() => go({ name: isAdmin ? 'admin' : 'dashboard', tab: 'dash' })}>
          <span className="logo-badge !p-1"><img src={brand.logoSrc} alt="" className="h-9 w-auto max-w-[8rem] object-contain" /></span>
          <span className="text-lg font-semibold hidden md:inline">{brand.name}</span>
        </button>
        {isAdmin && (
          <nav className="flex flex-wrap gap-1.5 ml-2">
            <button className={page.name === 'dashboard' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => go({ name: 'dashboard' })}>📚 {t('admin.preview')}</button>
            {tabs.map(([id, key, icon]) => (
              <button key={id} className={inAdmin && page.tab === id ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => go({ name: 'admin', tab: id })}>{icon} {t(key)}</button>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden lg:inline text-slate-300">{user.fullName || user.username}</span>
          {apps.length > 0 && <button className={page.name === 'apps' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => go({ name: 'apps' })}>🧰 {t('apps.title')}</button>}
          <LangSwitch onChange={onLang} />
          <About />
          <button className="btn-ghost btn-sm" onClick={logout}>{t('app.logout')}</button>
          <PowerMenu sys={sys} />
        </div>
      </header>
      {banner && <div className="relative z-10 bg-amber-500/90 text-slate-900 text-sm font-medium text-center py-1 no-print">{banner}</div>}
      <main className="relative z-10 flex-1 min-h-0 overflow-auto">
        {page.name === 'dashboard' && <Dashboard data={data} go={go} user={user} />}
        {page.name === 'player' && <Player item={page.item} module={page.module} data={data} go={go} />}
        {page.name === 'apps' && <Apps go={go} />}
        {page.name === 'quiz' && <Quiz moduleId={page.moduleId} go={go} />}
        {inAdmin && (
          <div className="p-6 max-w-7xl mx-auto">
            {page.tab === 'dash' && <AdminDashboard />}
            {page.tab === 'people' && <AdminPeople user={user} />}
            {page.tab === 'content' && <AdminContent />}
            {page.tab === 'reports' && <AdminReports />}
            {page.tab === 'settings' && isManager && <AdminSettings lic={lic} onLicense={refreshLic} user={user} sys={sys} />}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
