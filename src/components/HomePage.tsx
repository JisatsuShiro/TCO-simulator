// Page d'accueil : présente les fonctionnalités sous forme de cards.
// La sim ne démarre que sur clic d'une card active. Logo en header
// reste cliquable pour revenir ici.

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { colors, radii, shadows, spacing, typography } from '../design/tokens';

interface HomePageProps {
  /** Appelé quand l'utilisateur choisit la simulation libre. */
  onEnterSimulation: () => void;
  /** Appelé quand l'utilisateur ouvre la liste des scénarios pédagogiques. */
  onEnterScenarios: () => void;
  /** Appelé quand l'utilisateur ouvre la page de cantonnement (code de session). */
  onEnterCantonnement: () => void;
  /** Appelé quand l'utilisateur ouvre le poste PRS de Springfield. */
  onEnterPrs: () => void;
}

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  available: boolean;
  onClick?: () => void;
}

/**
 * Le cantonnement est retiré de l'accueil le temps qu'il soit prêt.
 *
 * La carte n'est pas grisée mais **absente** : « À venir » annonce une
 * fonctionnalité, et celle-ci ne doit rien annoncer pour le moment. Le reste —
 * la prop `onEnterCantonnement`, la vue `'cantonnement'` et `CantonnementPage`
 * — reste branché : remettre ce drapeau à `true` la rétablit.
 */
const AFFICHER_CANTONNEMENT: boolean = false;

export function HomePage({
  onEnterSimulation,
  onEnterScenarios,
  onEnterCantonnement,
  onEnterPrs,
}: HomePageProps) {
  const features: Feature[] = [
    {
      id: 'simulation',
      title: 'Simulation libre',
      description:
        'Pilotez une gare. Manipulez les leviers, gérez les annulateurs, observez les enclenchements en temps réel.',
      icon: <LeverIcon />,
      available: true,
      onClick: onEnterSimulation,
    },
    {
      id: 'prs',
      title: 'PRS de Springfield',
      description:
        "Le TCO du poste tout relais à transit souple : itinéraires, enclenchements d'approche, annulateurs de transit et dérangements.",
      icon: <PrsIcon />,
      available: true,
      onClick: onEnterPrs,
    },
    {
      id: 'scenarios',
      title: 'Scénarios pédagogiques',
      description:
        'Lancez un scénario : gare cible, trains pré-positionnés et avaries prédéfinies pour un exercice ciblé.',
      icon: <BookIcon />,
      available: true,
      onClick: onEnterScenarios,
    },
    {
      id: 'cantonnement',
      title: 'Cantonnement',
      description:
        'Gérez le cantonnement à deux : obtenez un code de session à partager avec l’opérateur de la gare voisine pour appairer vos postes.',
      icon: <LinkIcon />,
      available: true,
      onClick: onEnterCantonnement,
    },
    {
      id: 'docs',
      title: 'Documentation',
      description:
        "Comprendre les concepts du PRS : enclenchements, annulateurs de transit, EPA, dispositifs d'attention.",
      icon: <InfoIcon />,
      available: false,
    },
  ].filter((f) => f.id !== 'cantonnement' || AFFICHER_CANTONNEMENT);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: `${spacing.xxl}px ${spacing.lg}px`,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xl,
        }}
      >
        <header style={{ textAlign: 'center' }}>
          <h2
            style={{
              margin: 0,
              fontSize: typography.size.xl,
              fontWeight: typography.weight.semibold,
              color: colors.text.primary,
              letterSpacing: 0.3,
            }}
          >
            Bienvenue dans Voie Libre
          </h2>
          <p
            style={{
              margin: `${spacing.xs}px 0 0`,
              fontSize: typography.size.base,
              color: colors.text.secondary,
              lineHeight: `${typography.lineHeight.base}px`,
            }}
          >
            Choisissez une fonctionnalité pour commencer.
          </p>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: spacing.md,
          }}
        >
          {features.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const [hover, setHover] = useState(false);
  const interactive = feature.available && feature.onClick != null;

  const handleClick = () => {
    if (interactive) feature.onClick!();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      feature.onClick!();
    }
  };

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.lg,
    background: interactive && hover ? colors.surface.medium : colors.surface.dark,
    border: `1px solid ${interactive && hover ? colors.border.strong : colors.border.subtle}`,
    borderRadius: radii.lg,
    cursor: interactive ? 'pointer' : 'default',
    opacity: interactive ? 1 : 0.55,
    transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
    transform: interactive && hover ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow: interactive && hover ? shadows.md : shadows.sm,
    fontFamily: typography.ui.family,
    textAlign: 'left',
  };

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-disabled={!interactive || undefined}
      aria-label={feature.title}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: radii.md,
            background: colors.surface.darkest,
            border: `1px solid ${colors.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.accent.primary,
            flexShrink: 0,
          }}
        >
          {feature.icon}
        </div>
        {!feature.available && (
          <span
            style={{
              fontSize: typography.size.xs,
              fontFamily: typography.mono.family,
              fontWeight: typography.weight.medium,
              padding: '2px 8px',
              borderRadius: radii.pill,
              background: 'rgba(245, 158, 11, 0.12)',
              color: colors.accent.warning,
              border: `1px solid rgba(245, 158, 11, 0.25)`,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            À venir
          </span>
        )}
      </div>
      <h3
        style={{
          margin: 0,
          fontSize: typography.size.md,
          fontWeight: typography.weight.semibold,
          color: colors.text.primary,
        }}
      >
        {feature.title}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: typography.size.sm,
          color: colors.text.secondary,
          lineHeight: `${typography.lineHeight.sm}px`,
        }}
      >
        {feature.description}
      </p>
    </div>
  );
}

// ===== Icônes inline (SVG) =====================================================

function LeverIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x={4} y={4} width={16} height={16} rx={2} stroke="currentColor" strokeWidth={1.5} />
      <circle cx={12} cy={12} r={1.5} fill="currentColor" />
      <path d="M 12 12 L 12 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={12} cy={5} r={2} fill="currentColor" />
    </svg>
  );
}

function PrsIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Panneau de signalisation à 3 feux, évocateur d'un poste PRS. */}
      <rect x={7} y={3} width={10} height={18} rx={2} stroke="currentColor" strokeWidth={1.5} />
      <circle cx={12} cy={7} r={1.6} fill="currentColor" />
      <circle cx={12} cy={12} r={1.6} stroke="currentColor" strokeWidth={1.3} />
      <circle cx={12} cy={17} r={1.6} stroke="currentColor" strokeWidth={1.3} />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M 4 5 L 4 19 L 12 17 L 20 19 L 20 5 L 12 7 Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M 12 7 L 12 17" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M 9.5 14.5 L 14.5 9.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <path
        d="M 11 7 L 12.5 5.5 A 3.5 3.5 0 0 1 17.5 10.5 L 16 12"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 13 17 L 11.5 18.5 A 3.5 3.5 0 0 1 6.5 13.5 L 8 12"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={8.5} stroke="currentColor" strokeWidth={1.5} />
      <circle cx={12} cy={8.5} r={1} fill="currentColor" />
      <path d="M 12 11 L 12 16.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
