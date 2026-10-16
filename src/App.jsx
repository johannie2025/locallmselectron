import { useCallback, useEffect, useState } from 'react';
import { api, errText } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Player from './pages/Player.jsx';
import Quiz from './pages/Quiz.jsx';
import Admin from './pages/Admin.jsx';

function Login({ onLogin }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { onLogin(await api('auth:login', u, p)); } catch (x) { setErr(errText(x)); }
  };
  return (
    <div className="h-full grid place-items-center">
      <form onSubmit={submit} className="card w-96 space-y-4">
        <h1 className="text-2xl font-semibold">Centre de langues</h1>
        <input className="input" placeholder="Identifiant" value={u} onChange={(e) => setU(e.target.value)} autoFocus />
        <input className="input" type="password" placeholder="Mot de passe" value={p} onChange={(e) => setP(e.target.value)} />
        {err && <p className="text-rose-400 text-sm">{err}</p>}
        <button className="btn-primary w-full">Connexion</button>
      </form>
    </div>
  );
}

function ChangePassword({ onDone }) {
  const [o, setO] = useState('');
  const [n, setN] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { onDone(await api('auth:changePassword', o, n)); } catch (x) { setErr(errText(x)); }
  };
  return (
    <div className="h-full grid place-items-center">
      <form onSubmit={submit} className="card w-96 space-y-4">
        <h1 className="text-xl font-semibold">Choisissez un nouveau mot de passe</h1>
        <input className="input" type="password" placeholder="Mot de passe actuel" value={o} onChange={(e) => setO(e.target.value)} />
        <input className="input" type="password" placeholder="Nouveau mot de passe (≥ 6)" value={n} onChange={(e) => setN(e.target.value)} />
        {err && <p className="text-rose-400 text-sm">{err}</p>}
        <button className="btn-primary w-full">Valider</button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState({ name: 'dashboard' });

  const reload = useCallback(async () => { try { setData(await api('courses:list')); } catch { /* session perdue */ } }, []);
  useEffect(() => { if (user && !user.mustChange) reload(); }, [user, reload]);
  useEffect(() => window.lms.onCoursesChanged(reload), [reload]);

  const logout = async () => { await api('auth:logout'); setUser(null); setData(null); setPage({ name: 'dashboard' }); };
  const go = (p) => { setPage(p); if (p.name === 'dashboard') reload(); };

  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChange) return <ChangePassword onDone={setUser} />;

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <button className="text-lg font-semibold" onClick={() => go({ name: 'dashboard' })}>📚 LMS Langues</button>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.fullName || user.username}</span>
          {user.role === 'admin' && <button className="btn-ghost" onClick={() => go({ name: 'admin' })}>Administration</button>}
          <button className="btn-ghost" onClick={logout}>Déconnexion</button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        {page.name === 'dashboard' && <Dashboard data={data} go={go} />}
        {page.name === 'player' && <Player item={page.item} module={page.module} data={data} go={go} />}
        {page.name === 'quiz' && <Quiz moduleId={page.moduleId} go={go} />}
        {page.name === 'admin' && <Admin go={go} />}
      </main>
    </div>
  );
}
