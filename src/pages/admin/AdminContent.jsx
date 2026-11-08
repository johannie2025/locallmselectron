import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errText } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { Empty, Modal, useUi } from '../../components/ui.jsx';
import Quiz from '../Quiz.jsx';

const ICON = { video: '🎬', audio: '🎧', pdf: '📄', pptx: '📊' };
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };

/** Ordre des chapitres (modules) et des leçons (fichiers) : boutons ▲▼, enregistrement automatique en arrière-plan. */
function CourseOrder() {
  const { t } = useI18n();
  const { toast } = useUi();
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState('');
  const [mods, setMods] = useState([]);
  const [openIds, setOpenIds] = useState(new Set());
  const timer = useRef(null);
  const latest = useRef({ course: '', mods: [] });

  useEffect(() => { api('admin:courses:meta').then(setCourses); }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    const { course: c, mods: m } = latest.current;
    if (!c) return;
    try { await api('admin:order:save', c, m.map((x) => ({ id: x.id, items: x.items.map((i) => i.id) }))); toast(t('order.saved')); }
    catch (e) { toast(errText(e, t), 'err'); }
  }, [t, toast]);
  useEffect(() => () => { if (timer.current) flush(); }, [flush]);

  const pick = async (id) => {
    if (timer.current) await flush();
    setCourse(id); setOpenIds(new Set());
    if (!id) { setMods([]); return; }
    const m = await api('admin:order:get', id);
    setMods(m); latest.current = { course: id, mods: m };
  };
  const change = (next) => {
    setMods(next); latest.current = { course, mods: next };
    clearTimeout(timer.current); timer.current = setTimeout(flush, 700);
  };
  const toggleOpen = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <select className="input !w-80" value={course} onChange={(e) => pick(e.target.value)}>
        <option value="">{t('ppl.chooseCourse')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      {course && <p className="text-sm text-slate-400">{t('order.help')}</p>}
      {course && !mods.length && <Empty>{t('common.none')}</Empty>}
      {mods.map((m, i) => (
        <div key={m.id} className="card !p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand/30 w-7 h-7 grid place-items-center text-sm font-semibold">{i + 1}</span>
            <button className="flex-1 text-left font-medium" onClick={() => toggleOpen(m.id)}>{openIds.has(m.id) ? '▾' : '▸'} {m.title} <span className="text-xs text-slate-400">({m.items.length})</span></button>
            <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => change(move(mods, i, -1))} aria-label="up">▲</button>
            <button className="btn-ghost btn-sm" disabled={i === mods.length - 1} onClick={() => change(move(mods, i, 1))} aria-label="down">▼</button>
          </div>
          {openIds.has(m.id) && (
            <ul className="mt-3 ml-9 space-y-1.5">
              {m.items.map((it, k) => (
                <li key={it.id} className="flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-1.5 text-sm">
                  <span className="text-slate-400 w-5">{k + 1}</span><span className="flex-1">{ICON[it.type]} {it.title}</span>
                  <button className="btn-ghost btn-sm" disabled={k === 0} onClick={() => change(mods.map((x, xi) => (xi === i ? { ...x, items: move(x.items, k, -1) } : x)))}>▲</button>
                  <button className="btn-ghost btn-sm" disabled={k === m.items.length - 1} onClick={() => change(mods.map((x, xi) => (xi === i ? { ...x, items: move(x.items, k, 1) } : x)))}>▼</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
const uid = () => 'q' + Math.random().toString(36).slice(2, 8);
const blankQuestion = (type) => {
  if (type === 'mcq') return { id: uid(), type, text: '', options: ['', ''], answer: [], points: 1, explanation: '' };
  if (type === 'true_false') return { id: uid(), type, text: '', answer: true, points: 1, explanation: '' };
  if (type === 'translate') return { id: uid(), type, text: '', to: 'en', answers: [''], points: 1, explanation: '' };
  return { id: uid(), type: 'fill_blank', text: '', answers: [''], caseSensitive: false, points: 1, explanation: '' };
};

function QuestionCard({ q, index, count, onChange, onMove, onDelete }) {
  const { t } = useI18n();
  const set = (patch) => onChange({ ...q, ...patch });
  const setOpt = (i, v) => set({ options: q.options.map((o, k) => (k === i ? v : o)) });
  const toggleCorrect = (i) => set({ answer: q.answer.includes(i) ? q.answer.filter((a) => a !== i) : [...q.answer, i].sort() });
  const removeOpt = (i) => set({ options: q.options.filter((_, k) => k !== i), answer: q.answer.filter((a) => a !== i).map((a) => (a > i ? a - 1 : a)) });
  return (
    <div className="card !p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-brand/30 w-7 h-7 grid place-items-center text-sm font-semibold">{index + 1}</span>
        <span className="text-xs rounded-full border border-white/20 px-2 py-0.5">{t(`qtype.${q.type}`)}</span>
        <span className="flex-1" />
        <label className="text-xs text-slate-400 flex items-center gap-1">{t('qe.points')}
          <input className="input !w-16 !py-1" type="number" min="1" value={q.points} onChange={(e) => set({ points: Math.max(1, Number(e.target.value) || 1) })} /></label>
        <button className="btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(-1)}>▲</button>
        <button className="btn-ghost btn-sm" disabled={index === count - 1} onClick={() => onMove(1)}>▼</button>
        <button className="btn-danger btn-sm" onClick={onDelete}>🗑</button>
      </div>
      <textarea className="input" rows={2} placeholder={q.type === 'fill_blank' ? t('qe.textBlank') : t('qe.text')} value={q.text} onChange={(e) => set({ text: e.target.value })} />

      {q.type === 'mcq' && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400">{t('qe.mcqHelp')}</div>
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" className="w-5 h-5 accent-emerald-500" checked={q.answer.includes(i)} onChange={() => toggleCorrect(i)} title={t('qe.correct')} />
              <input className="input" placeholder={t('qe.option', { n: i + 1 })} value={o} onChange={(e) => setOpt(i, e.target.value)} />
              <button className="btn-ghost btn-sm" disabled={q.options.length <= 2} onClick={() => removeOpt(i)}>✕</button>
            </div>
          ))}
          {q.options.length < 8 && <button className="btn-ghost btn-sm" onClick={() => set({ options: [...q.options, ''] })}>＋ {t('qe.addOption')}</button>}
        </div>
      )}
      {q.type === 'true_false' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">{t('qe.correctIs')}</span>
          {[true, false].map((v) => <button key={String(v)} className={q.answer === v ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => set({ answer: v })}>{v ? t('quiz.true') : t('quiz.false')}</button>)}
        </div>
      )}
      {q.type === 'translate' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">{t('qe.translateTo')}</label>
            <select className="input !w-40" value={q.to || 'en'} onChange={(e) => set({ to: e.target.value })}>
              {['fr', 'en', 'es', 'pt', 'de', 'it', 'ar', 'zh'].map((c) => <option key={c} value={c}>{t(`lang.name.${c}`)}</option>)}
            </select>
          </div>
          <div className="text-xs text-slate-400">{t('qe.translateHelp')}</div>
          {q.answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input" placeholder={t('qe.acceptedAnswer')} value={a} onChange={(e) => set({ answers: q.answers.map((x, k) => (k === i ? e.target.value : x)) })} />
              <button className="btn-ghost btn-sm" disabled={q.answers.length <= 1} onClick={() => set({ answers: q.answers.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => set({ answers: [...q.answers, ''] })}>＋ {t('qe.addAnswer')}</button>
        </div>
      )}
      {q.type === 'fill_blank' && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400">{t('qe.blankHelp')}</div>
          {q.answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input" placeholder={t('qe.acceptedAnswer')} value={a} onChange={(e) => set({ answers: q.answers.map((x, k) => (k === i ? e.target.value : x)) })} />
              <button className="btn-ghost btn-sm" disabled={q.answers.length <= 1} onClick={() => set({ answers: q.answers.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <div className="flex items-center gap-4">
            <button className="btn-ghost btn-sm" onClick={() => set({ answers: [...q.answers, ''] })}>＋ {t('qe.addAnswer')}</button>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={!!q.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} /> {t('qe.caseSensitive')}</label>
          </div>
        </div>
      )}
      <input className="input" placeholder={t('qe.explanation')} value={q.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />
    </div>
  );
}

/** Éditeur de quiz en formulaire : le quiz.json est généré et enregistré automatiquement en arrière-plan. */
function QuizEditor() {
  const { t, fmtDateTime } = useI18n();
  const [tree, setTree] = useState([]);
  const [openMod, setOpenMod] = useState('');
  const [pv, setPv] = useState(false); // aperçu « comme l'étudiant »
  const [id, setId] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [status, setStatus] = useState({ kind: 'idle' });
  const timer = useRef(null);
  const latest = useRef({ id: '', quiz: null });
  const loadTree = useCallback(() => api('admin:quizzes:list').then(setTree).catch(() => {}), []);
  useEffect(() => { loadTree(); }, [loadTree]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    const { id: mid, quiz: q } = latest.current;
    if (!mid || !q) return;
    setStatus({ kind: 'saving' });
    try { const r = await api('admin:quiz:save', mid, q); setStatus(r.saved ? { kind: 'saved', at: Date.now() } : { kind: 'invalid' }); if (r.saved) loadTree(); }
    catch (e) { setStatus({ kind: 'error', msg: errText(e, t) }); }
  }, [t, loadTree]);
  useEffect(() => () => { if (timer.current) flush(); }, [flush]);

  const [multi, setMulti] = useState(false);
  const open0 = (mid) => open(mid);
  const open = async (mid) => {
    if (timer.current) await flush();
    setId(mid); setStatus({ kind: 'idle' }); setQuiz(null);
    if (!mid) return;
    const r = await api('admin:quiz:read', mid);
    setQuiz(r.quiz); setMulti(!!r.multilingual); latest.current = { id: mid, quiz: r.quiz };
    if (r.broken) setStatus({ kind: 'error', msg: r.broken });
  };
  const change = (next) => {
    setQuiz(next); latest.current = { id, quiz: next };
    clearTimeout(timer.current); timer.current = setTimeout(flush, 900);
    setStatus({ kind: 'pending' });
  };

  const badge = {
    idle: null,
    pending: <span className="text-slate-300">⏳ {t('qe.pending')}</span>,
    saving: <span className="text-slate-300">💾 {t('qe.saving')}</span>,
    saved: <span className="text-emerald-400">✔ {t('qe.saved')} {status.at && fmtDateTime(status.at)}</span>,
    invalid: <span className="text-amber-400">⚠ {t('qe.incomplete')}</span>,
    error: <span className="text-rose-400">✖ {status.msg}</span>,
  }[status.kind];

  const current = tree.flatMap((c) => c.modules.flatMap((m) => m.tests.map((x) => ({ ...x, course: c.title, module: m.title })))).find((x) => x.id === id);
  const startPreview = async () => { if (timer.current) await flush(); setPv(true); };
  return (
    <div className="grid lg:grid-cols-[21rem_1fr] gap-4 items-start">
      <aside className="card space-y-3 lg:sticky lg:top-2 lg:max-h-[calc(100vh-8rem)] overflow-auto">
        <div className="text-sm text-slate-300">{t('qe.pickHelp')}</div>
        {tree.map((c) => (
          <div key={c.id} className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-slate-400 pt-1">{c.title}</div>
            {c.modules.map((m) => {
              const open = openMod === m.id;
              const nb = m.tests.filter((x) => x.exists).length;
              return (
                <div key={m.id} className="rounded-lg border border-white/10">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5" onClick={() => setOpenMod(open ? '' : m.id)}>
                    <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                    <span className="flex-1 truncate font-medium">{m.title}</span>
                    <span className="text-xs rounded-full bg-white/10 px-2 py-0.5">{nb}/{m.tests.length}</span>
                  </button>
                  {open && (
                    <div className="border-t border-white/10 p-1 space-y-0.5">
                      {m.tests.map((x) => (
                        <button key={x.id} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${id === x.id ? 'bg-brand/30 ring-1 ring-brand' : 'hover:bg-white/5'}`} onClick={() => open0(x.id)}>
                          <span>{x.kind === 'module' ? '🏁' : x.type === 'pdf' || x.type === 'pptx' ? '📄' : x.type === 'audio' ? '🎧' : '🎬'}</span>
                          <span className="flex-1 truncate">{x.kind === 'module' ? t('qe.finalTest') : x.title}</span>
                          {!x.exists ? <span className="text-xs text-slate-500">{t('qe.create')}</span>
                            : <span className="text-xs text-slate-300">{x.multilingual ? '🌐 ' : ''}{x.questions}{!x.enabled ? ' ⛔' : ''}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {!tree.length && <Empty>{t('qe.noModules')}</Empty>}
      </aside>
      <div className="space-y-4 min-w-0">
      {!id && <Empty>{t('qe.chooseModule')}</Empty>}
      {current && <div className="text-sm text-slate-300">{current.course} › {current.module} › <b className="text-slate-100">{current.kind === 'module' ? t('qe.finalTest') : current.title}</b>{!current.enabled && <span className="ml-2 text-amber-300">⛔ {t('qe.disabled')}</span>}</div>}
      {quiz && multi && (
        <div className="card space-y-2">
          <div className="text-amber-300">🌐 {t('err.QUIZ_MULTILINGUAL')}</div>
          <pre className="text-xs overflow-auto max-h-96 bg-slate-950/70 rounded p-3">{JSON.stringify(quiz, null, 2)}</pre>
        </div>
      )}
      {quiz && !multi && (
        <>
          <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-slate-900/80 backdrop-blur flex items-center justify-between">
            <span className="flex items-center gap-3"><span className="font-medium">{t('qe.title')}</span><button className="btn-ghost btn-sm" disabled={!quiz.questions.length || status.kind === 'invalid'} title={t('qe.previewHint')} onClick={startPreview}>👁 {t('qe.preview')}</button></span><span className="text-sm">{badge}</span>
          </div>
          <div className="card grid md:grid-cols-4 gap-3">
            <div className="md:col-span-2"><label className="label">{t('qe.quizTitle')}</label><input className="input" value={quiz.title || ''} onChange={(e) => change({ ...quiz, title: e.target.value })} /></div>
            <div><label className="label">{t('qe.passing')}</label><input className="input" type="number" min="0" max="100" value={quiz.passingScore ?? ''} onChange={(e) => change({ ...quiz, passingScore: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })} /></div>
            <div><label className="label">{t('qe.timeLimit')}</label><input className="input" type="number" min="0" value={quiz.timeLimitSec ? Math.round(quiz.timeLimitSec / 60) : ''} onChange={(e) => change({ ...quiz, timeLimitSec: e.target.value ? Number(e.target.value) * 60 : null })} /></div>
            <label className="md:col-span-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!quiz.shuffleQuestions} onChange={(e) => change({ ...quiz, shuffleQuestions: e.target.checked })} /> {t('qe.shuffle')}</label>
          </div>
          {quiz.questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} count={quiz.questions.length}
              onChange={(nq) => change({ ...quiz, questions: quiz.questions.map((x) => (x.id === q.id ? nq : x)) })}
              onMove={(d) => change({ ...quiz, questions: move(quiz.questions, i, d) })}
              onDelete={() => change({ ...quiz, questions: quiz.questions.filter((x) => x.id !== q.id) })} />
          ))}
          {!quiz.questions.length && <Empty>{t('qe.noQuestions')}</Empty>}
          <div className="flex flex-wrap gap-2">
            {['mcq', 'true_false', 'fill_blank', 'translate'].map((tp) => <button key={tp} className="btn-primary btn-sm" onClick={() => change({ ...quiz, questions: [...quiz.questions, blankQuestion(tp)] })}>＋ {t(`qtype.${tp}`)}</button>)}
          </div>
        </>
      )}
      </div>
      {pv && <Modal title={`👁 ${t('qe.preview')}`} onClose={() => setPv(false)} wide><Quiz moduleId={id} go={() => setPv(false)} preview /></Modal>}
    </div>
  );
}

const fmt = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const parseTime = (v) => { const m = String(v).trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/); return m ? (Number(m[1] || 0) * 60 + Number(m[2].replace(',', '.'))) : NaN; };

/** Réglages des leçons : portion de vidéo visible par l'étudiant, tests (leçon / module) activés ou désactivés. */
function LessonSettings() {
  const { t } = useI18n();
  const { toast } = useUi();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null); // { moduleId, item }
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const vid = useRef(null);
  const load = () => api('admin:lessons:list').then(setList).catch((e) => toast(errText(e, t), 'err'));
  useEffect(() => { load(); }, []);
  const save = async (moduleId, itemId, patch) => { try { await api('admin:lessons:save', moduleId, itemId, patch); await load(); toast(t('common.saved')); } catch (e) { toast(errText(e, t), 'err'); } };
  const pick = (moduleId, item) => { setSel({ moduleId, item }); setFrom(item.clip ? fmt(item.clip.start) : ''); setTo(item.clip ? fmt(item.clip.end) : ''); };
  const cur = () => (vid.current ? vid.current.currentTime : 0);
  const saveClip = () => {
    const a = parseTime(from); const b = parseTime(to);
    if (!(a >= 0) || !(b > a)) { toast(t('err.BAD_CLIP'), 'err'); return; }
    save(sel.moduleId, sel.item.id, { clip: { start: a, end: b } }).then(() => setSel((s) => s && { ...s, item: { ...s.item, clip: { start: a, end: b } } }));
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300">{t('ls.help')}</p>
      {list.map((c) => (
        <div key={c.id} className="card space-y-3">
          <div className="font-semibold">{c.title}</div>
          {c.modules.map((m) => (
            <div key={m.id} className="rounded-lg border border-white/10 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <b className="flex-1">{m.title}</b>
                {m.quizExists && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={m.quizEnabled} onChange={(e) => save(m.id, null, { quizEnabled: e.target.checked })} /> {t('ls.finalTest')}</label>}
              </div>
              {m.items.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 text-sm border-t border-white/5 pt-2">
                  <span className="flex-1 min-w-48 truncate">{i.title}</span>
                  {(i.type === 'video' || i.type === 'audio') && (
                    <button className="btn-ghost btn-sm" onClick={() => pick(m.id, i)}>✂️ {i.clip ? `${fmt(i.clip.start)} → ${fmt(i.clip.end)}` : t('ls.wholeVideo')}</button>
                  )}
                  {i.quizExists && <label className="flex items-center gap-2"><input type="checkbox" checked={i.quizEnabled} onChange={(e) => save(m.id, i.id, { quizEnabled: e.target.checked })} /> {t('ls.lessonTest')}</label>}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      {sel && (
        <Modal title={`${t('ls.clipTitle')} — ${sel.item.title}`} onClose={() => setSel(null)} wide>
          <div className="space-y-3">
            {sel.item.type === 'video'
              ? <video ref={vid} src={'lms-media://f/' + sel.item.id.split('/').map(encodeURIComponent).join('/')} crossOrigin="anonymous" controls className="w-full max-h-[50vh] bg-black rounded" />
              : <audio ref={vid} src={'lms-media://f/' + sel.item.id.split('/').map(encodeURIComponent).join('/')} crossOrigin="anonymous" controls className="w-full" />}
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">{t('ls.start')}</label>
                <div className="flex gap-2"><input className="input font-mono" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="0:00" /><button className="btn-ghost btn-sm whitespace-nowrap" onClick={() => setFrom(fmt(cur()))}>{t('ls.useCurrent')}</button></div></div>
              <div><label className="label">{t('ls.end')}</label>
                <div className="flex gap-2"><input className="input font-mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="5:30" /><button className="btn-ghost btn-sm whitespace-nowrap" onClick={() => setTo(fmt(cur()))}>{t('ls.useCurrent')}</button></div></div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={saveClip}>{t('common.save')}</button>
              <button className="btn-ghost" onClick={() => save(sel.moduleId, sel.item.id, { clip: null }).then(() => setSel(null))}>{t('ls.wholeVideo')}</button>
            </div>
            <p className="text-xs text-slate-400">{t('ls.clipNote')}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function AdminContent() {
  const { t } = useI18n();
  const [sub, setSub] = useState('order');
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold">{t('admin.content')}</h2>
      <div className="flex gap-2">
        {[['order', 'content.order'], ['lessons', 'content.lessons'], ['quiz', 'content.quiz']].map(([i, k]) => <button key={i} className={sub === i ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setSub(i)}>{t(k)}</button>)}
      </div>
      {sub === 'order' ? <CourseOrder /> : sub === 'lessons' ? <LessonSettings /> : <QuizEditor />}
    </div>
  );
}
