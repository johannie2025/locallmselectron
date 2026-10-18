import { useEffect, useState } from 'react';
import { api, errText } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { Empty, Modal, useUi } from '../../components/ui.jsx';

function useRun(load) {
  const { t } = useI18n();
  const { toast } = useUi();
  return async (fn, okMsg) => {
    try { await fn(); if (okMsg) toast(okMsg); await load?.(); return true; } catch (e) { toast(errText(e, t), 'err'); return false; }
  };
}

/** Cours d'un étudiant : cases directes + cours hérités de sa classe (verrouillés) */
function EnrollUserModal({ user, onClose, onSaved }) {
  const { t } = useI18n();
  const run = useRun();
  const [courses, setCourses] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [viaClass, setViaClass] = useState([]);
  useEffect(() => {
    Promise.all([api('admin:courses:meta'), api('admin:enroll:getUser', user.id)]).then(([c, e]) => { setCourses(c); setSel(new Set(e.direct)); setViaClass(e.viaClass); });
  }, [user.id]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Modal title={`${t('ppl.coursesOf')} ${user.full_name || user.username}`} onClose={onClose}>
      {!courses.length && <Empty>{t('ppl.noCoursesFound')}</Empty>}
      <div className="space-y-2 mb-5">
        {courses.map((c) => {
          const inherited = viaClass.includes(c.id);
          return (
            <label key={c.id} className={`flex items-center gap-3 rounded-lg bg-slate-900/60 px-3 py-2 ${inherited ? 'opacity-70' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={inherited || sel.has(c.id)} disabled={inherited} onChange={() => toggle(c.id)} />
              <span className="flex-1">{c.title}</span>
              {inherited && <span className="text-xs rounded-full bg-brand/30 px-2 py-0.5">{t('ppl.viaClass')}</span>}
            </label>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={async () => { if (await run(() => api('admin:enroll:setUser', user.id, [...sel]), t('common.saved'))) { onSaved(); onClose(); } }}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}

function Users() {
  const { t, fmtDateTime } = useI18n();
  const { confirm, prompt } = useUi();
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ username: '', password: '', fullName: '', role: 'student', classId: '' });
  const [enroll, setEnroll] = useState(null);
  const load = () => Promise.all([api('admin:users:list'), api('admin:classes:list')]).then(([u, c]) => { setRows(u); setClasses(c); });
  useEffect(() => { load(); }, []);
  const run = useRun(load);
  const list = rows.filter((u) => `${u.full_name} ${u.username}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="card grid md:grid-cols-6 gap-2 items-end">
        <div><label className="label">{t('common.username')}</label><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
        <div><label className="label">{t('common.fullName')}</label><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
        <div><label className="label">{t('ppl.initialPassword')}</label><input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div><label className="label">{t('ppl.role')}</label>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="student">{t('ppl.student')}</option><option value="admin">{t('ppl.trainer')}</option></select></div>
        <div><label className="label">{t('common.class')}</label>
          <select className="input" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <button className="btn-primary" onClick={() => run(async () => { await api('admin:users:create', { ...f, classId: f.classId ? Number(f.classId) : null }); setF({ ...f, username: '', password: '', fullName: '' }); }, t('common.saved'))}>＋ {t('common.create')}</button>
      </div>
      <input className="input max-w-sm" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="w-full text-sm">
        <thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('ppl.role')}</th><th className="th">{t('common.class')}</th><th className="th">{t('ppl.courses')}</th><th className="th">{t('stats.lastLogin')}</th><th /></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className={`border-t border-white/10 ${u.active ? '' : 'opacity-50'}`}>
              <td className="py-2">{u.full_name || u.username} <span className="text-slate-400">({u.username})</span></td>
              <td>{u.role === 'admin' ? t('ppl.trainer') : t('ppl.student')}</td>
              <td>{u.role === 'student'
                ? <select className="input !py-1 !w-auto" value={u.class_id ?? ''} onChange={(e) => run(() => api('admin:users:update', u.id, { classId: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : '—'}</td>
              <td>{u.courses ?? '—'}</td>
              <td className="text-slate-400">{fmtDateTime(u.last_login_at)}</td>
              <td className="text-right space-x-1 whitespace-nowrap">
                {u.role === 'student' && <button className="btn-ghost btn-sm" onClick={() => setEnroll(u)}>📚 {t('ppl.courses')}</button>}
                <button className="btn-ghost btn-sm" onClick={async () => { const p = await prompt(t('ppl.newPassword'), { type: 'password' }); if (p) run(() => api('admin:users:resetPassword', u.id, p), t('common.saved')); }}>🔑</button>
                {u.role === 'student' && <button className="btn-ghost btn-sm" title={t('ppl.resetProgress')} onClick={async () => { if (await confirm(t('ppl.resetProgressQ'), { danger: true })) run(() => api('admin:users:resetProgress', u.id), t('common.saved')); }}>↺</button>}
                <button className="btn-ghost btn-sm" onClick={() => run(() => api('admin:users:setActive', u.id, !u.active))}>{u.active ? t('ppl.disable') : t('ppl.enable')}</button>
                <button className="btn-danger btn-sm" onClick={async () => { if (await confirm(t('ppl.deleteQ', { name: u.username }), { danger: true })) run(() => api('admin:users:delete', u.id)); }}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {enroll && <EnrollUserModal user={enroll} onClose={() => setEnroll(null)} onSaved={load} />}
    </div>
  );
}

function ClassModal({ cls, courses, onClose, onSaved }) {
  const { t } = useI18n();
  const run = useRun();
  const [name, setName] = useState(cls.name || '');
  const [sel, setSel] = useState(new Set(cls.courseIds || []));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Modal title={cls.id ? t('ppl.editClass') : t('ppl.newClass')} onClose={onClose}>
      <label className="label">{t('ppl.className')}</label>
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="label">{t('ppl.classCourses')}</div>
      <div className="space-y-2 mb-5 max-h-64 overflow-auto">
        {courses.map((c) => (
          <label key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-900/60 px-3 py-2 cursor-pointer"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /> {c.title}</label>
        ))}
        {!courses.length && <Empty>{t('ppl.noCoursesFound')}</Empty>}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={async () => { if (await run(() => api('admin:classes:save', { id: cls.id, name, courseIds: [...sel] }), t('common.saved'))) { onSaved(); onClose(); } }}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}

function Classes() {
  const { t } = useI18n();
  const { confirm } = useUi();
  const [rows, setRows] = useState([]);
  const [courses, setCourses] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => Promise.all([api('admin:classes:list'), api('admin:courses:meta')]).then(([c, m]) => { setRows(c); setCourses(m); });
  useEffect(() => { load(); }, []);
  const run = useRun(load);
  const title = (id) => courses.find((c) => c.id === id)?.title || id;
  return (
    <div className="space-y-4">
      <button className="btn-primary" onClick={() => setEdit({ name: '', courseIds: [] })}>＋ {t('ppl.newClass')}</button>
      {!rows.length && <Empty>{t('ppl.noClass')}</Empty>}
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((c) => (
          <div key={c.id} className="card space-y-2">
            <div className="flex items-center justify-between"><b className="text-lg">{c.name}</b><span className="text-sm text-slate-300">🧑‍🎓 {c.students}</span></div>
            <div className="flex flex-wrap gap-1.5">{c.courseIds.length ? c.courseIds.map((id) => <span key={id} className="rounded-full bg-brand/25 border border-brand/40 px-2.5 py-0.5 text-xs">{title(id)}</span>) : <span className="text-xs text-slate-400">{t('ppl.noClassCourses')}</span>}</div>
            <div className="flex gap-2 pt-1">
              <button className="btn-ghost btn-sm" onClick={() => setEdit(c)}>✏️ {t('common.edit')}</button>
              <button className="btn-danger btn-sm" onClick={async () => { if (await confirm(t('ppl.deleteClassQ', { name: c.name }), { danger: true })) run(() => api('admin:classes:delete', c.id)); }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
      {edit && <ClassModal cls={edit} courses={courses} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

/** Inscrire plusieurs étudiants à un cours en une fois */
function Enrollments() {
  const { t } = useI18n();
  const run = useRun();
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [course, setCourse] = useState('');
  const [cls, setCls] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [via, setVia] = useState(new Set());
  useEffect(() => {
    Promise.all([api('admin:courses:meta'), api('admin:users:list'), api('admin:classes:list')]).then(([c, u, k]) => { setCourses(c); setStudents(u.filter((x) => x.role === 'student' && x.active)); setClasses(k); });
  }, []);
  const pick = async (id) => {
    setCourse(id);
    if (!id) return;
    const e = await api('admin:enroll:getCourse', id);
    setSel(new Set(e.direct)); setVia(new Set(e.viaClass));
  };
  const visible = students.filter((s) => cls === 'all' || String(s.class_id ?? 0) === cls);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisible = visible.filter((s) => !via.has(s.id)).every((s) => sel.has(s.id)) && visible.length > 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select className="input !w-72" value={course} onChange={(e) => pick(e.target.value)}>
          <option value="">{t('ppl.chooseCourse')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select className="input !w-56" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">{t('stats.allClasses')}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {course && <button className="btn-ghost btn-sm" onClick={() => setSel((s) => { const n = new Set(s); visible.filter((x) => !via.has(x.id)).forEach((x) => (allVisible ? n.delete(x.id) : n.add(x.id))); return n; })}>{allVisible ? t('ppl.unselectAll') : t('ppl.selectAll')}</button>}
      </div>
      {course && (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
            {visible.map((s) => (
              <label key={s.id} className={`flex items-center gap-3 rounded-lg bg-slate-900/60 px-3 py-2 ${via.has(s.id) ? 'opacity-70' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={via.has(s.id) || sel.has(s.id)} disabled={via.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="flex-1 truncate">{s.full_name || s.username}</span>
                {via.has(s.id) ? <span className="text-xs rounded-full bg-brand/30 px-2 py-0.5">{t('ppl.viaClass')}</span> : <span className="text-xs text-slate-400">{s.class_name || ''}</span>}
              </label>
            ))}
          </div>
          {!visible.length && <Empty>{t('common.none')}</Empty>}
          <button className="btn-primary" onClick={() => run(() => api('admin:enroll:setCourse', course, [...sel]), t('common.saved'))}>💾 {t('common.save')} ({sel.size})</button>
        </>
      )}
    </div>
  );
}

export default function AdminPeople() {
  const { t } = useI18n();
  const [sub, setSub] = useState('users');
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold">{t('admin.people')}</h2>
      <div className="flex gap-2">
        {[['users', 'ppl.users'], ['classes', 'ppl.classes'], ['enroll', 'ppl.enroll']].map(([id, k]) => <button key={id} className={sub === id ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setSub(id)}>{t(k)}</button>)}
      </div>
      {sub === 'users' && <Users />}
      {sub === 'classes' && <Classes />}
      {sub === 'enroll' && <Enrollments />}
    </div>
  );
}
