import type { ComponentType } from 'react';
import type { StationItem, Tool } from '../../types/gessie';
import { TcoSignal } from './TcoSignal';
import { TcoAiguille } from './TcoAiguille';
import { TcoJoint } from './TcoJoint';
import { TcoTraverse } from './TcoTraverse';
import { TcoRail } from './TcoRail';
import { TcoVoie } from './TcoVoie';
import { TcoControle } from './TcoControle';
import { TcoZone } from './TcoZone';
import { TcoTrace } from './TcoTrace';
import { TcoLabel } from './TcoLabel';
import { TcoTaquet } from './TcoTaquet';
import { TcoArrow } from './TcoArrow';
import { TcoGenericPlaceholder } from './TcoGenericPlaceholder';

export interface PrimitiveProps {
  item: StationItem;
  tool: Tool;
}

/**
 * Tous les types d'items ont désormais un rendu procédural fidèle. Le
 * fallback TcoSvgIcon n'est plus utilisé ; il reste disponible pour les
 * tools custom non encore portés (cf. TcoGenericPlaceholder).
 */
export const renderers: Record<string, ComponentType<PrimitiveProps>> = {
  aiguille: TcoAiguille,
  tjd:      TcoTraverse,
  tjs:      TcoTraverse,
  to:       TcoTraverse,
  taquet:   TcoTaquet,
  joint:    TcoJoint,
  arrow:    TcoArrow,

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
