// Page "Cantonnement" : mise en relation de deux postes pour gérer le
// cantonnement (blocs sémaphores entre deux gares) à deux opérateurs, via le
// serveur relais WebSocket (cf. src/net/useCantonnementSession).
//
// Trois écrans (state `mode`) :
//   - 'menu'   : choisir entre créer une partie ou en rejoindre une.
//   - 'create' : l'hôte choisit sa gare ; un code est généré et la partie est
//                ouverte (connexion immédiate). Présence en direct + code à
//                partager.
//   - 'join'   : l'invité saisit le code reçu, choisit sa gare parmi celles
//                restantes (la gare de l'hôte est devinée depuis le code), puis
//                rejoint. Le serveur fait foi sur la réservation de gare.
//
// Le code de session encode la gare de l'hôte (1re lettre, cf. gares.ts) :
// confort UX pour pré-filtrer le choix côté « rejoindre ». La réservation
// réelle est arbitrée par le serveur (erreur `gare-taken`).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '../design/primitives/Button';
import { GareSelect } from '../design/primitives/GareSelect';
import { colors, radii, shadows, spacing, typography } from '../design/tokens';
import {
  GARES,
  GARE_TO_LETTER,
  LETTER_TO_GARE,
  type Gare,
} from '../net/gares';
import { useCantonnementSession } from '../net/useCantonnementSession';
import type { SessionStatus } from '../net/useCantonnementSession';

// Alphabet sans caractères ambigus (pas de I/O/0/1) pour les 3 lettres
// aléatoires, afin de faciliter la dictée du code à l'oral.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

function pick(chars: string): string {
  return chars.charAt(Math.floor(Math.random() * chars.length));
}

/** Corps aléatoire du code : 3 lettres + 4 chiffres (hors préfixe gare). */
function generateBody(): { letters: string; digits: string } {
  let letters = '';
  for (let i = 0; i < 3; i++) letters += pick(LETTERS);
  let digits = '';
  for (let i = 0; i < 4; i++) digits += pick(DIGITS);
  return { letters, digits };
}

function formatCode(gare: Gare, body: { letters: string; digits: string }): string {
  return `${GARE_TO_LETTER[gare]}${body.letters}-${body.digits}`;
}

/** Parse un code saisi → gare de l'hôte + code normalisé, ou `null` si invalide. */
function parseCode(raw: string): { gare: Gare; code: string } | null {
  const c = raw.trim().toUpperCase();
  const m = /^([A-Z])([A-Z]{3})-(\d{4})$/.exec(c);
  if (!m) return null;
  const gare = LETTER_TO_GARE[m[1]];
  if (!gare) return null;
  return { gare, code: c };
}

type Mode = 'menu' | 'create' | 'join';

interface CantonnementPageProps {
  /** Retour à la page d'accueil. */
  onBack: () => void;
  /** Entrer en poste sur la gare donnée (charge la sim, session conservée). */
  onEnterPoste: (gare: Gare) => void;
}

export function CantonnementPage({ onBack, onEnterPoste }: CantonnementPageProps) {
  const [mode, setMode] = useState<Mode>('menu');
  const disconnect = useCantonnementSession((s) => s.disconnect);

  // Quitter le lobby (retour menu ou accueil) coupe la session.
  const leaveToMenu = useCallback(() => {
    disconnect();
    setMode('menu');
  }, [disconnect]);

  const leaveToHome = useCallback(() => {
    disconnect();
    onBack();
  }, [disconnect, onBack]);

  return (
    <Shell>
      <header style={{ textAlign: 'center' }}>
        <h2 style={titleStyle}>Cantonnement</h2>
        <p style={subtitleStyle}>
          {mode === 'menu'
            ? 'Gérez le cantonnement à deux : créez une partie ou rejoignez celle d’un collègue.'
            : mode === 'create'
              ? 'Choisissez votre gare et partagez le code généré avec l’opérateur voisin.'
              : 'Saisissez le code reçu puis choisissez votre gare parmi celles disponibles.'}
        </p>
      </header>

      {mode === 'menu' ? (
        <MenuScreen onCreate={() => setMode('create')} onJoin={() => setMode('join')} />
      ) : mode === 'create' ? (
        <CreateScreen onBack={leaveToMenu} onEnterPoste={onEnterPoste} />
      ) : (
        <JoinScreen onBack={leaveToMenu} onEnterPoste={onEnterPoste} />
      )}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Button variant="ghost" onClick={leaveToHome}>
          ← Retour à l'accueil
        </Button>
      </div>
    </Shell>
  );
}

// ===== Écran : menu (créer / rejoindre) =======================================

function MenuScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: spacing.md,
      }}
    >
      <ChoiceCard
        title="Créer une partie"
        description="Vous êtes l’hôte : choisissez votre gare et obtenez un code à partager."
        onClick={onCreate}
      />
      <ChoiceCard
        title="Rejoindre une partie"
        description="Vous avez reçu un code : saisissez-le et choisissez une gare disponible."
        onClick={onJoin}
      />
    </div>
  );
}

function ChoiceCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const style: CSSProperties = {
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
      aria-label={title}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      <h3
        style={{
          margin: 0,
          fontSize: typography.size.md,
          fontWeight: typography.weight.semibold,
          color: colors.text.primary,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: typography.size.sm,
          color: colors.text.secondary,
          lineHeight: `${typography.lineHeight.sm}px`,
        }}
      >
        {description}
      </p>
    </div>
  );
}

// ===== Écran : créer une partie ===============================================

function CreateScreen({
  onBack,
  onEnterPoste,
}: {
  onBack: () => void;
  onEnterPoste: (gare: Gare) => void;
}) {
  const [gare, setGare] = useState<Gare>(GARES[0]);
  const [body, setBody] = useState(generateBody);
  const [copied, setCopied] = useState(false);

  const connect = useCantonnementSession((s) => s.connect);
  const code = formatCode(gare, body);

  // Ouvre/ré-ouvre la partie dès que le code change (choix de gare, régénération).
  // `connect` est une action zustand stable.
  useEffect(() => {
    connect(code, gare);
  }, [code, gare, connect]);

  const regenerate = useCallback(() => {
    setBody(generateBody());
    setCopied(false);
  }, []);

  const changeGare = useCallback((g: string) => {
    setGare(g as Gare);
    setCopied(false);
  }, []);

  const copy = useCallback(async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <Card>
      <div style={selectRowStyle}>
        <GareSelect
          value={gare}
          onChange={changeGare}
          options={GARES as unknown as string[]}
          label="Votre gare"
        />
      </div>

      <span style={captionStyle}>Code de session · {gare}</span>

      <div style={codeBoxStyle} aria-label={`Code de session ${code}`}>
        {code}
      </div>

      <div style={actionsRowStyle}>
        <Button variant="primary" onClick={copy} aria-live="polite">
          {copied ? 'Copié ✓' : 'Copier le code'}
        </Button>
        <Button variant="ghost" onClick={regenerate}>
          Régénérer
        </Button>
      </div>

      <PresencePanel onEnterPoste={onEnterPoste} />

      <BackLink onClick={onBack} />
    </Card>
  );
}

// ===== Écran : rejoindre une partie ===========================================

function JoinScreen({
  onBack,
  onEnterPoste,
}: {
  onBack: () => void;
  onEnterPoste: (gare: Gare) => void;
}) {
  const [codeInput, setCodeInput] = useState('');
  // Préférence de gare de l'invité. La gare effective est dérivée pour rester
  // valide quand l'hôte « prend » une gare via un nouveau code.
  const [joinGarePref, setJoinGarePref] = useState<Gare>(GARES[0]);

  const connect = useCantonnementSession((s) => s.connect);
  const status = useCantonnementSession((s) => s.status);
  const sessionError = useCantonnementSession((s) => s.error);
  const connected = status === 'connected' || status === 'connecting' || status === 'reconnecting';

  const parsed = useMemo(() => parseCode(codeInput), [codeInput]);
  const hostGare = parsed?.gare ?? null;

  // Gares proposées à l'invité : toutes sauf celle de l'hôte (déjà prise).
  const availableGares = useMemo(
    () => GARES.filter((g) => g !== hostGare),
    [hostGare],
  );
  // Gare effective : la préférence si encore disponible, sinon la 1re libre.
  const joinGare = availableGares.includes(joinGarePref) ? joinGarePref : availableGares[0];

  const canJoin = parsed != null && !connected;

  const join = useCallback(() => {
    if (!parsed) return;
    connect(parsed.code, joinGare);
  }, [parsed, joinGare, connect]);

  // Connecté : on n'affiche plus le formulaire, juste le lobby.
  if (connected) {
    return (
      <Card>
        <PresencePanel onEnterPoste={onEnterPoste} />
        <BackLink onClick={onBack} />
      </Card>
    );
  }

  return (
    <Card>
      <label style={fieldLabelStyle}>
        Code de la partie
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="ex. CKQP-7392"
          autoCapitalize="characters"
          spellCheck={false}
          style={inputStyle}
          aria-label="Code de la partie"
        />
      </label>

      {codeInput.trim() !== '' && parsed == null && (
        <span style={errorStyle}>Code invalide — vérifiez la saisie.</span>
      )}

      {parsed != null && (
        <span style={captionStyle}>Gare hôte : {hostGare} — indisponible</span>
      )}

      <div style={selectRowStyle}>
        <GareSelect
          value={joinGare}
          onChange={(g) => setJoinGarePref(g as Gare)}
          options={availableGares as unknown as string[]}
          label="Votre gare"
        />
      </div>

      {status === 'error' && sessionError && (
        <span style={errorStyle}>{sessionError}</span>
      )}

      <div style={actionsRowStyle}>
        <Button variant="primary" disabled={!canJoin} onClick={join}>
          Rejoindre la partie
        </Button>
      </div>

      <BackLink onClick={onBack} />
    </Card>
  );
}

// ===== Panneau de présence (partagé create/join) ==============================

function PresencePanel({ onEnterPoste }: { onEnterPoste: (gare: Gare) => void }) {
  const status = useCantonnementSession((s) => s.status);
  const members = useCantonnementSession((s) => s.members);
  const you = useCantonnementSession((s) => s.you);
  const gare = useCantonnementSession((s) => s.gare);
  const error = useCantonnementSession((s) => s.error);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        padding: spacing.md,
        background: colors.surface.darkest,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={captionStyle}>Opérateurs connectés</span>
        <StatusBadge status={status} />
      </div>

      {status === 'error' && error ? (
        <span style={errorStyle}>{error}</span>
      ) : members.length === 0 ? (
        <span style={{ fontSize: typography.size.sm, color: colors.text.muted, textAlign: 'center' }}>
          {status === 'connecting' ? 'Connexion…' : 'En attente d’un autre opérateur…'}
        </span>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {members.map((m) => {
            const isYou = you != null && m.id === you.id;
            return (
              <li
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  background: colors.surface.dark,
                  border: `1px solid ${isYou ? colors.accent.primary : colors.border.subtle}`,
                  borderRadius: radii.md,
                }}
              >
                <span style={{ fontSize: typography.size.sm, color: colors.text.primary }}>
                  {m.gare}
                </span>
                {isYou && (
                  <span
                    style={{
                      fontSize: typography.size.xs,
                      fontFamily: typography.mono.family,
                      color: colors.accent.primary,
                      letterSpacing: 0.4,
                    }}
                  >
                    vous
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {status === 'connected' && gare && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: spacing.xs }}>
          <Button variant="primary" onClick={() => onEnterPoste(gare)}>
            Entrer en poste · {gare}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; color: string }> = {
    idle: { label: 'inactif', color: colors.text.muted },
    connecting: { label: 'connexion…', color: colors.accent.warning },
    connected: { label: 'connecté', color: colors.accent.success },
    reconnecting: { label: 'reconnexion…', color: colors.accent.warning },
    error: { label: 'erreur', color: colors.accent.danger },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        fontSize: typography.size.xs,
        fontFamily: typography.mono.family,
        color: s.color,
        letterSpacing: 0.4,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: s.color,
          display: 'inline-block',
        }}
      />
      {s.label}
    </span>
  );
}

// ===== Helpers UI partagés =====================================================

function Shell({ children }: { children: React.ReactNode }) {
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
          maxWidth: 560,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xl,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.lg,
        padding: spacing.lg,
        background: colors.surface.dark,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.lg,
        boxShadow: shadows.sm,
      }}
    >
      {children}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <Button variant="ghost" size="sm" onClick={onClick}>
        ← Choisir une autre option
      </Button>
    </div>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback navigateurs sans Clipboard API (ou contexte non sécurisé).
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xl,
  fontWeight: typography.weight.semibold,
  color: colors.text.primary,
  letterSpacing: 0.3,
};

const subtitleStyle: CSSProperties = {
  margin: `${spacing.xs}px 0 0`,
  fontSize: typography.size.base,
  color: colors.text.secondary,
  lineHeight: `${typography.lineHeight.base}px`,
};

const captionStyle: CSSProperties = {
  fontSize: typography.size.xs,
  fontFamily: typography.mono.family,
  fontWeight: typography.weight.medium,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: colors.text.muted,
};

const codeBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.sm,
  padding: `${spacing.lg}px ${spacing.xl}px`,
  background: colors.surface.darkest,
  border: `1px solid ${colors.border.default}`,
  borderRadius: radii.lg,
  fontFamily: typography.mono.family,
  fontSize: typography.size.xl,
  fontWeight: typography.weight.semibold,
  letterSpacing: 4,
  color: colors.accent.primary,
  userSelect: 'all',
};

const selectRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.sm,
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  justifyContent: 'center',
};

const fieldLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  color: colors.text.secondary,
  fontFamily: typography.ui.family,
  fontSize: typography.size.sm,
};

const inputStyle: CSSProperties = {
  minHeight: 38,
  padding: '6px 10px',
  background: colors.surface.medium,
  color: colors.text.primary,
  border: `1px solid ${colors.border.default}`,
  borderRadius: radii.md,
  fontFamily: typography.mono.family,
  fontSize: typography.size.md,
  letterSpacing: 2,
  textTransform: 'uppercase',
};

const errorStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: colors.accent.danger,
  textAlign: 'center',
};
