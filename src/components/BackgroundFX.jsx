import { useMemo } from 'react';

const WORDS = ['Hello', 'Bonjour', 'Hola', 'Olá', 'Hallo', 'Ciao', 'مرحبا', '你好', 'こんにちは', 'Привет', 'Welcome', 'Bienvenue', 'Bienvenido', 'Salut'];

/** Fond animé : dégradé aux couleurs du centre, bulles flottantes, mots de salutation qui montent, image personnalisable. */
export default function BackgroundFX({ image, calm = false }) {
  const items = useMemo(() => WORDS.map((w, i) => ({
    w, left: (i * 7.3 + 5) % 94, size: 15 + ((i * 5) % 18), dur: 24 + ((i * 3) % 16), delay: -((i * 4.7) % 30),
  })), []);
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-brand/30 to-slate-900 bg-[length:200%_200%] animate-gradient-shift" />
      {image && <img src={image} alt="" className={`absolute inset-0 h-full w-full object-cover animate-kenburns ${calm ? 'opacity-25' : 'opacity-45'}`} />}
      <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand/30 blur-3xl animate-float" />
      <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl animate-float-slow" />
      <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-brand/20 blur-3xl animate-float" />
      {items.map((it) => (
        <span key={it.w} className={`absolute bottom-0 font-semibold whitespace-nowrap animate-rise ${calm ? 'text-white/10' : 'text-white/20'}`}
          style={{ left: `${it.left}%`, fontSize: it.size, animationDuration: `${it.dur}s`, animationDelay: `${it.delay}s` }}>
          {it.w}
        </span>
      ))}
      <div className={`absolute inset-0 ${calm ? 'bg-slate-950/55' : 'bg-slate-950/25'}`} />
    </div>
  );
}
