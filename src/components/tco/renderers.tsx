import type { ComponentType } from 'react';
import type { StationItem, Tool } from '../../types/gessie';
import { TcoSignal } from './TcoSignal';
import { TcoSvgIcon } from './TcoSvgIcon';
import { TcoAiguille } from './TcoAiguille';
import { TcoJoint } from './TcoJoint';
import { TcoTraverse } from './TcoTraverse';
import { TcoRail } from './TcoRail';
import { TcoVoie } from './TcoVoie';
import { TcoControle } from './TcoControle';
import { TcoZone } from './TcoZone';
import { TcoTrace } from './TcoTrace';
import { TcoLabel } from './TcoLabel';
import { TcoGenericPlaceholder } from './TcoGenericPlaceholder';

export interface PrimitiveProps {
  item: StationItem;
  tool: Tool;
}

/**
 * Tailles spécifiques par type d'item (en unités SVG).
 *
 * Procéduraux fidèles à Gessie : aiguille, joint, tjd/tjs/to (TcoTraverse).
 * Le reste utilise encore TcoSvgIcon avec une taille à l'œil — à fidéliser.
 */
const renderTaquet: ComponentType<PrimitiveProps> = (props) => <TcoSvgIcon {...props} size={20} />;
const renderArrow: ComponentType<PrimitiveProps> = (props) => <TcoSvgIcon {...props} size={20} />;

export const renderers: Record<string, ComponentType<PrimitiveProps>> = {
  aiguille: TcoAiguille,
  tjd:      TcoTraverse,
  tjs:      TcoTraverse,
  to:       TcoTraverse,
  taquet:   renderTaquet,
  joint:    TcoJoint,
  arrow:    renderArrow,

  rail:     TcoRail,
  voie:     TcoVoie,
  controle: TcoControle,
  zone:     TcoZone,
  trace:    TcoTrace,
  label:    TcoLabel,
  signal:   TcoSignal,
};

export function getRenderer(toolId: string): ComponentType<PrimitiveProps> {
  return renderers[toolId] ?? TcoGenericPlaceholder;
}
