import {
  Armchair,
  ClipboardList,
  CreditCard,
  ParkingCircle,
  Percent,
  Receipt,
  Users,
} from 'lucide-react';
import { TicketLineItem } from '@/components/molecules/TicketLineItem';
import { Badge } from '@/components/primitives/Badge';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { TouchButton } from '@/components/primitives/TouchButton';
import type { Cents, DiningOption, OrderLineItemRecord, OrderSummary, OrderStatus, UUID } from '@/types/pos';
import { cn } from '@/utils/cn';
import { formatCents } from '@/utils/financial';

export interface ActiveOrderTicketProps {
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly diningOption: DiningOption;
  readonly guestCount: number;
  readonly tableLabel: string | null;
  readonly lineItems: readonly OrderLineItemRecord[];
  readonly summary: OrderSummary;
  readonly onIncrementQuantity: (clientLineItemId: UUID, delta: number) => void;
  readonly onRemoveItem: (clientLineItemId: UUID) => void;
  readonly onApplyItemDiscount: (clientLineItemId: UUID, discountInCents: Cents) => void;
  /**
   * Opens the numpad for a line discount. When provided it replaces the legacy
   * one-tap discount so the cashier always chooses the amount.
   */
  readonly onOpenItemDiscount?: (clientLineItemId: UUID) => void;
  readonly onEditLineItem: (clientLineItemId: UUID) => void;
  readonly onSetDiningOption: (diningOption: DiningOption) => void;
  readonly onSetGuestCount: (guestCount: number) => void;
  readonly onOpenTablePicker: () => void;
  readonly onOpenOrderDiscount: () => void;
  readonly onApplyOrderDiscount: (discountInCents: Cents) => void;
  readonly onCheckout: () => void;
  readonly onParkOrder: () => void;
  readonly isMutating?: boolean;
  readonly className?: string;
}

const DINING_OPTIONS: readonly { value: DiningOption; label: string }[] = [
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeout', label: 'Takeout' },
  { value: 'drive_thru', label: 'Drive Thru' },
  { value: 'delivery', label: 'Delivery' },
];

type StatusTone = 'info' | 'tender' | 'success' | 'muted';

/** Fallback line discount when no numpad workflow is wired. */
const DEFAULT_LINE_DISCOUNT_IN_CENTS = 100;

const STATUS_LABELS: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Open', tone: 'info' },
  parked: { label: 'Parked', tone: 'tender' },
  sent_to_kitchen: { label: 'Kitchen', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  voided: { label: 'Voided', tone: 'muted' },
};

interface SummaryRowProps {
  readonly label: string;
  readonly amountInCents: Cents;
  readonly testId: string;
  readonly tone?: 'default' | 'muted' | 'tender';
  readonly emphasis?: boolean;
}

function SummaryRow({ label, amountInCents, testId, tone = 'default', emphasis = false }: SummaryRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn('font-mono uppercase tracking-widest', emphasis ? 'text-sm text-ink' : 'text-xs text-ink-muted')}>
        {label}
      </span>
      <PriceDisplay
        amountInCents={amountInCents}
        size={emphasis ? 'lg' : 'md'}
        tone={tone}
        testId={testId}
      />
    </div>
  );
}

/**
 * The running register: ticket rows, service controls and the settlement panel.
 * This is the panel that becomes a bottom sheet on handheld viewports in the
 * responsive shell.
 */
export function ActiveOrderTicket({
  orderNumber,
  status,
  diningOption,
  guestCount,
  tableLabel,
  lineItems,
  summary,
  onIncrementQuantity,
  onRemoveItem,
  onApplyItemDiscount,
  onOpenItemDiscount,
  onEditLineItem,
  onSetDiningOption,
  onSetGuestCount,
  onOpenTablePicker,
  onOpenOrderDiscount,
  onApplyOrderDiscount,
  onCheckout,
  onParkOrder,
  isMutating = false,
  className,
}: ActiveOrderTicketProps) {
  const statusMeta = STATUS_LABELS[status];
  const hasItems = lineItems.length > 0;
  const hasOrderDiscount = summary.orderDiscountInCents > 0;

  return (
    <section
      data-testid="active-ticket"
      data-order-number={orderNumber}
      data-item-count={lineItems.length}
      data-status={status}
      className={cn('flex min-h-0 flex-1 flex-col bg-surface', className)}
    >
      <header className="shrink-0 space-y-3 border-b border-line bg-surface-raised px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Receipt className="h-5 w-5 shrink-0 text-ink-subtle" aria-hidden="true" />
            <h2
              data-testid="ticket-order-number"
              className="truncate font-mono text-sm font-bold tracking-wider text-ink"
            >
              {orderNumber}
            </h2>
          </div>
          <Badge label={statusMeta.label} tone={statusMeta.tone} size="md" testId="ticket-status" />
        </div>

        <div className="flex flex-wrap gap-2">
          <TouchButton
            label={tableLabel ?? 'Assign table'}
            icon={Armchair}
            size="sm"
            variant="quiet"
            onPress={onOpenTablePicker}
            testId="ticket-table-button"
          />
          <TouchButton
            label={`Guests ${guestCount}`}
            icon={Users}
            size="sm"
            variant="quiet"
            onPress={() => onSetGuestCount(guestCount >= 20 ? 1 : guestCount + 1)}
            testId="ticket-guest-button"
          />
          <TouchButton
            label="Discount"
            icon={Percent}
            size="sm"
            variant="quiet"
            onPress={onOpenOrderDiscount}
            testId="ticket-discount-button"
          />
          {hasOrderDiscount && (
            <TouchButton
              label={`Clear ${formatCents(summary.orderDiscountInCents)}`}
              icon={Percent}
              size="sm"
              variant="ghost"
              onPress={() => onApplyOrderDiscount(0)}
              testId="ticket-clear-discount-button"
            />
          )}
        </div>

        <div
          role="radiogroup"
          aria-label="Dining option"
          data-testid="ticket-dining-options"
          className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-canvas-raised p-1"
        >
          {DINING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={diningOption === option.value}
              onClick={() => onSetDiningOption(option.value)}
              data-testid={`ticket-dining-${option.value}`}
              data-active={diningOption === option.value}
              className={cn(
                'min-h-11 rounded-lg px-1 text-[10px] font-bold uppercase tracking-wide transition-transform duration-75 active:scale-95',
                diningOption === option.value
                  ? 'bg-primary text-primary-contrast'
                  : 'text-ink-muted active:bg-surface-raised active:text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="scrollbar-tactical min-h-0 flex-1 overflow-y-auto p-3">
        {hasItems ? (
          <ul data-testid="ticket-rows" className="space-y-2">
            {lineItems.map((lineItem, index) => (
              <li key={lineItem.clientLineItemId}>
                <TicketLineItem
                  lineItem={lineItem}
                  position={index + 1}
                  onIncrement={onIncrementQuantity}
                  onRemove={onRemoveItem}
                  onEdit={onEditLineItem}
                  onDiscount={(clientLineItemId) =>
                    onOpenItemDiscount
                      ? onOpenItemDiscount(clientLineItemId)
                      : onApplyItemDiscount(clientLineItemId, DEFAULT_LINE_DISCOUNT_IN_CENTS)
                  }
                  compact
                />
              </li>
            ))}
          </ul>
        ) : (
          <div
            data-testid="ticket-empty"
            className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 text-center"
          >
            <ClipboardList className="h-10 w-10 text-ink-subtle" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-ink">No items yet</p>
              <p className="mt-1 font-mono text-xs text-ink-subtle">
                Tap a catalog item to start this ticket.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="safe-bottom shrink-0 space-y-3 border-t border-line bg-canvas-raised p-3">
        <div className="space-y-1.5">
          <SummaryRow label={`Subtotal (${summary.itemsCount})`} amountInCents={summary.rawSubtotalInCents} testId="ticket-subtotal" />

          {summary.itemDiscountsInCents > 0 && (
            <SummaryRow
              label="Item discounts"
              amountInCents={-summary.itemDiscountsInCents}
              tone="tender"
              testId="ticket-item-discounts"
            />
          )}

          {hasOrderDiscount && (
            <SummaryRow
              label="Order discount"
              amountInCents={-summary.orderDiscountInCents}
              tone="tender"
              testId="ticket-order-discount"
            />
          )}

          <SummaryRow label="Tax" amountInCents={summary.totalTaxInCents} testId="ticket-tax" />

          {summary.totalPaidInCents > 0 && (
            <SummaryRow
              label="Paid"
              amountInCents={-summary.totalPaidInCents}
              tone="muted"
              testId="ticket-paid"
            />
          )}

          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
            <span className="font-mono text-sm font-bold uppercase tracking-widest text-ink">
              {summary.remainingBalanceInCents > 0 ? 'Balance due' : 'Settled'}
            </span>
            <PriceDisplay
              amountInCents={summary.remainingBalanceInCents}
              size="xl"
              tone={summary.remainingBalanceInCents > 0 ? 'primary' : 'success'}
              testId="ticket-total"
            />
          </div>

          <p className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
            Full total {formatCents(summary.finalPayableInCents)} · tax included
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TouchButton
            label="Park"
            icon={ParkingCircle}
            variant="secondary"
            onPress={onParkOrder}
            disabled={!hasItems || isMutating}
            loading={isMutating}
            testId="ticket-park-button"
          />
          <TouchButton
            label={summary.remainingBalanceInCents > 0 ? 'Checkout' : 'Settled'}
            icon={CreditCard}
            variant="primary"
            onPress={onCheckout}
            disabled={!hasItems || isMutating || summary.remainingBalanceInCents <= 0}
            loading={isMutating}
            testId="ticket-checkout-button"
          />
        </div>
      </footer>
    </section>
  );
}