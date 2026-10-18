import { useEffect, useState } from 'react';
import { api, errText } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { Bar, Empty, Modal, useUi } from '../../components/ui.jsx';
import { PrintOverlay, Transcript, Certificate } from '../../components/Printable.jsx';

/** Fiche d'un étudiant : progression, impression du relevé de notes et des certificats. */
export function StudentReportModal({ userId, onClose }) {
  const { t, fmtDate } = useI18n();
  const { toast } = useUi();
  const [tr, setTr] = useState(null);
  const [doc, setDoc] = useState(null);
  useEffect(() => { api('admin:report:transcript', userId).then(setTr).catch((e) => { toast(errText(e, t), 'err'); onClose(); }); }, [userId]);
  if (!tr) return null;

  const openCert = async (c) => {
    try { setDoc({ kind: 'cert', data: await api('admin:report:certificate', userId, c.id) }); } catch (e) { toast(errText(e, t), 'err'); }
  };
  if (doc?.kind === 'transcript') return <PrintOverlay fileName={`transcript_${tr.student.username}`} onClose={() => setDoc(null)}><Transcript data={tr} /></PrintOverlay>;
  if (doc?.kind === 'cert') return <PrintOverlay fileName={`certificate_${tr.student.username}`} onClose={() => setDoc(null)}><Certificate data={doc.data} /></PrintOverlay>;

  return (
    <Modal title={tr.student.fullName} onClose={onClose} wide>
      <div className="text-sm text-slate-300 mb-4">{tr.student.username} · {t('common.class')} : {tr.student.className || '—'}</div>
      {!tr.courses.length && <Empty>{t('rep.noCourses')}</Empty>}
      <div className="space-y-4">
        {tr.courses.map((c) => (
          <div key={c.id} className="rounded-lg bg-slate-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <b>{c.title}</b>
              {c.certificate
                ? <button className="btn-primary btn-sm" onClick={() => openCert(c)}>🎓 {t('rep.certificate')} · {fmtDate(c.certificate.issuedAt)}</button>
                : <span className="text-xs text-slate-400">{t('rep.noCertificate')}</span>}
            </div>
            <Bar value={c.progress} />
            <div className="text-xs text-slate-400">{c.progress}%</div>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-5"><button className="btn-primary" onClick={() => setDoc({ kind: 'transcript' })}>🖨️ {t('rep.transcript')}</button></div>
    </Modal>
  );
}

function Students() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => { api('admin:users:list').then((r) => setRows(r.filter((u) => u.role === 'student'))); }, []);
  const list = rows.filter((u) => `${u.full_name} ${u.username} ${u.class_name || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <input className="input max-w-sm" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length && <Empty>{t('common.none')}</Empty>}
      <table className="w-full text-sm">
        <thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('common.class')}</th><th /></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className="border-t border-white/10">
              <td className="py-2">{u.full_name || u.username} <span className="text-slate-400">({u.username})</span></td>
              <td>{u.class_name || '—'}</td>
              <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => setOpen(u.id)}>{t('rep.open')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <StudentReportModal userId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Results() {
  const { t, lang, fmtDateTime } = useI18n();
  const { toast } = useUi();
  const [rows, setRows] = useState([]);
  useEffect(() => { api('admin:results:list').then(setRows); }, []);
  return (
    <div className="space-y-4">
      <button className="btn-primary" onClick={async () => { try { const r = await api('admin:results:export', lang); toast(t('rep.exported', { file: r.file })); } catch (e) { toast(errText(e, t), 'err'); } }}>⬇ {t('rep.exportCsv')}</button>
      {!rows.length && <Empty>{t('common.none')}</Empty>}
      <table className="w-full text-sm">
        <thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('common.student')}</th><th className="th">{t('common.class')}</th><th className="th">{t('common.course')}</th><th className="th">{t('doc.module')}</th><th className="th">{t('common.score')}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-white/10">
              <td className="py-1.5">{fmtDateTime(r.created_at)}</td><td>{r.full_name || r.username}</td><td>{r.class_name || '—'}</td><td>{r.course}</td><td>{r.module}</td>
              <td className={r.passed ? 'text-emerald-400' : 'text-rose-400'}>{r.score}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminReports() {
  const { t } = useI18n();
  const [sub, setSub] = useState('students');
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold">{t('admin.reports')}</h2>
      <div className="flex gap-2">
        {[['students', 'rep.students'], ['results', 'rep.results']].map(([id, k]) => <button key={id} className={sub === id ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setSub(id)}>{t(k)}</button>)}
      </div>
      {sub === 'students' ? <Students /> : <Results />}
    </div>
  );
}
