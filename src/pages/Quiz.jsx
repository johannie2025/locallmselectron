import { useEffect, useRef, useState } from 'react';
import { api, errText } from '../api.js';
import { useI18n } from '../i18n/index.jsx';

export default function Quiz({ moduleId, go }) {
  const { t, lang } = useI18n();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(null);
  const start = useRef(Date.now());
  const sent = useRef(false);

  const load = async () => {
    setResult(null); setAnswers({}); setErr(''); sent.current = false;
    try {
      const q = await api('quiz:get', moduleId, lang);
      setQuiz(q); start.current = Date.now(); setLeft(q.timeLimitSec);
    } catch (e) { setErr(errText(e, t)); }
  };
  useEffect(() => { load(); }, [moduleId]);

  const submit = async () => {
    if (sent.current) return;
    sent.current = true;
    try { setResult(await api('quiz:submit', moduleId, answers, (Date.now() - start.current) / 1000, lang)); }
    catch (e) { sent.current = false; setErr(errText(e, t)); }
  };

  // Chronomètre : envoi automatique à 0
  useEffect(() => {
    if (left == null || result) return;
    if (left <= 0) { submit(); return; }
    const x = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(x);
  }, [left, result]);

  if (err) return <div className="p-8"><p className="text-rose-400 mb-4">{err}</p><button className="btn-ghost" onClick={() => go({ name: 'dashboard' })}>{t('app.back')}</button></div>;
  if (!quiz) return <p className="p-8 text-slate-300">{t('common.loading')}</p>;

  if (result) {
    const byId = Object.fromEntries(result.details.map((d) => [d.id, d]));
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <div className={`card text-center animate-pop ${result.passed ? 'text-emerald-300' : 'text-rose-300'}`}>
          <div className="text-5xl font-bold">{result.score}%</div>
          <div className="mt-1">{result.passed ? t('quiz.passed') : t('quiz.failed', { n: result.passingScore })}</div>
          {result.certificate && <div className="mt-3 rounded-lg bg-amber-400 text-slate-900 font-semibold py-2">{t('quiz.certificate')}</div>}
        </div>
        {quiz.questions.map((q, i) => (
          <div key={q.id} className="card">
            <div>{i + 1}. {q.text} {byId[q.id]?.correct ? '✅' : '❌'}</div>
            {byId[q.id]?.explanation && <p className="text-sm text-slate-400 mt-1">{byId[q.id].explanation}</p>}
          </div>
        ))}
        <div className="flex gap-3">
          {!result.passed && <button className="btn-primary" onClick={load}>{t('quiz.retry')}</button>}
          <button className="btn-ghost" onClick={() => go({ name: 'dashboard' })}>{t('quiz.back')}</button>
        </div>
      </div>
    );
  }

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{quiz.title || t('qe.title')}</h2>
        {left != null && <span className={`font-mono text-lg ${left < 30 ? 'text-rose-400' : ''}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
      </div>
      <p className="text-sm text-slate-300">{t('quiz.passMin', { n: quiz.passingScore })}{quiz.source === 'auto' && ` · ${t('quiz.auto')}`}</p>
      {quiz.questions.map((q, i) => (
        <div key={q.id} className="card space-y-3">
          <div className="font-medium">{i + 1}. {q.text}</div>
          {q.type === 'mcq' && (
            <>
              {q.multiple && <div className="text-xs text-slate-400">{t('quiz.multiple')}</div>}
              {q.options.map((o, k) => {
                const cur = answers[q.id] || [];
                const checked = cur.includes(k);
                return (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type={q.multiple ? 'checkbox' : 'radio'} name={q.id} checked={checked}
                      onChange={() => set(q.id, q.multiple ? (checked ? cur.filter((x) => x !== k) : [...cur, k]) : [k])} />
                    {o}
                  </label>
                );
              })}
            </>
          )}
          {q.type === 'true_false' && (
            <div className="flex gap-3">
              {[true, false].map((v) => (
                <button key={String(v)} className={answers[q.id] === v ? 'btn-primary' : 'btn-ghost'} onClick={() => set(q.id, v)}>{v ? t('quiz.true') : t('quiz.false')}</button>
              ))}
            </div>
          )}
          {q.type === 'fill_blank' && <input className="input" value={answers[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} placeholder={t('quiz.yourAnswer')} />}
        </div>
      ))}
      <button className="btn-primary" onClick={submit}>{t('quiz.submit')}</button>
    </div>
  );
}
