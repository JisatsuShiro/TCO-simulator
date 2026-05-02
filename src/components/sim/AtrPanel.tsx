// Panel des ATR (annulateurs de transit). Carte par ATR avec ses indicateurs
// d'état (Pill) et les actions opérateur.
//
// Sélecteurs primitifs (count + accès indexé par champ) pour éviter les
// boucles "getSnapshot should be cached".

import { useGessieStore } from '../../store/useGessieStore';
import { Panel } from '../../design/primitives/Panel';
import { Button } from '../../design/primitives/Button';
import { Pill } from '../../design/primitives/Pill';
import { colors, radii, spacing, typography } from '../../design/tokens';

export function AtrPanel() {
  const count = useGessieStore((s) => s.player.data?.transitAnnulateurs.length ?? 0);
  if (count === 0) return null;

  return (
    <Panel
      title="Annulateurs de transit"
      meta={`${count} ATR`}
      scroll
      maxHeight={260}
      bodyGap={spacing.sm}
    >
      {Array.from({ length: count }, (_, i) => (
        <AtrRow key={i} index={i} />
      ))}
    </Panel>
  );
}

function AtrRow({ index }: { index: number }) {
  const id = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.id ?? '');
  const on = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.on ?? false);
  const pressed = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.pressed ?? false);
  const autorisation = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.autorisation ?? false);
  const terrain = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.terrain ?? false);

  const pressATR = useGessieStore((s) => s.pressATRBouton);
  const releaseATR = useGessieStore((s) => s.releaseATRBouton);
  const giveAuth = useGessieStore((s) => s.giveATRAutorisation);
  const removeAuth = useGessieStore((s) => s.removeATRAutorisation);

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
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <strong
          style={{
            color: colors.text.primary,
            fontSize: typography.size.base,
            fontWeight: typography.weight.semibold,
            minWidth: 60,
          }}
        >
          {id}
        </strong>
        <Pill variant="success" active={on}>
          Allumé
        </Pill>
        <Pill variant="info" active={pressed}>
          Pressé
        </Pill>
        <Pill variant="warning" active={autorisation}>
          Autorisation
        </Pill>
        <Pill variant="neutral" active={terrain}>
          Terrain
        </Pill>
      </div>

      <div style={actionRowStyle}>
        <Button size="sm" onClick={() => pressATR(id)}>
          Presser
        </Button>
        <Button size="sm" variant="ghost" onClick={() => releaseATR(id)}>
          Relâcher
        </Button>
        <Button size="sm" onClick={() => giveAuth(id)}>
          Autoriser
        </Button>
        <Button size="sm" variant="ghost-danger" onClick={() => removeAuth(id)}>
          Retirer
        </Button>
      </div>
    </div>
  );
}
