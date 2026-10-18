import { useEffect, useState } from 'react';
import { api, errText } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { Bar, Empty, useUi } from '../../components/ui.jsx';
import { Columns, Donut, HBars, Kpi, useShortDay } from '../../components/Charts.jsx';
import { StudentReportModal } from './AdminReports.jsx';

export default function AdminDashboard() {
  const { t, fmtDateTime } = useI18n();
  const { toast } = useUi();
  const shortDay = useShortDay();
  const [s, setS] = useState(null);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [open, setOpen] = useState(null);

  useEffect(() => { api('admin:stats:overview').then(setS).catch((e) => toast(errText(e, t), 'err')); }, []);
  if (!s) return <p className="text-slate-300">{t('common.loading')}</p>;

  const T = s.totals;
  const classOpts = s.byClass.map((c) => ({ id: String(c.id), name: c.name || t('stats.noClass') }));
  const list = s.students.filter((x) =>
    (cls === 'all' || String(x.classId ?? 0) === cls) &&
    `${x.fullName} ${x.username}`.toLowerCase().includes(q.toLowerCase()));
  const dist = ['<50', '50-59', '60-69', '70-79', '80-89', '90+'].map((label, i) => ({ label, a: s.scoreDist[i], b: 0 }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">{t('admin.dash')}</h2>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon="🧑‍🎓" label={t('stats.students')} value={T.students} />
        <Kpi icon="🏫" label={t('stats.classes')} value={T.classes} />
        <Kpi icon="📚" label={t('stats.courses')} value={T.courses} />
        <Kpi icon="📝" label={t('stats.enrollments')} value={T.enrollments} />
        <Kpi icon="🟢" label={t('stats.active7')} value={T.active7} />
        <Kpi icon="🎓" label={t('stats.certificates')} value={T.certificates} />
        <Kpi icon="🧪" label={t('stats.attempts')} value={T.attempts} />
        <Kpi icon="⭐" label={t('stats.avgScore')} value={T.avgScore != null ? `${T.avgScore}%` : '—'} />
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="card flex flex-col items-center justify-center gap-2">
          <h3 className="font-semibold self-start">{t('stats.completion')}</h3>
          <Donut value={T.completionRate} label={t('stats.completed')} size={150} />
        </div>
        <div className="card xl:col-span-2">
          <h3 className="font-semibold mb-3">{t('stats.byCourse')}</h3>
          <HBars rows={s.byCourse.map((c) => ({ label: c.title, value: c.avgProgress, sub: t('stats.enrolledN', { n: c.enrolled }) }))} empty={t('common.none')} />
        </div>
        <div className="card">
          <h3 className="font-semibold mb-3">{t('stats.byClass')}</h3>
          <HBars rows={s.byClass.map((c) => ({ label: c.name || t('stats.noClass'), value: c.avgProgress, sub: t('stats.studentsN', { n: c.students }) }))} empty={t('common.none')} />
        </div>
        <div className="card xl:col-span-2">
          <h3 className="font-semibold mb-3">{t('stats.activity')}</h3>
          <Columns data={s.activity.map((d) => ({ label: shortDay(d.day), a: d.attempts, b: d.passed }))} aLabel={t('stats.attemptsLabel')} bLabel={t('stats.passedLabel')} />
        </div>
        <div className="card xl:col-span-3">
          <h3 className="font-semibold mb-3">{t('stats.scoreDist')}</h3>
          <Columns data={dist} aLabel={t('stats.attemptsLabel')} height={110} />
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-semibold mr-auto">{t('stats.studentTable')}</h3>
          <select className="input !w-auto" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">{t('stats.allClasses')}</option>
            {classOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input !w-56" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!list.length && <Empty>{t('common.none')}</Empty>}
        <table className="w-full text-sm">
          <thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('common.class')}</th><th className="th w-56">{t('stats.progress')}</th><th className="th">🎓</th><th className="th">{t('stats.lastLogin')}</th><th /></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="border-t border-white/10">
                <td className="py-2">{x.fullName}</td><td>{x.className || '—'}</td>
                <td><div className="flex items-center gap-2"><Bar value={x.avg} className="flex-1" /><span className="text-xs w-9 text-right">{x.avg}%</span></div></td>
                <td>{x.certificates}</td><td className="text-slate-400">{fmtDateTime(x.lastLogin)}</td>
                <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => setOpen(x.id)}>{t('rep.open')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <StudentReportModal userId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
