import { Minus, Pencil, Percent, Plus, Trash2 } from 'lucide-react';
import type { OrderLineItemRecord, UUID } from '@/types/pos';
import { Badge } from '@/components/primitives/Badge';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { cn } from '@/utils/cn';
import { describeModifiers, formatCents } from '@/utils/financial';

export interface TicketLineItemProps {
  readonly lineItem: OrderLineItemRecord;
  /** Position on the ticket, 1-based, used for the row index badge. */
  readonly position: number;
  readonly onIncrement: (clientLineItemId: UUID, delta: number) => void;
  readonly onRemove: (clientLineItemId: UUID) => void;
  readonly onEdit?: (clientLineItemId: UUID) => void;
  readonly onDiscount?: (clientLineItemId: UUID) => void;
  readonly compact?: boolean;
  /**
   * Disables every row control. Set while a persistence thunk owns the
   * register: an edit made in that window would be written over (or dropped by)
   * the commit already in flight, so the row reports itself as busy instead of
   * accepting a touch that goes nowhere.
   */
  readonly disabled?: boolean;
}

/**
 * One ticket row: quantity stepper, modifier recap, discount flag and the
 * row total. Must always be keyed by `clientLineItemId` upstream — two rows can
 * legitimately reference the same menu item with different modifiers.
 */
export function TicketLineItem({
  lineItem,
  position,
  onIncrement,
  onRemove,
  onEdit,
  onDiscount,
  compact = false,
  disabled = false,
}: TicketLineItemProps) {
  const hasModifiers = lineItem.selectedModifiers.length > 0;
  const hasNote = lineItem.specialInstructions.trim().length > 0;
  const hasDiscount = lineItem.discountInCents > 0;

  return (
    <article
      data-testid={`ticket-line-${lineItem.clientLineItemId}`}
      data-menu-item-id={lineItem.menuItemId}
      data-quantity={lineItem.quantity}
      data-subtotal-cents={lineItem.subtotalInCents}
      className={cn(
        'flex gap-3 rounded-xl border border-line bg-canvas-raised p-3',
        compact ? 'py-2.5' : 'p-3',
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-mono text-[10px] text-ink-subtle">{position}</span>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onIncrement(lineItem.clientLineItemId, 1)}
          aria-label={`Increase quantity of ${lineItem.name}`}
          data-testid={`ticket-line-increase-${lineItem.clientLineItemId}`}
          className="flex h-touch w-touch items-center justify-center rounded-lg border border-line bg-surface text-ink transition-transform duration-75 active:scale-95 active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>

        <span
          data-testid={`ticket-line-quantity-${lineItem.clientLineItemId}`}
          className="min-w-7 text-center font-mono text-sm font-bold tabular-nums text-ink"
        >
          {lineItem.quantity}
        </span>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onIncrement(lineItem.clientLineItemId, -1)}
          aria-label={`Decrease quantity of ${lineItem.name}`}
          data-testid={`ticket-line-decrease-${lineItem.clientLineItemId}`}
          className="flex h-touch w-touch items-center justify-center rounded-lg border border-line bg-surface text-ink transition-transform duration-75 active:scale-95 active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink sm:text-base">
            {lineItem.name}
          </h4>

          <PriceDisplay
            amountInCents={lineItem.subtotalInCents}
            size="md"
            tone={hasDiscount ? 'tender' : 'default'}
            testId={`ticket-line-total-${lineItem.clientLineItemId}`}
          />
        </div>

        <p className="mt-1 font-mono text-[11px] text-ink-subtle">
          {formatCents(lineItem.unitPriceInCents)} each · tax {lineItem.taxRatePercent}%
        </p>

        {hasModifiers && (
          <p
            data-testid={`ticket-line-modifiers-${lineItem.clientLineItemId}`}
            className="mt-1 line-clamp-2 text-xs leading-snug text-primary"
          >
            {describeModifiers(lineItem.selectedModifiers)}
          </p>
        )}

        {hasNote && (
          <p className="mt-1 line-clamp-2 rounded-md bg-tender/10 px-2 py-1 text-xs text-tender">
            Note: {lineItem.specialInstructions}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasDiscount && (
            <Badge
              label={`Disc ${formatCents(lineItem.discountInCents)}`}
              tone="tender"
              icon={<Percent className="h-3 w-3" aria-hidden="true" />}
              testId={`ticket-line-discount-${lineItem.clientLineItemId}`}
            />
          )}

          {onEdit && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onEdit(lineItem.clientLineItemId)}
              aria-label={`Edit modifiers for ${lineItem.name}`}
              data-testid={`ticket-line-edit-${lineItem.clientLineItemId}`}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted transition-transform duration-75 active:scale-95 active:bg-surface-raised active:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </button>
          )}

          {onDiscount && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDiscount(lineItem.clientLineItemId)}
              aria-label={`Apply a discount to ${lineItem.name}`}
              data-testid={`ticket-line-discount-action-${lineItem.clientLineItemId}`}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted transition-transform duration-75 active:scale-95 active:bg-surface-raised active:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Percent className="h-3.5 w-3.5" aria-hidden="true" />
              Discount
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(lineItem.clientLineItemId)}
            aria-label={`Remove ${lineItem.name} from the ticket`}
            data-testid={`ticket-line-remove-${lineItem.clientLineItemId}`}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wide text-danger transition-transform duration-75 active:scale-95 active:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}