import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { APP_NAME } from '../brand.js';
import wiseLogo from '../assets/wise-design-logo.jpg';

const Ctx = createContext(null);
const EMPTY = { centerName: '', slogan: '', primary: '', secondary: '', logo: null, loginBg: null, appBg: null };

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const darken = ([r, g, b], f = 0.78) => [Math.round(r * f), Math.round(g * f), Math.round(b * f)];

/**
 * Extrait deux couleurs dominantes d'un logo (data URL) : on ignore le blanc, le noir, le gris et la transparence,
 * on quantifie à 4 bits par canal puis on garde la teinte la plus fréquente et une 2e teinte suffisamment différente.
 */
export function extractPalette(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const S = 64; const c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data; const buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
          if (a < 200) continue;
          const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
          if (mx < 40 || mn > 225 || (mx - mn) < 40) continue; // noir, blanc, gris
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          cur.n++; cur.r += r; cur.g += g; cur.b += b; buckets.set(key, cur);
        }
        const list = [...buckets.values()].sort((x, y) => y.n - x.n).map((x) => [Math.round(x.r / x.n), Math.round(x.g / x.n), Math.round(x.b / x.n)]);
        if (!list.length) return resolve(null);
        const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        const first = list[0];
        const second = list.find((p) => dist(p, first) > 90) || darken(first, 0.7);
        const hex = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
        resolve({ primary: hex(first), secondary: hex(second) });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function BrandProvider({ children }) {
  const [b, setB] = useState(EMPTY);
  const reload = useCallback(() => api('branding:get').then((x) => setB({ ...EMPTY, ...x })).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);

  // Couleurs du centre → variables CSS (repli : bleu du logo Wise Design)
  useEffect(() => {
    const root = document.documentElement.style;
    const p = /^#[0-9a-f]{6}$/i.test(b.primary) ? hexToRgb(b.primary) : [37, 99, 235];
    const s = /^#[0-9a-f]{6}$/i.test(b.secondary) ? hexToRgb(b.secondary) : [14, 165, 233];
    root.setProperty('--brand', p.join(' '));
    root.setProperty('--brand-dark', darken(p).join(' '));
    root.setProperty('--accent', s.join(' '));
  }, [b.primary, b.secondary]);

  const value = useMemo(() => ({
    ...b,
    reload,
    name: b.centerName || APP_NAME,
    logoSrc: b.logo || wiseLogo,        // logo du centre, sinon logo Wise Design
    hasCustomName: !!b.centerName,
    wiseLogo,
  }), [b, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBrand = () => useContext(Ctx);
