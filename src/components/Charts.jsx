import { useI18n } from '../i18n/index.jsx';

/** Barres horizontales : [{label, value (0..100 ou absolu), sub}] */
export function HBars({ rows, max = 100, suffix = '%', empty }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm mb-1"><span className="truncate pr-2">{r.label}</span><span className="text-slate-300 whitespace-nowrap">{r.value}{suffix}{r.sub ? ` · ${r.sub}` : ''}</span></div>
          <div className="h-2.5 rounded bg-slate-700 overflow-hidden"><div className="h-full rounded bg-gradient-to-r from-brand to-accent transition-all duration-700" style={{ width: `${Math.min(100, (r.value / (max || 1)) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Colonnes (2 séries optionnelles) : [{label, a, b}] — a = total, b = dont réussi */
export function Columns({ data, aLabel, bLabel, height = 140 }) {
  const W = 560; const pad = 22; const max = Math.max(1, ...data.map((d) => d.a));
  const bw = (W - pad * 2) / data.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height + 26}`} className="w-full mx-auto" style={{ maxWidth: 680 }} role="img">
        {[0, 0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={height - f * (height - 10)} y2={height - f * (height - 10)} stroke="rgba(148,163,184,.2)" />)}
        {data.map((d, i) => {
          const x = pad + i * bw; const ha = (d.a / max) * (height - 10); const hb = (d.b / max) * (height - 10);
          return (
            <g key={d.label}>
              <title>{`${d.label}: ${d.a}${bLabel ? ` / ${d.b}` : ''}`}</title>
              <rect x={x + bw * 0.15} y={height - ha} width={bw * 0.7} height={ha} rx="3" fill="rgb(var(--brand))" opacity=".85" />
              {bLabel && <rect x={x + bw * 0.15} y={height - hb} width={bw * 0.7} height={hb} rx="3" fill="#10b981" />}
              <text x={x + bw / 2} y={height + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-slate-400 mt-1">
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-brand mr-1" />{aLabel}</span>
        {bLabel && <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-1" />{bLabel}</span>}
      </div>
    </div>
  );
}

/** Anneau de progression */
export function Donut({ value, label, size = 120 }) {
  const r = 46; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(var(--brand))" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .8s' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-2xl font-bold">{v}%</div><div className="text-[10px] text-slate-400 leading-tight">{label}</div></div></div>
    </div>
  );
}

export function Kpi({ label, value, icon }) {
  return (
    <div className="card !p-4 flex items-center gap-3">
      <div className="text-3xl">{icon}</div>
      <div><div className="text-2xl font-bold leading-none">{value}</div><div className="text-xs text-slate-400 mt-1">{label}</div></div>
    </div>
  );
}

export function useShortDay() {
  const { locale } = useI18n();
  return (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}
