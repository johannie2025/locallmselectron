import { useEffect, useState } from 'react';
import { Bar, Empty, useUi } from '../components/ui.jsx';
import Globe from '../components/Globe.jsx';
import { PrintOverlay, Certificate } from '../components/Printable.jsx';
import { useI18n } from '../i18n/index.jsx';
import { api, errText } from '../api.js';

const ICON = { video: '🎬', audio: '🎧', pdf: '📄', pptx: '📊' };
const HELLO = ['Bonjour', 'Hello', 'Hola', 'Olá', 'Hallo', 'Ciao', 'مرحبا', '你好'];
const GREET = { anglais: 'Hello', english: 'Hello', inglés: 'Hello', ingles: 'Hello', français: 'Bonjour', francais: 'Bonjour', french: 'Bonjour', francés: 'Bonjour', espagnol: 'Hola', spanish: 'Hola', español: 'Hola', espanol: 'Hola', portugais: 'Olá', portuguese: 'Olá', allemand: 'Hallo', german: 'Hallo', italien: 'Ciao', italian: 'Ciao', arabe: 'مرحبا', arabic: 'مرحبا', chinois: '你好', mandarin: '你好', japonais: 'こんにちは', russe: 'Привет' };
const GRADS = ['from-brand to-accent', 'from-emerald-600 to-teal-400', 'from-fuchsia-600 to-pink-500', 'from-amber-500 to-orange-600', 'from-cyan-600 to-blue-600'];

function cover(title) {
  const tl = title.toLowerCase();
  const key = Object.keys(GREET).find((k) => tl.includes(k));
  let h = 0; for (const ch of tl) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { word: key ? GREET[key] : 'Learn', grad: GRADS[h % GRADS.length] };
}

function Rotating() {
  const [i, setI] = useState(0);
  useEffect(() => { const x = setInterval(() => setI((v) => (v + 1) % HELLO.length), 2200); return () => clearInterval(x); }, []);
  return <span key={i} className="inline-block animate-fade-up">{HELLO[i]}</span>;
}

export default function Dashboard({ data, go, user }) {
  const { t, fmtDate } = useI18n();
  const { toast } = useUi();
  const [courseId, setCourseId] = useState(null);
  const [cert, setCert] = useState(null);
  if (!data) return <p className="p-8 text-slate-300">{t('common.loading')}</p>;

  if (data.error && !data.courses.length) {
    return <div className="p-8"><div className="card text-rose-300">{t('dash.rootMissing', { code: data.error })}</div></div>;
  }
  const course = data.courses.find((c) => c.id === courseId);

  const openCert = async (c) => {
    try { setCert(await api('cert:get', c.id)); } catch (e) { toast(errText(e, t), 'err'); }
  };

  if (!course) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl p-6 mb-8 bg-gradient-to-r from-brand/80 to-accent/50 animate-fade-up">
          <p className="text-sm text-white/80">{t('dash.welcome')}</p>
          <h2 className="text-3xl font-bold mt-1"><Rotating />, {user.fullName || user.username} !</h2>
          <p className="mt-2 text-white/80 text-sm">{t('dash.subtitle')}</p>
          <Globe size={170} className="absolute -right-4 -top-6 opacity-80 hidden md:block" />
        </div>
        {data.stale && <p className="mb-4 text-amber-300 text-sm">{t('dash.stale')}</p>}
        <h3 className="text-xl font-semibold mb-4">{t('dash.myCourses')}</h3>
        {!data.courses.length && <Empty>{user.role === 'admin' ? t('dash.noCoursesAdmin') : t('dash.noCourses')}</Empty>}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.courses.map((c, idx) => {
            const cv = cover(c.title);
            return (
              <button key={c.id} onClick={() => setCourseId(c.id)} className="card text-left hover:-translate-y-1 hover:shadow-2xl transition space-y-3 animate-fade-up !p-0 overflow-hidden" style={{ animationDelay: `${idx * 0.06}s` }}>
                <div className={`h-28 bg-gradient-to-br ${cv.grad} relative overflow-hidden`}>
                  <span className="absolute -bottom-3 -right-2 text-6xl font-black text-white/25 animate-float">{cv.word}</span>
                  {c.certificate && <span className="absolute top-2 left-2 rounded-full bg-amber-400 text-slate-900 text-xs font-bold px-2 py-0.5">🎓 {t('dash.certified')}</span>}
                </div>
                <div className="px-5 pb-5 space-y-2">
                  <div className="text-lg font-medium">{c.title}</div>
                  {c.description && <div className="text-sm text-slate-400 line-clamp-2">{c.description}</div>}
                  <Bar value={c.progress} />
                  <div className="text-xs text-slate-400">{c.progress}% · {t('dash.modulesDone', { a: c.completedModules, b: c.totalModules })}</div>
                </div>
              </button>
            );
          })}
        </div>
        {cert && <PrintOverlay canPrint={false} onClose={() => setCert(null)}><Certificate data={cert} /></PrintOverlay>}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button className="btn-ghost" onClick={() => setCourseId(null)}>← {t('dash.myCourses')}</button>
        {course.certificate && <button className="btn-primary" onClick={() => openCert(course)}>🎓 {t('dash.viewCertificate')} · {fmtDate(course.certificate.issuedAt)}</button>}
      </div>
      <h2 className="text-2xl font-semibold">{course.title}</h2>
      <Bar value={course.progress} />
      {course.modules.map((m, idx) => (
        <div key={m.id} className={`card space-y-3 animate-fade-up ${m.unlocked ? '' : 'opacity-60'}`} style={{ animationDelay: `${idx * 0.05}s` }}>
          <div className="flex items-center justify-between">
            <div className="font-medium">{m.unlocked ? (m.completed ? '✅' : '▶️') : '🔒'} {m.title}</div>
            <div className="text-xs text-slate-400">{t('dash.viewed', { n: m.viewedPercent })}</div>
          </div>
          {m.description && <p className="text-sm text-slate-400">{m.description}</p>}
          <Bar value={m.viewedPercent} />
          {m.unlocked && (
            <ul className="divide-y divide-slate-700">
              {m.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between py-2">
                  <span>{ICON[it.type]} {it.title}{!it.viewable && <em className="text-xs text-amber-300 ml-2">({t('dash.pptxHint')})</em>}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{it.completed ? t('dash.done') : `${it.percent}%`}</span>
                    {it.viewable && <button className="btn-ghost btn-sm" onClick={() => go({ name: 'player', item: it, module: m })}>{t('dash.open')}</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {m.unlocked && m.quiz.required && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-slate-300">
                {t('dash.testMin', { n: m.quiz.passingScore })} {m.quiz.bestScore != null && `— ${t('dash.bestScore', { n: m.quiz.bestScore })} ${m.quiz.passed ? '✅' : '❌'}`}
              </span>
              <button className="btn-primary" disabled={!m.viewed} onClick={() => go({ name: 'quiz', moduleId: m.id })}>{m.viewed ? t('dash.takeTest') : t('dash.finishFirst')}</button>
            </div>
          )}
          {!m.unlocked && <p className="text-sm text-slate-400">{t('dash.locked')}</p>}
        </div>
      ))}
      {cert && <PrintOverlay canPrint={false} onClose={() => setCert(null)}><Certificate data={cert} /></PrintOverlay>}
    </div>
  );
}
