import { useEffect, useMemo, useRef, useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { getRenderer } from './renderers';
import type { ContextMenuTarget } from './TcoContextMenu';
import type { StationItem } from '../../types/gessie';

/* Plus de props : le SVG occupe 100% de son conteneur via CSS, et le viewBox
 * gère le scaling vectoriel pour que tout le contenu soit visible. */

interface BoundingBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface Props {
  /** Clic-droit sur un item dont l'affectation supporte au moins une avarie
   *  (aiguille / contrôle / zone). */
  onAvariesMenu?: (target: ContextMenuTarget, x: number, y: number) => void;
  /** Clic-droit sur une voie : ouvre le menu de lancement de train. */
  onTrainMenu?: (suggestedStartingPoint: string | null, x: number, y: number) => void;
  /**
   * Rectangle monde (coordonnées SVG) à cadrer, avec animation du `viewBox`.
   * `null` → revient à la vue d'ensemble.
   *
   * Quand la prop n'est PAS fournie (cas bureau), le comportement est
   * strictement inchangé : `viewBox` statique = bounding box complet, aucune
   * animation. Seule la vue mobile passe cette prop.
   */
  focus?: { minX: number; minY: number; width: number; height: number } | null;
  /**
   * Nonce de recentrage : à chaque incrément, le TCO ré-anime son `viewBox`
   * vers la vue d'ensemble (utile après un pan manuel quand `focus` est déjà
   * `null`). Sans effet côté bureau (prop non fournie).
   */
  recenter?: number;
}

const FOCUS_EASE = (k: number) => 1 - Math.pow(1 - k, 3);
const FOCUS_DURATION = 420;

/**
 * Conteneur SVG du TCO. Itère sur station.items et délègue à la primitive
 * correspondant à item.toolId.
 *
 * Le SVG occupe 100% de son parent. Le `viewBox` est calculé sur le bounding
 * box des items, et `preserveAspectRatio="xMidYMid meet"` (défaut) scale
 * vectoriellement pour faire tenir tout le contenu sans déformer.
 */
export function TcoCanvas({ onAvariesMenu, onTrainMenu, focus, recenter }: Props) {
  const station = useGessieStore((s) => s.station);
  const tools = useGessieStore((s) => s.tools);

  const bbox: BoundingBox = useMemo(() => {
    if (!station || station.items.length === 0) {
      return { minX: 0, minY: 0, width: 2400, height: 1200 };
    }
    // Items standards : xPos/yPos. traceLine : x1/y1/x2/y2.
    const xs: number[] = [];
    const ys: number[] = [];
    for (const i of station.items) {
      if (typeof i.xPos === 'number') xs.push(i.xPos);
      if (typeof i.yPos === 'number') ys.push(i.yPos);
      if (typeof i.x1 === 'number') xs.push(i.x1 as number);
      if (typeof i.x2 === 'number') xs.push(i.x2 as number);
      if (typeof i.y1 === 'number') ys.push(i.y1 as number);
      if (typeof i.y2 === 'number') ys.push(i.y2 as number);
    }
    if (xs.length === 0 || ys.length === 0) {
      return { minX: 0, minY: 0, width: 2400, height: 1200 };
    }
    // Padding asymétrique : à droite et en bas, les items s'étendent à partir
    // de leur xPos/yPos (rails, voies font ~200px de long), donc on prévoit
    // de la marge. À gauche et en haut, l'item est centré sur xPos/yPos donc
    // marge minimale suffit. Plus le bbox est serré, plus le contenu rendu
    // est grand pour une même surface de viewport.
    const minX = Math.min(...xs) - 20;
    const minY = Math.min(...ys) - 30;
    const maxX = Math.max(...xs) + 220; // voie : ~200px à droite
    const maxY = Math.max(...ys) + 40;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [station]);

  // Boîte cible : le rectangle `focus` à cadrer, ou bbox complet si `focus` null.
  const targetBox: BoundingBox = useMemo(() => focus ?? bbox, [focus, bbox]);

  // Animation du viewBox vers `targetBox` (vue mobile uniquement). `animRef`
  // garde la boîte courante (mise à jour hors render, dans la boucle rAF) pour
  // enchaîner les animations sans à-coup.
  const [animBox, setAnimBox] = useState<BoundingBox>(bbox);
  const animRef = useRef<BoundingBox>(bbox);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (focus === undefined) return; // bureau : aucune animation, viewBox statique
    const start = animRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / FOCUS_DURATION);
      const e = FOCUS_EASE(k);
      const next: BoundingBox = {
        minX: start.minX + (targetBox.minX - start.minX) * e,
        minY: start.minY + (targetBox.minY - start.minY) * e,
        width: start.width + (targetBox.width - start.width) * e,
        height: start.height + (targetBox.height - start.height) * e,
      };
      animRef.current = next;
      setAnimBox(next);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetBox, focus, recenter]);

  // Gestes tactiles (vue mobile uniquement) : 1 doigt = pan, 2 doigts =
  // pincer-pour-zoomer. On manipule directement `animBox` (le viewBox courant).
  const interactive = focus !== undefined;
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<
    | { mode: 'pan'; sx: number; sy: number; box: BoundingBox }
    | { mode: 'pinch'; dist: number; midX: number; midY: number; worldX: number; worldY: number; box: BoundingBox }
    | null
  >(null);

  const setBox = (b: BoundingBox) => {
    animRef.current = b;
    setAnimBox(b);
  };
  // Échelle « meet » (px par unité monde) du box dans le SVG courant.
  const meetScale = (box: BoundingBox, r: DOMRect) => Math.min(r.width / box.width, r.height / box.height);
  // Convertit un point écran en coordonnées monde pour un box donné.
  const clientToWorld = (cx: number, cy: number, box: BoundingBox, r: DOMRect) => {
    const s = meetScale(box, r);
    const offX = (r.width - box.width * s) / 2;
    const offY = (r.height - box.height * s) / 2;
    return { x: box.minX + (cx - r.left - offX) / s, y: box.minY + (cy - r.top - offY) / s };
  };

  // (Re)démarre un geste selon le nombre de doigts posés.
  const startGesture = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    cancelAnimationFrame(rafRef.current);
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const box = animRef.current;
      const w = clientToWorld(midX, midY, box, r);
      gestureRef.current = { mode: 'pinch', dist, midX, midY, worldX: w.x, worldY: w.y, box };
    } else if (pts.length === 1) {
      gestureRef.current = { mode: 'pan', sx: pts[0].x, sy: pts[0].y, box: animRef.current };
    } else {
      gestureRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || e.button === 2) return; // clic-droit réservé aux menus
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    startGesture();
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    const r = svgRef.current?.getBoundingClientRect();
    if (!g || !r) return;
    if (g.mode === 'pan') {
      const s = meetScale(g.box, r);
      if (!(s > 0)) return;
      setBox({
        minX: g.box.minX - (e.clientX - g.sx) / s,
        minY: g.box.minY - (e.clientY - g.sy) / s,
        width: g.box.width,
        height: g.box.height,
      });
    } else {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      // Écarter les doigts (dist ↑) → box plus petit → zoom avant.
      const minW = Math.min(150, bbox.width);
      const maxW = bbox.width;
      const width = Math.max(minW, Math.min(maxW, (g.box.width * g.dist) / dist));
      const height = width * (g.box.height / g.box.width);
      const s2 = meetScale({ minX: 0, minY: 0, width, height }, r);
      const offX2 = (r.width - width * s2) / 2;
      const offY2 = (r.height - height * s2) / 2;
      // Garde le point monde initial sous le point milieu courant.
      setBox({
        minX: g.worldX - (midX - r.left - offX2) / s2,
        minY: g.worldY - (midY - r.top - offY2) / s2,
        width,
        height,
      });
    }
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà relâché */
    }
    startGesture(); // recalibre avec les doigts restants (pinch → pan, etc.)
  };

  if (!station) {
    return <div style={{ padding: 20, color: '#888' }}>Aucune station chargée.</div>;
  }

  const effectiveBox = focus === undefined ? bbox : animBox;
  const viewBox = `${effectiveBox.minX} ${effectiveBox.minY} ${effectiveBox.width} ${effectiveBox.height}`;

  const handleContextMenu = (e: React.MouseEvent<SVGGElement>, item: StationItem) => {
    // Voie ou rail → menu de lancement de train, point de départ inféré
    // par proximité géométrique (zone la plus proche du clic).
    if ((item.toolId === 'voie' || item.toolId === 'rail') && onTrainMenu) {
      e.preventDefault();
      const svg = e.currentTarget.ownerSVGElement;
      const clickPt = svg ? clientToSvg(svg, e.clientX, e.clientY) : null;
      const closest = clickPt ? findClosestZone(clickPt) : null;
      onTrainMenu(closest, e.clientX, e.clientY);
      return;
    }
    // Aiguille / contrôle / zone → menu d'avaries.
    if (onAvariesMenu) {
      const target = resolveAvariesTarget(item);
      if (!target) return;
      e.preventDefault();
      onAvariesMenu(target, e.clientX, e.clientY);
    }
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{ background: '#1e272e', display: 'block', touchAction: interactive ? 'none' : undefined, cursor: interactive ? 'grab' : undefined }}
    >
      <g>
        {station.items.map((item) => {
          const tool = tools[item.toolId];
          if (!tool) return null;
          const Renderer = getRenderer(item.toolId);
          return (
            <g key={item.uid} onContextMenu={(e) => handleContextMenu(e, item)}>
              <Renderer item={item} tool={tool} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Résout l'item du TCO en cible de menu d'avaries. On essaie plusieurs
 * conventions de clé :
 *   - aiguille  → 'Ag' + item.name
 *   - controle  → item.name (signal carré ou box-style)
 *   - zone      → item.name ou 'z ' + item.name
 *
 * Lecture lazy via getState() : on n'a pas besoin de souscription Zustand,
 * juste de récupérer les affectations à l'instant du clic-droit.
 */
function resolveAvariesTarget(item: StationItem): ContextMenuTarget | null {
  const data = useGessieStore.getState().player.data;
  if (!data) return null;
  const name = item.name != null ? String(item.name) : '';
  if (!name) return null;

  const candidates = [name, 'Ag' + name, 'z ' + name];
  for (const key of candidates) {
    const a = data.affectations[key];
    if (!a) continue;
    if (a.type === 'aiguille' || a.type === 'controle' || a.type === 'zone') {
      return {
        id: key,
        affType: a.type,
        hasEap: Boolean(a.eap),
        hasEpa: Boolean(a.epa),
        hasProxi: Boolean(a.pedales?.Proxi),
      };
    }
  }
  return null;
}

/**
 * Convertit des coordonnées écran (clientX/Y) en coordonnées SVG monde
 * en utilisant la matrice CTM courante du SVG. Tient compte du viewBox
 * et du scaling appliqué par `preserveAspectRatio`.
 */
function clientToSvg(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = new DOMPoint(x, y).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

/**
 * Trouve la zone (affectation type 'zone') dont la position est la plus
 * proche du point cliqué (en coordonnées SVG monde). Retourne l'ID
 * d'affectation ou null si aucune zone n'a été trouvée.
 *
 * Les zones n'ont pas de position sur l'affectation directement — on
 * lit la position via le station item correspondant (toolId === 'zone',
 * dont le `name` correspond à la clé d'affectation).
 */
function findClosestZone(clickPt: { x: number; y: number }): string | null {
  const state = useGessieStore.getState();
  const data = state.player.data;
  const station = state.station;
  if (!data || !station) return null;

  let best: { id: string; dist: number } | null = null;
  for (const item of station.items) {
    if (item.toolId !== 'zone') continue;
    if (item.xPos == null || item.yPos == null) continue;
    const itemName = item.name != null ? String(item.name) : '';
    if (!itemName) continue;

    const candidates = [itemName, 'z ' + itemName];
    let affId: string | null = null;
    for (const k of candidates) {
      const a = data.affectations[k];
      if (a && a.type === 'zone') {
        affId = k;
        break;
      }
    }
    if (!affId) continue;

    const dist = Math.hypot(item.xPos - clickPt.x, item.yPos - clickPt.y);
    if (!best || dist < best.dist) {
      best = { id: affId, dist };
    }
  }
  return best?.id ?? null;
}
