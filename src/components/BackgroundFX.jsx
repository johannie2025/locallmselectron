import { useMemo } from 'react';

// Langues, mathématiques/physique, programmation/IT : le centre enseigne plus que des langues.
const GREET = ['Hello', 'Bonjour', 'Hola', 'Olá', 'Hallo', 'Ciao', 'مرحبا', '你好', 'こんにちは', 'Привет', 'Welcome', 'Bienvenue', 'Bienvenido', 'Salut'];
const MATH = [
  'E = mc²', 'a² + b² = c²', '∫ f(x) dx', 'F = m·a', 'e^{iπ} + 1 = 0', 'Σ n = n(n+1)/2', 'sin²θ + cos²θ = 1', 'x = (−b ± √Δ) / 2a',
  'lim x→0 sin x / x = 1', 'U = R·I', 'P = U·I', 'PV = nRT', '∇·E = ρ/ε₀', 'f′(x) = lim Δx→0 Δy/Δx', 'λ = h / p', 'π ≈ 3,14159', 'Δ = b² − 4ac', 'v = d / t',
];
const CODE = [
  'console.log("Hello");', 'for (i = 0; i < n; i++)', 'def main():', 'SELECT * FROM cours;', '<div class="lesson">', 'git commit -m "ok"', 'if (x > 0) {', 'print("Hola")',
  'int main(void)', '0110 1001 1010', 'ping 192.168.1.1', 'while True:', 'const sum = (a, b) => a + b;', '#include <stdio.h>', 'npm run build', 'import numpy as np',
  'chmod 755 script.sh', 'class Etudiant:', 'return a ** 2', '{ "quiz": 12 }', '</html>', 'ssh user@serveur',
];

// Classes écrites en entier pour que Tailwind les détecte. Opacité volontairement élevée : le texte doit se lire.
const KIND = {
  greet: { font: 'font-semibold', c: 'text-white/60', calm: 'text-white/32', size: [17, 31] },
  math: { font: 'font-serif italic', c: 'text-amber-200/70', calm: 'text-amber-200/40', size: [18, 30] },
  code: { font: 'font-mono', c: 'text-emerald-200/70', calm: 'text-emerald-200/40', size: [14, 19] },
};

/** Fond animé : dégradé aux couleurs du centre, halos flottants, mots / formules / code qui montent, image personnalisable. */
export default function BackgroundFX({ image, calm = false }) {
  const items = useMemo(() => {
    const all = [...GREET.map((w) => [w, 'greet']), ...MATH.map((w) => [w, 'math']), ...CODE.map((w) => [w, 'code'])];
    return all.map(([w, k], i) => {
      const [a, b] = KIND[k].size;
      return { w, k, left: (i * 37.7 + 3) % 90, size: a + ((i * 5) % (b - a + 1)), dur: 26 + ((i * 3) % 18), delay: -((i * 4.7) % 44) };
    });
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-brand/30 to-slate-900 bg-[length:200%_200%] animate-gradient-shift" />
      {image && <img src={image} alt="" className={`absolute inset-0 h-full w-full object-cover animate-kenburns ${calm ? 'opacity-25' : 'opacity-45'}`} />}
      {/* voile sombre SOUS le texte animé (avant, il l'éteignait) */}
      <div className={`absolute inset-0 ${calm ? 'bg-slate-950/40' : 'bg-slate-950/15'}`} />
      <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand/30 blur-3xl animate-float" />
      <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl animate-float-slow" />
      <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-float" />
      {items.map((it) => (
        <span key={it.w} className={`absolute bottom-0 whitespace-nowrap animate-rise [text-shadow:0_0_12px_rgba(0,0,0,.55)] ${KIND[it.k].font} ${calm ? KIND[it.k].calm : KIND[it.k].c}`}
          style={{ left: `${it.left}%`, fontSize: it.size, animationDuration: `${it.dur}s`, animationDelay: `${it.delay}s` }}>
          {it.w}
        </span>
      ))}
    </div>
  );
}
