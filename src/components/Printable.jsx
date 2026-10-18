import { createPortal } from 'react-dom';
import { useBrand } from '../brand/BrandProvider.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useUi } from './ui.jsx';
import { api, errText } from '../api.js';
import { APP_NAME, COMPANY } from '../brand.js';

/** Aperçu plein écran + impression / export PDF (le contenu est rendu dans #print-root, seul imprimé). */
export function PrintOverlay({ onClose, fileName, children, canPrint = true }) {
  const { t } = useI18n();
  const { toast } = useUi();
  const run = async (fn) => { try { return await fn(); } catch (e) { toast(errText(e, t), 'err'); return null; } };
  const root = document.getElementById('print-root') || (() => { const d = document.createElement('div'); d.id = 'print-root'; document.body.appendChild(d); return d; })();
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-auto bg-slate-900/95 p-4 print:p-0" style={{ background: 'rgba(15,23,42,.96)' }}>
      <div className="no-print max-w-[1100px] mx-auto mb-4 flex items-center gap-2">
        {canPrint && <button className="btn-primary" onClick={() => run(() => api('print:page'))}>🖨️ {t('print.print')}</button>}
        {canPrint && <button className="btn-ghost" onClick={async () => { const r = await run(() => api('print:pdf', fileName)); if (r) toast(t('print.saved', { file: r.file })); }}>📄 {t('print.pdf')}</button>}
        <button className="btn-ghost ml-auto" onClick={onClose}>✕ {t('common.close')}</button>
      </div>
      {children}
    </div>,
    root
  );
}

function SheetHeader({ title }) {
  const { logoSrc, name, slogan } = useBrand();
  return (
    <div className="flex items-center justify-between border-b-2 pb-3 mb-5" style={{ borderColor: 'rgb(var(--brand))' }}>
      <div className="flex items-center gap-3">
        <img src={logoSrc} alt="" className="h-14 w-auto" />
        <div><div className="text-xl font-bold" style={{ color: 'rgb(var(--brand))' }}>{name}</div>{slogan && <div className="text-xs text-slate-500">{slogan}</div>}</div>
      </div>
      <div className="text-right text-lg font-semibold text-slate-700">{title}</div>
    </div>
  );
}
const SheetFooter = () => (
  <div className="mt-8 pt-2 border-t text-[10px] text-slate-400 text-center">{APP_NAME} · © {new Date().getFullYear()} {COMPANY}</div>
);

/** Relevé de notes d'un étudiant (A4 portrait) */
export function Transcript({ data }) {
  const { t, fmtDate, fmtDateTime } = useI18n();
  const s = data.student;
  const all = data.courses.flatMap((c) => c.modules.filter((m) => m.bestScore != null).map((m) => m.bestScore));
  const avg = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null;
  return (
    <div className="sheet bg-white text-slate-900 mx-auto max-w-[800px] p-10 shadow-2xl" style={{ minHeight: '1050px' }}>
      <SheetHeader title={t('doc.transcript')} />
      <div className="grid grid-cols-2 gap-2 text-sm mb-6">
        <div><span className="text-slate-500">{t('doc.student')} : </span><b>{s.fullName}</b></div>
        <div><span className="text-slate-500">{t('common.username')} : </span>{s.username}</div>
        <div><span className="text-slate-500">{t('common.class')} : </span>{s.className || '—'}</div>
        <div><span className="text-slate-500">{t('doc.issuedOn')} : </span>{fmtDateTime(data.generatedAt)}</div>
      </div>
      {data.courses.length === 0 && <p className="text-slate-500">{t('doc.noCourses')}</p>}
      {data.courses.map((c) => (
        <div key={c.id} className="mb-6" style={{ breakInside: 'avoid' }}>
          <div className="flex justify-between items-baseline bg-slate-100 px-3 py-1.5 rounded">
            <b>{c.title}</b>
            <span className="text-sm">{t('doc.progress')} : {c.progress}% {c.completed ? `· ✔ ${t('doc.completed')}` : ''}</span>
          </div>
          <table className="w-full text-sm mt-1">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">{t('doc.module')}</th><th>{t('doc.viewed')}</th><th>{t('doc.best')}</th><th>{t('doc.threshold')}</th><th>{t('doc.attempts')}</th><th>{t('doc.status')}</th></tr></thead>
            <tbody>
              {c.modules.map((m) => (
                <tr key={m.title} className="border-b border-slate-100">
                  <td className="py-1">{m.title}</td><td>{m.viewedPercent}%</td>
                  <td>{m.quizRequired ? (m.bestScore != null ? `${m.bestScore}%` : '—') : t('doc.noTest')}</td>
                  <td>{m.quizRequired ? `${m.passingScore}%` : '—'}</td><td>{m.attempts || 0}</td>
                  <td>{m.completed ? '✔' : '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.certificate && <div className="text-xs text-slate-600 mt-1">🎓 {t('doc.certificate')} n° {c.certificate.number} — {fmtDate(c.certificate.issuedAt)}</div>}
        </div>
      ))}
      {avg != null && <div className="text-right font-semibold mt-4">{t('doc.average')} : {avg}%</div>}
      <div className="flex justify-between mt-16 text-sm"><div className="border-t border-slate-400 pt-1 w-56 text-center">{t('doc.trainerSign')}</div><div className="border-t border-slate-400 pt-1 w-56 text-center">{t('doc.directionSign')}</div></div>
      <SheetFooter />
    </div>
  );
}

/** Certificat de réussite (A4 paysage) */
export function Certificate({ data }) {
  const { t, fmtDate } = useI18n();
  const { logoSrc, name, slogan } = useBrand();
  return (
    <div className="sheet sheet-cert bg-white text-slate-900 mx-auto max-w-[1050px] shadow-2xl p-6" style={{ minHeight: '700px' }}>
      <div className="h-full p-10 text-center flex flex-col items-center" style={{ border: '8px double rgb(var(--brand))', minHeight: '650px' }}>
        <img src={logoSrc} alt="" className="h-20 w-auto mb-2" />
        <div className="text-lg font-semibold" style={{ color: 'rgb(var(--brand))' }}>{name}</div>
        {slogan && <div className="text-xs text-slate-500">{slogan}</div>}
        <h1 className="font-serif text-5xl mt-8 tracking-wide" style={{ color: 'rgb(var(--brand))' }}>{t('doc.certTitle')}</h1>
        <p className="mt-8 text-lg text-slate-600">{t('doc.certIntro')}</p>
        <div className="font-serif text-4xl mt-3 border-b-2 px-10 pb-1" style={{ borderColor: 'rgb(var(--accent))' }}>{data.student.fullName}</div>
        <p className="mt-6 text-lg text-slate-600">{t('doc.certBody')}</p>
        <div className="text-3xl font-semibold mt-2">{data.course.title}</div>
        {data.avgScore != null && <p className="mt-3 text-slate-600">{t('doc.average')} : <b>{data.avgScore}%</b></p>}
        <div className="flex justify-between w-full mt-auto pt-12 text-sm">
          <div className="border-t border-slate-400 pt-1 w-56">{t('doc.trainerSign')}</div>
          <div className="text-slate-500 text-xs">n° {data.number}<br />{fmtDate(data.issuedAt)}</div>
          <div className="border-t border-slate-400 pt-1 w-56">{t('doc.directionSign')}</div>
        </div>
        <div className="text-[10px] text-slate-400 mt-4">{APP_NAME} · © {new Date().getFullYear()} {COMPANY}</div>
      </div>
    </div>
  );
}
