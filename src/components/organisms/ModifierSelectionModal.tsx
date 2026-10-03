import { Check, Layers, Minus, Plus, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { Badge } from '@/components/primitives/Badge';
import { ModalShell } from '@/components/primitives/ModalShell';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { TouchButton } from '@/components/primitives/TouchButton';
import type { Cents, MenuItem, ModifierGroup, SelectedModifier, UUID } from '@/types/pos';
import { MAX_NOTE_LENGTH } from '@/utils/sanitize';
import { cn } from '@/utils/cn';
import { formatCents } from '@/utils/financial';
import {
  resolveModifiersFromDraft,
  sanitizeKitchenNote,
  validateModifierDraft,
  type ModifierDraft,
} from '@/utils/modifiers';

export interface ModifierSelectionModalProps {
  readonly isOpen: boolean;
  readonly item: MenuItem | null;
  readonly draft: ModifierDraft;
  readonly quantity: number;
  readonly note: string;
  readonly onToggleOption: (groupId: UUID, optionId: UUID) => void;
  readonly onQuantityChange: (quantity: number) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
  /** Already-selected modifiers when the modal is re-opened for an edit. */
  readonly initialModifiers?: readonly SelectedModifier[];
}

/**
 * Modifier configuration overlay.
 *
 * Validation is driven entirely by the `ModifierDraft` in the store: every
 * group renders its own error slot and the confirm CTA stays locked until
 * `minSelections` / `maxSelections` are satisfied.
 */
export function ModifierSelectionModal({
  isOpen,
  item,
  draft,
  quantity,
  note,
  onToggleOption,
  onQuantityChange,
  onNoteChange,
  onSubmit,
  onClose,
}: ModifierSelectionModalProps) {
  const validation = useMemo(
    () => (item ? validateModifierDraft(item, draft) : null),
    [draft, item],
  );

  const resolvedModifiers = useMemo(
    () => (item ? resolveModifiersFromDraft(item, draft) : []),
    [draft, item],
  );

  const groupRefs = useRef<Record<UUID, HTMLFieldSetElement | null>>({});

  /**
   * A11Y-01 roving navigation: arrow keys move between the options of one
   * modifier group, Home/End jump to its ends, and single-choice groups pick
   * the focused option on arrival — the behaviour a radio group is expected to
   * have, without a cashier ever needing a pointer.
   */
  const focusOption = useCallback(
    (group: ModifierGroup, direction: 1 | -1 | 'first' | 'last'): void => {
      const fieldset = groupRefs.current[group.id];
      if (!fieldset) return;

      const options = Array.from(
        fieldset.querySelectorAll<HTMLButtonElement>('button[data-modifier-option]'),
      );
      if (options.length === 0) return;

      const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);

      let nextIndex: number;
      if (direction === 'first') nextIndex = 0;
      else if (direction === 'last') nextIndex = options.length - 1;
      else if (currentIndex === -1) nextIndex = direction === 1 ? 0 : options.length - 1;
      else nextIndex = (currentIndex + direction + options.length) % options.length;

      const nextOption = options[nextIndex];
      if (!nextOption) return;

      nextOption.focus({ preventScroll: false });

      const optionId = nextOption.getAttribute('data-modifier-option');
      if (optionId && group.maxSelections <= 1) {
        onToggleOption(group.id, optionId);
      }
    },
    [onToggleOption],
  );

  const handleGroupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFieldSetElement>, group: ModifierGroup): void => {
      const target = event.target as HTMLElement;
      if (target.getAttribute('data-modifier-option') === null) return;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          focusOption(group, 1);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          focusOption(group, -1);
          break;
        case 'Home':
          event.preventDefault();
          focusOption(group, 'first');
          break;
        case 'End':
          event.preventDefault();
          focusOption(group, 'last');
          break;
        default:
          break;
      }
    },
    [focusOption],
  );

  if (!item || !validation) {
    return (
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Modifier selection"
        testId="modifier-modal"
      >
        <p data-testid="modifier-modal-empty" className="font-mono text-sm text-ink-muted">
          No menu item is staged for modification.
        </p>
      </ModalShell>
    );
  }

  const unitPriceInCents = Math.max(0, item.priceInCents + validation.totalPriceDeltaInCents);
  const lineTotalInCents: Cents = unitPriceInCents * Math.max(1, quantity);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={item.name}
      subtitle={`${item.sku} · ${formatCents(item.priceInCents)} base`}
      size="lg"
      testId="modifier-modal"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">Line total</span>
            <PriceDisplay amountInCents={lineTotalInCents} size="xl" tone="primary" testId="modifier-line-total" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-auto">
            <TouchButton label="Cancel" variant="ghost" onPress={onClose} testId="modifier-cancel" />
            <TouchButton
              label="Add to ticket"
              variant="primary"
              onPress={onSubmit}
              disabled={!validation.isValid}
              testId="modifier-confirm"
            />
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {!validation.isValid && (
          <p
            data-testid="modifier-validation-banner"
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-danger"
          >
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Complete the required options before adding
          </p>
        )}

        {item.modifierGroups.map((group) => {
          const selectedOptions = draft[group.id] ?? [];
          const errorMessage = validation.errors[group.id];
          const isMultiSelect = group.maxSelections > 1;

          return (
            <fieldset
              key={group.id}
              ref={(node) => {
                groupRefs.current[group.id] = node;
              }}
              onKeyDown={(event) => handleGroupKeyDown(event, group)}
              data-testid={`modifier-group-${group.id}`}
              data-invalid={Boolean(errorMessage)}
              className="space-y-2"
            >
              <legend className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wide text-ink">{group.name}</span>
                {group.minSelections > 0 ? (
                  <Badge label="Required" tone="danger" testId={`modifier-required-${group.id}`} />
                ) : (
                  <Badge label="Optional" tone="muted" />
                )}
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
                  {isMultiSelect
                    ? `pick up to ${group.maxSelections}`
                    : group.minSelections > 0
                      ? 'pick one'
                      : 'optional single'}
                </span>
              </legend>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.options.map((option, optionIndex) => {
                  const isSelected = selectedOptions.includes(option.id);
                  const isAtCapacity = !isSelected && selectedOptions.length >= group.maxSelections;
                  const isFirstOption = optionIndex === 0;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role={isMultiSelect ? 'checkbox' : 'radio'}
                      aria-checked={isSelected}
                      onClick={() => onToggleOption(group.id, option.id)}
                      data-testid={`modifier-option-${option.id}`}
                      data-modifier-option={option.id}
                      data-selected={isSelected}
                      data-blocked={isAtCapacity}
                      tabIndex={
                        (draft[group.id] ?? []).includes(option.id) || isFirstOption
                          ? 0
                          : -1
                      }
                      className={cn(
                        'flex min-h-touch items-center gap-3 rounded-xl border px-3 py-2 text-left',
                        'transition-transform duration-75 active:scale-95',
                        isSelected
                          ? 'border-primary bg-primary/15 text-ink'
                          : isAtCapacity
                            ? 'border-line bg-surface text-ink-subtle opacity-60'
                            : 'border-line-strong bg-surface-raised text-ink-muted active:bg-zinc-700 active:text-ink',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center border',
                          isMultiSelect ? 'rounded-md' : 'rounded-full',
                          isSelected ? 'border-primary bg-primary text-primary-contrast' : 'border-line-strong',
                        )}
                      >
                        {isSelected && <Check className="h-4 w-4" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{option.name}</span>
                        <span className="font-mono text-xs text-ink-subtle">
                          {option.priceDeltaInCents === 0
                            ? 'included'
                            : option.priceDeltaInCents > 0
                              ? `+${formatCents(option.priceDeltaInCents)}`
                              : `−${formatCents(Math.abs(option.priceDeltaInCents))}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {errorMessage && (
                <p
                  data-testid={`modifier-error-${group.id}`}
                  role="alert"
                  className="font-mono text-xs uppercase tracking-widest text-danger"
                >
                  {errorMessage}
                </p>
              )}
            </fieldset>
          );
        })}

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">Quantity</span>
            <div className="flex items-center gap-2">
              <TouchButton
                label="Decrease quantity"
                icon={Minus}
                iconOnly
                variant="secondary"
                onPress={() => onQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
                ariaLabel="Decrease quantity"
                testId="modifier-quantity-decrease"
              />
              <span
                data-testid="modifier-quantity"
                className="min-w-14 text-center font-mono text-2xl font-bold tabular-nums text-ink"
              >
                {quantity}
              </span>
              <TouchButton
                label="Increase quantity"
                icon={Plus}
                iconOnly
                variant="secondary"
                onPress={() => onQuantityChange(quantity + 1)}
                disabled={quantity >= 99}
                ariaLabel="Increase quantity"
                testId="modifier-quantity-increase"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="modifier-special-instructions"
              className="font-mono text-xs uppercase tracking-widest text-ink-muted"
            >
              Kitchen note
            </label>
            <textarea
              id="modifier-special-instructions"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="Allergies, timing, cut in half…"
              data-testid="modifier-note"
              className="min-h-touch w-full resize-none rounded-xl border border-line bg-canvas-raised px-3 py-2 text-base text-ink outline-none placeholder:text-ink-muted focus:border-primary"
            />

            <p
              data-testid="modifier-note-counter"
              className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle"
            >
              {sanitizeKitchenNote(note).length}/{MAX_NOTE_LENGTH} characters · control characters
              stripped
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-canvas-raised p-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-widest text-ink-subtle">
              {resolvedModifiers.length} modifier{resolvedModifiers.length === 1 ? '' : 's'} selected
            </span>
          </div>
          <p data-testid="modifier-summary" className="mt-1 text-xs text-ink-muted">
            {resolvedModifiers.length === 0
              ? 'No modifiers selected'
              : resolvedModifiers.map((modifier) => modifier.optionName).join(' · ')}
          </p>
        </div>
      </div>
    </ModalShell>
  );
}