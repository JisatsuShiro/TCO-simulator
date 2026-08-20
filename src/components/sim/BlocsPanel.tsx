// Panel des blocs sémaphores (cantonnement). Affiche chaque bloc sous forme
// de carte avec ses indicateurs d'état (Pill) et les actions opérateur.
//
// Sélecteurs Zustand primitifs (count + accès indexé par champ) pour éviter
// les boucles "getSnapshot should be cached".

import { useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { Panel } from '../../design/primitives/Panel';
import { Button } from '../../design/primitives/Button';
import { Pill } from '../../design/primitives/Pill';
import { colors, radii, spacing, typography } from '../../design/tokens';
import { DispositifsMenu, type DispositifsTarget } from './DispositifsMenu';
import { DispositifBadges } from './DispositifBadges';

export function BlocsPanel() {
  const blocsCount = useGessieStore((s) => s.player.data?.blocs.length ?? 0);
  const [dispositifsMenu, setDispositifsMenu] = useState<
    { x: number; y: number; target: DispositifsTarget } | null
  >(null);

  if (blocsCount === 0) return null;

  const openMenu = (e: React.MouseEvent, blocId: string) => {
    e.preventDefault();
    setDispositifsMenu({ x: e.clientX, y: e.clientY, target: { kind: 'bloc', blocId } });
  };

  return (
    <Panel
      title="Blocs cantonnement"
      meta={`${blocsCount} bloc${blocsCount > 1 ? 's' : ''}`}
      scroll
      maxHeight={320}
      bodyGap={spacing.sm}
    >
      {Array.from({ length: blocsCount }, (_, i) => (
        <BlocRow key={i} index={i} onContextMenu={openMenu} />
      ))}
      {dispositifsMenu && (
        <DispositifsMenu
          x={dispositifsMenu.x}
          y={dispositifsMenu.y}
          target={dispositifsMenu.target}
          onClose={() => setDispositifsMenu(null)}
        />
      )}
    </Panel>
  );
}

function BlocRow({
  index,
  onContextMenu,
}: {
  index: number;
  onContextMenu: (e: React.MouseEvent, blocId: string) => void;
}) {
  const id = useGessieStore((s) => s.player.data?.blocs[index]?.id ?? '');
  const gareLabel = useGessieStore((s) => s.player.data?.blocs[index]?.gareLabel ?? '');
  const test = useGessieStore((s) => s.player.data?.blocs[index]?.test ?? '');
  const voieLibre = useGessieStore((s) => s.player.data?.blocs[index]?.voieLibre ?? '');
  const reddition = useGessieStore((s) => s.player.data?.blocs[index]?.reddition ?? '');
  const annonce = useGessieStore((s) => s.player.data?.blocs[index]?.annonce ?? '');
  const commutSemaphore = useGessieStore((s) => s.player.data?.blocs[index]?.commutSemaphore ?? '');
  const commutSemaphoreLight = useGessieStore((s) => s.player.data?.blocs[index]?.commutSemaphoreLight ?? '');
  const blocage = useGessieStore((s) => s.player.data?.blocs[index]?.blocage ?? '');
  const semaphoreId = useGessieStore((s) => s.player.data?.blocs[index]?.semaphoreId ?? '');

  const dispositifsCsv = useGessieStore(
    (s) => (s.player.data?.blocs[index]?.dispositifs ?? []).slice().sort().join('\n'),
  );
  const dispositifs = dispositifsCsv === '' ? [] : dispositifsCsv.split('\n');

  const pressTest = useGessieStore((s) => s.pressTestBouton);
  const pressReddition = useGessieStore((s) => s.pressRedditionBouton);
  const switchSem = useGessieStore((s) => s.switchSemaphoreBouton);
  const switchVL = useGessieStore((s) => s.switchVoieLibreBouton);
  const pressAnnonce = useGessieStore((s) => s.pressAnnonceBouton);

  // Convention bloc : 'A' = active (allumé), 'E' = éteint, '' = repos.
  const isActive = (v: string) => v === 'A';

  const cardStyle: React.CSSProperties = {
    background: colors.surface.medium,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radii.md,
    padding: spacing.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.sm,
  };

  const stateRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    alignItems: 'center',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  };

  return (
    <div
      style={cardStyle}
      onContextMenu={(e) => onContextMenu(e, id)}
      title="Clic-droit : dispositifs d'attention (DA / DR)"
    >
      <div style={headerStyle}>
        <strong
          style={{
            color: colors.text.primary,
            fontSize: typography.size.base,
            fontWeight: typography.weight.semibold,
          }}
        >
          {gareLabel || id}
        </strong>
        {semaphoreId && (
          <span
            style={{
              color: colors.text.muted,
              fontSize: typography.size.xs,
              fontFamily: typography.mono.family,
            }}
          >
            sémaphore {semaphoreId}
          </span>
        )}
        <DispositifBadges dispositifs={dispositifs} />
      </div>

      <div style={stateRowStyle}>
        <Pill variant="success" active={isActive(test)}>
          Test
        </Pill>
        <Pill variant="success" active={isActive(voieLibre)}>
          Voie libre
        </Pill>
        <Pill variant="info" active={isActive(reddition)}>
          Réddition
        </Pill>
        <Pill variant="warning" active={isActive(annonce)}>
          Annonce
        </Pill>
        {commutSemaphore && (
          <Pill variant="neutral" active>
            Sém. {commutSemaphore}
            {commutSemaphoreLight ? ` · lampe ${commutSemaphoreLight}` : ''}
          </Pill>
        )}
        {blocage && blocage !== 'E' && (
          <Pill variant="danger" active>
            Blocage {blocage}
          </Pill>
        )}
      </div>

      <div style={actionRowStyle}>
        <Button size="sm" onClick={() => pressTest(id)}>
          Test
        </Button>
        <Button size="sm" onClick={() => pressReddition(id)}>
          Réddition
        </Button>
        <Button size="sm" onClick={() => switchSem(id)}>
          Sémaph. {commutSemaphore === 'N' ? '→ R' : '→ N'}
        </Button>
        <Button size="sm" onClick={() => switchVL(id)}>
          VL {voieLibre === 'A' ? '→ E' : '→ A'}
        </Button>
        <Button size="sm" onClick={() => pressAnnonce(id)}>
          Annonce
        </Button>
      </div>
    </div>
  );
}
