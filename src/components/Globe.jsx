/** Globe animé (SVG pur) : méridiens qui tournent, parallèles, satellite en orbite. Couleurs = thème du centre. */
export default function Globe({ size = 300, className = '' }) {
  return (
    <svg viewBox="-10 0 220 200" width={size} height={size * 0.91} className={className} role="img" aria-label="globe">
      <defs>
        <radialGradient id="wls-globe" cx="35%" cy="30%">
          <stop offset="0%" stopColor="rgb(var(--accent))" />
          <stop offset="55%" stopColor="rgb(var(--brand))" />
          <stop offset="100%" stopColor="rgb(var(--brand-dark))" />
        </radialGradient>
        <clipPath id="wls-globe-clip"><circle cx="100" cy="100" r="78" /></clipPath>
      </defs>
      <circle cx="100" cy="100" r="78" fill="url(#wls-globe)" />
      <g clipPath="url(#wls-globe-clip)" fill="none" stroke="rgba(255,255,255,.38)" strokeWidth="1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <ellipse key={i} cx="100" cy="100" ry="78" rx="0">
            <animate attributeName="rx" values="0;78;0" dur="9s" begin={`${-i * 1.5}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
        {[-52, -26, 0, 26, 52].map((y) => (
          <ellipse key={y} cx="100" cy={100 + y} rx={Math.sqrt(78 * 78 - y * y)} ry="7" />
        ))}
      </g>
      <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,.55)" />
      <ellipse cx="100" cy="100" rx="102" ry="26" fill="none" stroke="rgba(255,255,255,.28)" strokeDasharray="4 5" transform="rotate(-22 100 100)" />
      <g transform="rotate(-22 100 100)">
        <circle r="5" fill="#fff">
          <animateMotion dur="8s" repeatCount="indefinite" path="M202,100 A102,26 0 1,1 -2,100 A102,26 0 1,1 202,100" />
        </circle>
      </g>
    </svg>
  );
}
