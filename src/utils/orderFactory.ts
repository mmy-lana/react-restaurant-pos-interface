import type {
  Cents,
  DiningOption,
  OrderLineItemRecord,
  OrderRecord,
  OrderSummary,
  SelectedModifier,
  UUID,
} from '@/types/pos';
import { FinancialEngine, createUuid } from '@/utils/financial';

/**
 * Factories for every persisted order aggregate. These helpers are pure: they
 * build or recompute records without touching React state or IndexedDB.
 */

/** Zeroed summary used as the starting point for every fresh ticket. */
export function createEmptyOrderSummary(): OrderSummary {
  return {
    itemsCount: 0,
    rawSubtotalInCents: 0,
    itemDiscountsInCents: 0,
    orderDiscountInCents: 0,
    taxableAmountInCents: 0,
    totalTaxInCents: 0,
    tipInCents: 0,
    finalPayableInCents: 0,
    totalPaidInCents: 0,
    remainingBalanceInCents: 0,
  };
}

export interface CreateEmptyOrderInput {
  readonly orderNumber: string;
  readonly cashierId: UUID;
  readonly diningOption?: DiningOption;
  readonly guestCount?: number;
  readonly tableId?: UUID;
  readonly note?: string;
  readonly id?: UUID;
  readonly createdAt?: string;
}

export function createEmptyOrder(input: CreateEmptyOrderInput): OrderRecord {
  const timestamp = input.createdAt ?? new Date().toISOString();

  return {
    id: input.id ?? createUuid(),
    orderNumber: input.orderNumber,
    diningOption: input.diningOption ?? 'dine_in',
    guestCount: input.guestCount ?? 1,
    status: 'draft',
    lineItems: [],
    summary: createEmptyOrderSummary(),
    payments: [],
    cashierId: input.cashierId,
    ...(input.tableId ? { tableId: input.tableId } : {}),
    ...(input.note ? { note: input.note } : {}),
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface BuildOrderLineItemInput {
  readonly clientLineItemId?: UUID;
  readonly menuItemId: UUID;
  readonly name: string;
  readonly basePriceInCents: Cents;
  readonly taxRatePercent: number;
  readonly modifiers?: readonly SelectedModifier[];
  readonly quantity?: number;
  readonly discountInCents?: Cents;
  readonly specialInstructions?: string;
}

/**
 * Builds a fully computed ticket row. Callers must have already validated menu
 * item availability and modifier group constraints.
 */
export function buildOrderLineItem(input: BuildOrderLineItemInput): OrderLineItemRecord {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const discountInCents = Math.max(0, input.discountInCents ?? 0);
  const modifiers = input.modifiers ?? [];

  const { unitPriceInCents, subtotalInCents, taxInCents, totalInCents } = FinancialEngine.calculateLineItem(
    input.basePriceInCents,
    modifiers,
    quantity,
    discountInCents,
    input.taxRatePercent,
  );

  return {
    clientLineItemId: input.clientLineItemId ?? createUuid(),
    menuItemId: input.menuItemId,
    name: input.name,
    basePriceInCents: input.basePriceInCents,
    selectedModifiers: modifiers.map((modifier) => ({ ...modifier })),
    quantity,
    discountInCents,
    specialInstructions: input.specialInstructions ?? '',
    taxRatePercent: input.taxRatePercent,
    unitPriceInCents,
    subtotalInCents,
    taxInCents,
    totalInCents,
  };
}

/**
 * Recomputes the summary from the ticket rows while preserving the cashier's
 * already-applied order level discount and tip.
 */
export function withRecalculatedSummary(order: OrderRecord): OrderRecord {
  const summary = FinancialEngine.calculateOrderSummary(
    order.lineItems,
    order.summary.orderDiscountInCents,
    order.summary.tipInCents,
    order.payments,
  );

  return { ...order, summary };
}

/**
 * Recomputes a single row after a quantity or discount edit, using the tax rate
 * snapshot carried by the row itself.
 */
export function recomputeLineItem(
  lineItem: OrderLineItemRecord,
  quantity: number,
  discountInCents: Cents,
): OrderLineItemRecord {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const safeDiscount = Math.max(0, discountInCents);
  const { unitPriceInCents, subtotalInCents, taxInCents, totalInCents } = FinancialEngine.calculateLineItem(
    lineItem.basePriceInCents,
    lineItem.selectedModifiers,
    safeQuantity,
    safeDiscount,
    lineItem.taxRatePercent,
  );

  return {
    ...lineItem,
    quantity: safeQuantity,
    discountInCents: safeDiscount,
    unitPriceInCents,
    subtotalInCents,
    taxInCents,
    totalInCents,
  };
}