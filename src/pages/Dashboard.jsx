import { useState } from 'react';

const ICON = { video: '🎬', pdf: '📄', pptx: '📊' };

function Bar({ value }) {
  return (
    <div className="h-2 rounded bg-slate-700 overflow-hidden">
      <div className="h-full bg-emerald-500" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function Dashboard({ data, go }) {
  const [courseId, setCourseId] = useState(null);
  if (!data) return <p className="p-8">Chargement…</p>;

  if (data.error && !data.courses.length) {
    return (
      <div className="p-8">
        <div className="card text-rose-300">Dossier des cours introuvable ({data.error}). Contactez le formateur.</div>
      </div>
    );
  }
  const course = data.courses.find((c) => c.id === courseId);

  if (!course) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        {data.stale && <p className="mb-4 text-amber-300 text-sm">Dossier des cours indisponible : affichage de la dernière version connue.</p>}
        <h2 className="text-2xl font-semibold mb-6">Mes cours</h2>
        {!data.courses.length && <p className="text-slate-400">Aucun cours trouvé dans le dossier racine.</p>}
        <div className="grid md:grid-cols-2 gap-4">
          {data.courses.map((c) => (
            <button key={c.id} onClick={() => setCourseId(c.id)} className="card text-left hover:bg-slate-700 space-y-3">
              <div className="text-lg font-medium">{c.title}</div>
              {c.description && <div className="text-sm text-slate-400">{c.description}</div>}
              <Bar value={c.percent} />
              <div className="text-xs text-slate-400">{c.completedModules}/{c.totalModules} modules terminés</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <button className="btn-ghost" onClick={() => setCourseId(null)}>← Mes cours</button>
      <h2 className="text-2xl font-semibold">{course.title}</h2>
      {course.modules.map((m) => (
        <div key={m.id} className={`card space-y-3 ${m.unlocked ? '' : 'opacity-60'}`}>
          <div className="flex items-center justify-between">
            <div className="font-medium">{m.unlocked ? (m.completed ? '✅' : '▶️') : '🔒'} {m.title}</div>
            <div className="text-xs text-slate-400">{m.viewedPercent}% vu</div>
          </div>
          {m.description && <p className="text-sm text-slate-400">{m.description}</p>}
          <Bar value={m.viewedPercent} />
          {m.unlocked && (
            <ul className="divide-y divide-slate-700">
              {m.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between py-2">
                  <span>{ICON[it.type]} {it.title}{!it.viewable && <em className="text-xs text-amber-300 ml-2">(PowerPoint : fournir un PDF équivalent)</em>}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{it.completed ? 'Terminé' : `${it.percent}%`}</span>
                    {it.viewable && <button className="btn-ghost py-1" onClick={() => go({ name: 'player', item: it, module: m })}>Ouvrir</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {m.unlocked && m.quiz.required && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-slate-300">
                Test : minimum {m.quiz.passingScore}% {m.quiz.bestScore != null && `— meilleur score ${m.quiz.bestScore}% ${m.quiz.passed ? '✅' : '❌'}`}
              </span>
              <button className="btn-primary" disabled={!m.viewed} onClick={() => go({ name: 'quiz', moduleId: m.id })}>
                {m.viewed ? 'Passer le test' : 'Terminez les contenus'}
              </button>
            </div>
          )}
          {!m.unlocked && <p className="text-sm text-slate-400">Terminez le module précédent (contenus à 100 % et test réussi) pour débloquer.</p>}
        </div>
      ))}
    </div>
  );
}
