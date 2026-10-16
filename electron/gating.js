'use strict';
/**
 * Règles de déblocage (Node pur, testable).
 * Module N+1 déverrouillé ⇔ module N « terminé » (tous les contenus requis vus à 100 %
 * ET test réussi si un test existe) ET prérequis du manifest.json terminés.
 */
const { autoQuiz } = require('./quizEngine');

function buildView(tree, ctx) {
  const { progress = new Map(), quizBest = new Map(), settings, isAdmin = false } = ctx;
  const courses = tree.courses.map((course) => {
    const done = new Set();
    const mods = [];
    let prevCompleted = true;
    for (const m of course.modules) {
      const req = m.items.filter((i) => i.required);
      const viewedCount = req.filter((i) => progress.get(i.id)?.completed).length;
      const viewedPercent = req.length
        ? Math.round(req.reduce((s, i) => s + Math.min(100, progress.get(i.id)?.percent || 0), 0) / req.length)
        : 100;
      const viewed = viewedCount === req.length;

      const fileQuiz = m.quiz && m.quiz.valid;
      const auto = !fileQuiz && settings.autoQuiz ? autoQuiz(course, m) : null;
      const quizRequired = !!fileQuiz || !!auto;
      const passingScore = (fileQuiz && m.quiz.passingScore) ?? m.minScore ?? course.minScore ?? settings.minScore;
      const best = quizBest.get(m.id) || { best: null, attempts: 0 };
      const quizPassed = !quizRequired || (best.best != null && best.best >= passingScore);
      const completed = viewed && quizPassed;

      const prereqOk = m.prerequisites.every((p) => {
        const target = course.modules.find((x) => x.id === `${course.id}/${p}` || x.title.toLowerCase() === p.toLowerCase());
        return !target || done.has(target.id);
      });
      const unlocked = isAdmin || (prevCompleted && prereqOk);
      if (completed) done.add(m.id);
      prevCompleted = completed;

      mods.push({
        id: m.id, title: m.title, description: m.description, order: m.order,
        items: m.items.map((i) => ({
          id: i.id, type: i.type, title: i.title, size: i.size, viewable: i.viewable, required: i.required, order: i.order,
          percent: Math.round(progress.get(i.id)?.percent || 0),
          positionSec: progress.get(i.id)?.position_sec || 0,
          completed: !!progress.get(i.id)?.completed,
        })),
        viewed, viewedPercent,
        quiz: { required: quizRequired, source: fileQuiz ? 'file' : auto ? 'auto' : null, passingScore, bestScore: best.best, attempts: best.attempts, passed: quizPassed },
        completed, unlocked,
      });
    }
    const completedCount = mods.filter((x) => x.completed).length;
    return {
      id: course.id, title: course.title, description: course.description,
      modules: mods, completedModules: completedCount, totalModules: mods.length,
      percent: mods.length ? Math.round((completedCount / mods.length) * 100) : 0,
    };
  });
  return { courses };
}

module.exports = { buildView };
