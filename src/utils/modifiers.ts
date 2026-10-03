import type {
  MenuItem,
  ModifierGroup,
  SelectedModifierRecord,
  UUID,
} from '@/types/pos';
import { sanitizePrinterSafeText } from '@/utils/sanitize';

/**
 * Pure helpers backing the modifier selection modal.
 *
 * A draft maps `ModifierGroup.id` to the list of currently selected
 * `ModifierOption.id` values, which is exactly the shape held by
 * `ActivePOSState.stagedModifierDraft`.
 */

export type ModifierDraft = Record<UUID, UUID[]>;

export interface ModifierValidationResult {
  readonly isValid: boolean;
  /** Human readable message per offending group, ready for inline rendering. */
  readonly errors: Readonly<Record<UUID, string>>;
  readonly totalPriceDeltaInCents: number;
}

/** Seeds a draft with every `isDefault` option of every group. */
export function createInitialModifierDraft(item: MenuItem): ModifierDraft {
  const draft: ModifierDraft = {};

  for (const group of item.modifierGroups) {
    draft[group.id] = group.options.filter((option) => option.isDefault).map((option) => option.id);
  }

  return draft;
}

/**
 * Applies a tap on a modifier option, honouring single/multi choice and the
 * `minSelections` / `maxSelections` constraints of the owning group.
 */
export function toggleModifierOption(
  draft: ModifierDraft,
  group: ModifierGroup,
  optionId: UUID,
): ModifierDraft {
  const currentSelection = draft[group.id] ?? [];
  const isSelected = currentSelection.includes(optionId);

  if (group.maxSelections <= 1) {
    // Mandatory single choice groups can never be emptied by tapping.
    const shouldClear = isSelected && currentSelection.length <= group.minSelections;
    return { ...draft, [group.id]: shouldClear ? [] : [optionId] };
  }

  if (isSelected) {
    const nextSelection = currentSelection.filter((id) => id !== optionId);
    // Mandatory multi choice groups cannot drop below their minimum.
    const isBelowMinimum = nextSelection.length < group.minSelections;
    return { ...draft, [group.id]: isBelowMinimum ? currentSelection : nextSelection };
  }

  if (currentSelection.length >= group.maxSelections) {
    // At capacity: keep the existing selection and surface the validation error.
    return { ...draft };
  }

  return { ...draft, [group.id]: [...currentSelection, optionId] };
}

/** Validates the draft against every group's selection bounds. */
export function validateModifierDraft(item: MenuItem, draft: ModifierDraft): ModifierValidationResult {
  const errors: Record<UUID, string> = {};
  let totalPriceDeltaInCents = 0;

  for (const group of item.modifierGroups) {
    const selection = draft[group.id] ?? [];
    const selectionCount = selection.length;

    if (selectionCount < group.minSelections) {
      errors[group.id] = `Select at least ${group.minSelections} option${group.minSelections === 1 ? '' : 's'}`;
    } else if (selectionCount > group.maxSelections) {
      errors[group.id] = `Select no more than ${group.maxSelections} options`;
    }

    for (const optionId of selection) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (option) totalPriceDeltaInCents += option.priceDeltaInCents;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, totalPriceDeltaInCents };
}

/** Converts a validated draft into the immutable rows stored on the ticket. */
export function resolveModifiersFromDraft(
  item: MenuItem,
  draft: ModifierDraft,
): SelectedModifierRecord[] {
  const resolved: SelectedModifierRecord[] = [];

  for (const group of item.modifierGroups) {
    const selection = draft[group.id] ?? [];

    for (const optionId of selection) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) continue;

      resolved.push({
        modifierGroupId: group.id,
        modifierGroupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDeltaInCents: option.priceDeltaInCents,
      });
    }
  }

  return resolved;
}

/** Sanitizes a kitchen note before it is attached to a ticket row. */
export function sanitizeKitchenNote(note: string): string {
  return sanitizePrinterSafeText(note);
}

/** True when the item forces the cashier through the modifier modal. */
export function requiresModifierSelection(item: MenuItem): boolean {
  return item.modifierGroups.some((group) => group.minSelections > 0 && group.options.length > 0);
}