import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ROWS } from './strings.js';

export const LANGS = [
  { code: 'fr', label: 'Français', locale: 'fr-FR' },
  { code: 'en', label: 'English', locale: 'en-GB' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
];

// ROWS = [clé, français, anglais, espagnol] → un dictionnaire par langue
const DICTS = { fr: {}, en: {}, es: {} };
for (const [k, fr, en, es] of ROWS) { DICTS.fr[k] = fr; DICTS.en[k] = en; DICTS.es[k] = es; }

const Ctx = createContext(null);
const readLang = () => { try { const l = localStorage.getItem('wls.lang'); return DICTS[l] ? l : 'fr'; } catch { return 'fr'; } };

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readLang);
  const setLang = useCallback((l) => { if (!DICTS[l]) return; setLangState(l); try { localStorage.setItem('wls.lang', l); } catch { /* ignoré */ } }, []);
  const t = useCallback((key, vars) => {
    let s = DICTS[lang][key] ?? DICTS.fr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }, [lang]);
  const locale = LANGS.find((l) => l.code === lang).locale;
  const fmtDate = useCallback((ts, opts) => (ts ? new Date(ts).toLocaleDateString(locale, opts || { day: '2-digit', month: 'long', year: 'numeric' }) : '—'), [locale]);
  const fmtDateTime = useCallback((ts) => (ts ? new Date(ts).toLocaleString(locale) : '—'), [locale]);
  const value = useMemo(() => ({ lang, setLang, t, locale, fmtDate, fmtDateTime }), [lang, setLang, t, locale, fmtDate, fmtDateTime]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Sélecteur de langue (FR / EN / ES) */
export function LangSwitch({ onChange, className = '' }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`inline-flex rounded-lg overflow-hidden border border-white/10 ${className}`} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} title={l.label} onClick={() => { setLang(l.code); onChange?.(l.code); }}
          className={`px-2.5 py-1 text-xs font-semibold uppercase ${lang === l.code ? 'bg-brand text-white' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'}`}>
          {l.code}
        </button>
      ))}
    </div>
  );
}
