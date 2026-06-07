// Page "Scénarios pédagogiques" : liste les scénarios JSON chargés depuis
// `src/data/stations/<station>/scenarios/*.json` et permet d'en choisir un
// pour ouvrir la gare cible.
//
// Pas de chargement réseau : les scénarios sont bundés via Vite glob eager
// (cf. loadFixtures.listScenarios). Quand l'opérateur clique un scénario,
// on remonte au parent l'identifiant + la station — c'est le parent (App)
// qui orchestre le chargement de la station et la bascule en vue 'sim'.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { listScenarios } from '../lib/loadFixtures';
import type { Scenario } from '../types/gessie';
import { colors, radii, shadows, spacing, typography } from '../design/tokens';

interface ScenariosPageProps {
  /** Callback déclenché quand l'opérateur choisit un scénario. */
  onSelectScenario: (scenario: Scenario) => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; scenarios: Scenario[] }
  | { kind: 'error'; message: string };

export function ScenariosPage({ onSelectScenario }: ScenariosPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listScenarios()
      .then((scenarios) => {
        if (!cancelled) setState({ kind: 'ready', scenarios });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Erreur de chargement',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scenarios = state.kind === 'ready' ? state.scenarios : [];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: `${spacing.xl}px ${spacing.lg}px`,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.lg,
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
            Scénarios pédagogiques
          </h2>
          <p
            style={{
              margin: `${spacing.xs}px 0 0`,
              fontSize: typography.size.base,
              color: colors.text.secondary,
              lineHeight: `${typography.lineHeight.base}px`,
            }}
          >
            {state.kind === 'loading'
              ? 'Chargement des scénarios…'
              : state.kind === 'error'
                ? `Impossible de charger les scénarios : ${state.message}`
                : scenarios.length === 0
                  ? 'Aucun scénario disponible pour le moment.'
                  : 'Choisissez un scénario pour ouvrir la gare correspondante.'}
          </p>
        </header>

        {state.kind === 'ready' && scenarios.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: spacing.md,
            }}
          >
            {scenarios.map((s) => (
              <li key={s.id} style={{ display: 'flex' }}>
                <ScenarioCard scenario={s} onClick={() => onSelectScenario(s)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScenarioCard({
  scenario,
  onClick,
}: {
  scenario: Scenario;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  const trainsCount = scenario.trains?.length ?? 0;
  const avariesCount = scenario.avaries?.length ?? 0;

  const style: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.lg,
    background: hover ? colors.surface.medium : colors.surface.dark,
    border: `1px solid ${hover ? colors.border.strong : colors.border.subtle}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
    transform: hover ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow: hover ? shadows.md : shadows.sm,
    fontFamily: typography.ui.family,
    textAlign: 'left',
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Lancer le scénario ${scenario.name} sur la gare ${scenario.station}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm }}>
        <h3
          style={{
            margin: 0,
            fontSize: typography.size.md,
            fontWeight: typography.weight.semibold,
            color: colors.text.primary,
          }}
        >
          {scenario.name}
        </h3>
        {scenario.starting_time && (
          <span
            style={{
              fontFamily: typography.mono.family,
              fontSize: typography.size.xs,
              color: colors.text.muted,
              letterSpacing: 0.4,
            }}
          >
            {scenario.starting_time}
          </span>
        )}
      </div>

      <div
        style={{
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          color: colors.accent.primary,
          letterSpacing: 0.3,
        }}
      >
        gare · {scenario.station}
      </div>

      {scenario.description && (
        <p
          style={{
            margin: 0,
            fontSize: typography.size.sm,
            color: colors.text.secondary,
            lineHeight: `${typography.lineHeight.sm}px`,
          }}
        >
          {scenario.description}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          marginTop: spacing.xxs,
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          color: colors.text.muted,
        }}
      >
        <span>
          {trainsCount} train{trainsCount > 1 ? 's' : ''}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {avariesCount} avarie{avariesCount > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
