import { useEffect, useState } from 'react';
import { api, errText } from '../api.js';

const TABS = ['Utilisateurs', 'Résultats', 'Quiz', 'Paramètres', 'Quitter'];

function Users() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ username: '', password: '', fullName: '', role: 'student' });
  const [msg, setMsg] = useState('');
  const load = () => api('admin:users:list').then(setRows);
  useEffect(() => { load(); }, []);
  const run = async (fn) => { try { await fn(); setMsg(''); load(); } catch (e) { setMsg(errText(e)); } };

  return (
    <div className="space-y-4">
      <div className="card grid md:grid-cols-5 gap-2">
        <input className="input" placeholder="Identifiant" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <input className="input" placeholder="Nom complet" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <input className="input" placeholder="Mot de passe initial" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="student">Étudiant</option><option value="admin">Formateur/Admin</option>
        </select>
        <button className="btn-primary" onClick={() => run(async () => { await api('admin:users:create', f); setF({ ...f, username: '', password: '', fullName: '' }); })}>Créer</button>
        {msg && <p className="text-rose-400 text-sm md:col-span-5">{msg}</p>}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400"><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Actif</th><th>Dernière connexion</th><th /></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-slate-700">
              <td className="py-2">{u.username}</td><td>{u.full_name}</td><td>{u.role}</td><td>{u.active ? 'oui' : 'non'}</td>
              <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
              <td className="text-right space-x-2">
                <button className="btn-ghost py-1" onClick={() => { const p = prompt('Nouveau mot de passe temporaire (≥ 6) :'); if (p) run(() => api('admin:users:resetPassword', u.id, p)); }}>Mot de passe</button>
                <button className="btn-ghost py-1" onClick={() => confirm('Effacer progression et résultats ?') && run(() => api('admin:users:resetProgress', u.id))}>Réinit. progression</button>
                <button className="btn-ghost py-1" onClick={() => run(() => api('admin:users:setActive', u.id, !u.active))}>{u.active ? 'Désactiver' : 'Activer'}</button>
                <button className="btn-danger py-1" onClick={() => confirm(`Supprimer ${u.username} ?`) && run(() => api('admin:users:delete', u.id))}>Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results() {
  const [rows, setRows] = useState([]);
  const [exp, setExp] = useState('');
  useEffect(() => { api('admin:results:list').then(setRows); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={async () => setExp((await api('admin:results:export')).file)}>Exporter en CSV</button>
        {exp && <span className="text-sm text-emerald-300">Exporté : {exp}</span>}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400"><tr><th>Date</th><th>Utilisateur</th><th>Cours</th><th>Module</th><th>Score</th><th>Durée</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-700">
              <td className="py-2">{new Date(r.created_at).toLocaleString()}</td><td>{r.full_name || r.username}</td><td>{r.course}</td><td>{r.module}</td>
              <td className={r.passed ? 'text-emerald-400' : 'text-rose-400'}>{r.score}%</td><td>{r.duration_sec}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuizEditor() {
  const [mods, setMods] = useState([]);
  const [id, setId] = useState('');
  const [text, setText] = useState('');
  const [errs, setErrs] = useState([]);
  const [ok, setOk] = useState(false);
  useEffect(() => { api('admin:modules:list').then(setMods); }, []);
  const open = async (v) => { setId(v); setOk(false); setErrs([]); if (v) setText((await api('admin:quiz:read', v)).text); };
  const save = async () => { const r = await api('admin:quiz:save', id, text); setErrs(r.errors); setOk(r.saved); };
  return (
    <div className="space-y-3">
      <select className="input" value={id} onChange={(e) => open(e.target.value)}>
        <option value="">— Choisir un module —</option>
        {mods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {id && (
        <>
          <textarea className="input font-mono text-sm h-96" value={text} onChange={(e) => { setText(e.target.value); setOk(false); }} spellCheck={false} />
          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={save}>Valider et enregistrer (quiz.json)</button>
            {ok && <span className="text-emerald-300">Enregistré ✅</span>}
          </div>
          {errs.length > 0 && <ul className="text-rose-400 text-sm list-disc ml-5">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </>
      )}
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api('admin:settings:get').then(setS); }, []);
  if (!s) return null;
  const save = async () => { setS(await api('admin:settings:set', s)); setSaved(true); };
  return (
    <div className="card space-y-4 max-w-xl">
      <label className="block">Dossier racine des cours
        <input className="input mt-1" value={s.courseRoot} onChange={(e) => { setS({ ...s, courseRoot: e.target.value }); setSaved(false); }} /></label>
      <label className="block">Note minimale par défaut (%)
        <input className="input mt-1" type="number" min="0" max="100" value={s.minScore} onChange={(e) => { setS({ ...s, minScore: Number(e.target.value) }); setSaved(false); }} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoQuiz} onChange={(e) => { setS({ ...s, autoQuiz: e.target.checked }); setSaved(false); }} /> Générer un test de révision automatique si aucun quiz.json</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={s.allowSkip} onChange={(e) => { setS({ ...s, allowSkip: e.target.checked }); setSaved(false); }} /> Autoriser l'avance rapide dans les vidéos</label>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Enregistrer</button>
        <button className="btn-ghost" onClick={() => api('courses:rescan')}>Re-scanner les cours</button>
        {saved && <span className="text-emerald-300">Enregistré ✅</span>}
      </div>
    </div>
  );
}

function Exit() {
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="card space-y-3 max-w-md">
      <p>Quitter l'application (arrêt du kiosque). Ressaisissez votre mot de passe administrateur.</p>
      <input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} />
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button className="btn-danger" onClick={() => api('admin:exit', p).catch((e) => setErr(errText(e)))}>Quitter l'application</button>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex gap-2">{TABS.map((t) => <button key={t} className={tab === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Utilisateurs' && <Users />}
      {tab === 'Résultats' && <Results />}
      {tab === 'Quiz' && <QuizEditor />}
      {tab === 'Paramètres' && <Settings />}
      {tab === 'Quitter' && <Exit />}
    </div>
  );
}
