// Logo "Voie Libre" — bifurcation en médaillon (variante G).
//
// Cercle extérieur ambré + cercle intérieur sombre, bifurcation simple :
// rail droit gris clair + branche déviée ambre, pivot ambre. Conçu pour
// rester lisible jusqu'à 16 px (favicon, header).

interface LogoProps {
  size?: number;
  title?: string;
}

export function Logo({ size = 32, title = 'Voie Libre' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>{title}</title>
      <circle cx={32} cy={32} r={28} fill="var(--vl-logo-fond)" stroke="var(--vl-logo-ambre)" strokeWidth={1.5} />
      <circle cx={32} cy={32} r={24} fill="none" stroke="var(--vl-logo-cercle)" strokeWidth={1} />
      <path d="M 12 40 L 52 40" stroke="var(--vl-logo-rail)" strokeWidth={2.6} strokeLinecap="round" />
      <path
        d="M 22 40 Q 30 40 36 32 L 48 22"
        stroke="var(--vl-logo-ambre)"
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={22} cy={40} r={2.6} fill="var(--vl-logo-ambre)" />
    </svg>
  );
}
