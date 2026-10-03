import {
  CakeSlice,
  CircleDot,
  Coffee,
  CupSoda,
  Sandwich,
  Utensils,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

/**
 * Lucide icon registry for the seed catalog.
 *
 * Categories persist an `iconIdentifier` string instead of a component
 * reference, so the mapping has to be explicit, total and typed. Unknown
 * identifiers fall back to a neutral glyph instead of crashing the rail.
 */
export const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  Sandwich,
  UtensilsCrossed,
  CupSoda,
  CakeSlice,
  Utensils,
  Coffee,
  CircleDot,
};

export const FALLBACK_CATEGORY_ICON: LucideIcon = Utensils;

/** Resolves a persisted icon identifier to a renderable lucide component. */
export function resolveCategoryIcon(iconIdentifier: string): LucideIcon {
  return CATEGORY_ICONS[iconIdentifier] ?? FALLBACK_CATEGORY_ICON;
}