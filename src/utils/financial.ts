import type {
  Cents,
  OrderLineItem,
  OrderSummary,
  PaymentMethod,
  PaymentRecord,
  SelectedModifier,
  UUID,
} from '@/types/pos';
import type { POSDatabase } from '@/db/posDatabase';

/**
 * Pure, dependency-free financial engine.
 *
 * Invariants enforced across the module:
 * - all monetary inputs/outputs are integer cents;
 * - no floating point accumulation — every division result is immediately
 *   rounded with `Math.round` (half-up) before it is stored;
 * - negative totals are clamped to `0` so the register can never display a
 *   negative amount due to over-applied discounts.
 */

const USD_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Round-up denominations used to build the tactical tender ladder, in cents.
 * The ladder always terminates: every step yields a candidate strictly greater
 * than the current maximum, so the filler loop below cannot spin forever.
 */
const QUICK_CASH_STEPS_IN_CENTS: readonly number[] = [500, 1000, 2000, 5000, 10000];

/**
 * Returns `value` when it is a usable number and `fallback` otherwise.
 *
 * `NaN` and `Infinity` are contagious: once either reaches an `OrderRecord` they
 * serialize into IndexedDB and re-emerge as `null`, permanently poisoning the
 * ledger. Every externally supplied figure therefore passes through this guard
 * before it can be summed, prorated or persisted.
 */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Effective tax rate (as a fraction, e.g. `0.0825`) for a ticket row.
 *
 * The row's snapshotted `taxRatePercent` is authoritative. Only rows restored
 * from a database written before the snapshot existed fall back to the derived
 * `taxInCents / subtotalInCents` ratio, which carries the row's own rounding
 * error and is therefore a last resort rather than the normal path.
 */
function resolveTaxRate(item: OrderLineItem): number {
  const snapshottedRate = item.taxRatePercent;

  if (snapshottedRate !== undefined && Number.isFinite(snapshottedRate)) {
    return snapshottedRate / 100;
  }

  const itemSubtotalInCents = finiteOr(item.subtotalInCents, 0);
  return itemSubtotalInCents > 0 ? finiteOr(item.taxInCents, 0) / itemSubtotalInCents : 0;
}

/** Whole units on a row, defaulting to zero rather than propagating `NaN`. */
function resolveQuantity(item: OrderLineItem): number {
  return Math.max(0, Math.floor(finiteOr(item.quantity, 0)));
}

export interface LineItemComputation {
  readonly unitPriceInCents: Cents;
  readonly subtotalInCents: Cents;
  readonly taxInCents: Cents;
  readonly totalInCents: Cents;
}

export const FinancialEngine = {
  /**
   * Computes unit price, subtotal, tax and total for a single ticket row.
   *
   * `itemDiscount` is an absolute cent amount applied to the whole row
   * (line level discount), never a percentage.
   *
   * Every argument is sanitized before use: a non-finite price, modifier
   * delta, quantity, discount or tax rate degrades to a neutral value instead
   * of poisoning the row with `NaN`.
   */
  calculateLineItem(
    basePrice: Cents,
    modifiers: readonly SelectedModifier[],
    quantity: number,
    itemDiscount: Cents,
    taxRatePercent: number,
  ): LineItemComputation {
    const safeBasePrice = Math.max(0, finiteOr(basePrice, 0));
    const safeQuantity = Math.max(1, Math.floor(finiteOr(quantity, 1)));
    const safeDiscount = Math.max(0, finiteOr(itemDiscount, 0));
    const safeTaxRatePercent = finiteOr(taxRatePercent, 0);

    const modifierSum = modifiers.reduce(
      (acc, mod) => acc + finiteOr(mod.priceDeltaInCents, 0),
      0,
    );
    const unitPriceInCents = Math.max(0, safeBasePrice + modifierSum);
    const grossPrice = unitPriceInCents * safeQuantity;
    const subtotalInCents = Math.max(0, grossPrice - safeDiscount);
    const taxInCents = Math.round(subtotalInCents * (safeTaxRatePercent / 100));
    const totalInCents = subtotalInCents + taxInCents;

    return { unitPriceInCents, subtotalInCents, taxInCents, totalInCents };
  },

  /**
   * Rolls the ticket rows up into the register summary.
   *
   * Order level discounts are prorated across rows so that rows carrying
   * different tax rates keep their own effective tax. When the post item
   * discount subtotal is zero the order discount clamps to zero, the proration
   * ratio stays `0`, and no tax is owed.
   *
   * The prorated tax uses the rate **snapshotted on the row** rather than a
   * ratio back-derived from `taxInCents / subtotalInCents`: on small rows that
   * ratio magnifies the row's own rounding, so an order discount could shift
   * tax by a cent that the guest was never quoted. The derived ratio remains
   * only as a fallback for legacy rows that carry no snapshot.
   */
  calculateOrderSummary(
    items: readonly OrderLineItem[],
    orderDiscountInCents: Cents = 0,
    tipInCents: Cents = 0,
    payments: readonly PaymentRecord[] = [],
  ): OrderSummary {
    const safeOrderDiscount = Math.max(0, finiteOr(orderDiscountInCents, 0));
    const safeTip = Math.max(0, finiteOr(tipInCents, 0));

    const itemsCount = items.reduce((acc, item) => acc + resolveQuantity(item), 0);
    const rawSubtotalInCents = items.reduce(
      (acc, item) => acc + finiteOr(item.unitPriceInCents, 0) * resolveQuantity(item),
      0,
    );
    const itemDiscountsInCents = items.reduce(
      (acc, item) => acc + Math.max(0, finiteOr(item.discountInCents, 0)),
      0,
    );

    const subtotalAfterItemDiscounts = Math.max(0, rawSubtotalInCents - itemDiscountsInCents);
    const effectiveOrderDiscount = Math.min(subtotalAfterItemDiscounts, safeOrderDiscount);
    const taxableAmountInCents = subtotalAfterItemDiscounts - effectiveOrderDiscount;

    const discountRatio =
      subtotalAfterItemDiscounts > 0 ? effectiveOrderDiscount / subtotalAfterItemDiscounts : 0;

    const totalTaxInCents = items.reduce((acc, item) => {
      const itemSubtotalInCents = finiteOr(item.subtotalInCents, 0);
      const proratedItemSubtotal = itemSubtotalInCents * (1 - discountRatio);
      const taxRate = resolveTaxRate(item);
      return acc + Math.round(proratedItemSubtotal * taxRate);
    }, 0);

    const finalPayableInCents = taxableAmountInCents + totalTaxInCents + safeTip;
    const totalPaidInCents = payments.reduce(
      (acc, p) => acc + Math.max(0, finiteOr(p.amountInCents, 0)),
      0,
    );
    const remainingBalanceInCents = Math.max(0, finalPayableInCents - totalPaidInCents);

    return {
      itemsCount,
      rawSubtotalInCents,
      itemDiscountsInCents,
      orderDiscountInCents: effectiveOrderDiscount,
      taxableAmountInCents,
      totalTaxInCents,
      tipInCents: safeTip,
      finalPayableInCents,
      totalPaidInCents,
      remainingBalanceInCents,
    };
  },

  /**
   * Builds the four tactical quick tender buttons for the current balance.
   *
   * The candidate set is deduplicated and sorted ascending so the 2x2 grid
   * always presents the exact amount first and progressively larger round-ups.
   * Round balances (`$20.00`, `$50.00`, `$100.00`) collapse most of the raw
   * candidates onto the exact amount, which would leave the grid short of its
   * four-button contract, so the ladder is topped up with the next round-up
   * above the current maximum until exactly four distinct tenders exist.
   */
  computeQuickCashOptions(payableInCents: Cents): readonly Cents[] {
    if (!Number.isFinite(payableInCents) || payableInCents <= 0) return [0];

    const payableDollars = payableInCents / 100;
    const exact = payableInCents;
    const nextFive = Math.ceil(payableDollars / 5) * 5 * 100;
    const nextTen = Math.ceil(payableDollars / 10) * 10 * 100;
    const nextTwenty = Math.ceil(payableDollars / 20) * 20 * 100;
    const nextFifty = Math.ceil(payableDollars / 50) * 50 * 100;
    const nextHundred = Math.ceil(payableDollars / 100) * 100 * 100;

    const rawTenders = [exact, nextFive, nextTen, nextTwenty, nextFifty, nextHundred];
    const uniqueTenders = Array.from(new Set(rawTenders))
      .filter((amount) => amount >= payableInCents)
      .sort((a, b) => a - b);

    while (uniqueTenders.length < 4) {
      const currentMax = uniqueTenders[uniqueTenders.length - 1];
      // `ceil((currentMax + 1) / step) * step` is always strictly greater than
      // `currentMax`, so the ladder advances by at least one cent per round.
      const nextTender = QUICK_CASH_STEPS_IN_CENTS.reduce(
        (smallest, step) => Math.min(smallest, Math.ceil((currentMax + 1) / step) * step),
        Number.POSITIVE_INFINITY,
      );
      uniqueTenders.push(nextTender);
    }

    return uniqueTenders.slice(0, 4);
  },

  /**
   * Creates an immutable payment record.
   *
   * `tenderAmountInCents` is the money physically handed over, which may exceed
   * the applied amount — but only for cash. A card, gift card or wallet tender
   * is settled at exactly `amountInCents`: over-tendering is not a thing at a
   * terminal, and reporting change for it would inflate the drawer with money
   * that was never collected.
   */
  buildPaymentRecord(
    orderId: UUID,
    method: PaymentMethod,
    amountInCents: Cents,
    tenderAmountInCents: Cents,
    transactionReference?: string,
  ): PaymentRecord {
    const appliedAmount = Math.max(0, amountInCents);
    const isCashTender = method === 'cash';
    const effectiveTender = isCashTender ? Math.max(0, tenderAmountInCents) : appliedAmount;
    const changeReturnedInCents = isCashTender
      ? Math.max(0, effectiveTender - appliedAmount)
      : 0;

    return {
      id: createUuid(),
      orderId,
      method,
      amountInCents: appliedAmount,
      tenderAmountInCents: effectiveTender,
      changeReturnedInCents,
      ...(transactionReference ? { transactionReference } : {}),
      processedAt: new Date().toISOString(),
    };
  },

  /**
   * Allocates the next `POS-YYYYMMDD-XXXX` ticket number and **reserves** it.
   *
   * Counting persisted orders alone is not enough: two terminals could both
   * read the same count and mint the same number before either ticket is
   * written. The reservation counter lives in the same read-write transaction,
   * and Dexie serialises overlapping transactions across tabs, so the number is
   * burned the moment it is handed out. The probe loop still closes gaps left by
   * voided tickets.
   */
  async generateOrderNumber(posDb: POSDatabase): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `POS-${year}${month}${day}`;

    return await posDb.transaction('rw', [posDb.orders, posDb.counters], async () => {
      const reservation = await posDb.counters.get(datePrefix);
      const persistedCount = await posDb.orders.where('orderNumber').startsWith(datePrefix).count();

      let sequence = Math.max(reservation?.value ?? 0, persistedCount) + 1;
      let orderCandidate = `${datePrefix}-${String(sequence).padStart(4, '0')}`;

      // Loop handles sequence gaps from voided orders on the same day.
      // eslint-disable-next-line no-await-in-loop -- sequential index probing is intentional
      while (await posDb.orders.where('orderNumber').equals(orderCandidate).first()) {
        sequence += 1;
        orderCandidate = `${datePrefix}-${String(sequence).padStart(4, '0')}`;
      }

      await posDb.counters.put({
        key: datePrefix,
        value: sequence,
        updatedAt: now.toISOString(),
      });

      return orderCandidate;
    });
  },
} as const;

/** Formats integer cents as a US currency string, e.g. `1450` -> `$14.50`. */
export function formatCents(cents: Cents): string {
  return USD_CURRENCY_FORMATTER.format((Number.isFinite(cents) ? cents : 0) / 100);
}

/**
 * Formats cents without the currency symbol, e.g. `1450` -> `14.50`.
 * Used by the numpad display and editable money inputs.
 */
export function formatCentsPlain(cents: Cents): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safe < 0 ? '-' : '';
  const absolute = Math.abs(safe);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

/** Formats a signed delta, e.g. `-300` -> `-$3.00`, used by discount rows. */
export function formatCentsDelta(cents: Cents): string {
  if (cents === 0) return formatCents(0);
  return cents < 0 ? `-${formatCents(Math.abs(cents))}` : `+${formatCents(cents)}`;
}

/**
 * Parses a user typed money string into integer cents.
 *
 * Accepts `12`, `12.5`, `12.50`, `$12.50`. Repeated decimal points are collapsed
 * inside the fractional part before truncation, so `12.3.4` reads as `$12.34`
 * instead of silently dropping the typed digit; only the first two fractional
 * digits are significant and returns `0` for unusable input.
 */
export function parseMoneyInputToCents(rawInput: string): Cents {
  const sanitized = rawInput.replace(/[^0-9.]/g, '');
  if (sanitized.length === 0) return 0;

  const firstDotIndex = sanitized.indexOf('.');
  if (firstDotIndex === -1) {
    return Math.max(0, Math.round(Number.parseInt(sanitized, 10) * 100));
  }

  const wholePart = sanitized.slice(0, firstDotIndex) || '0';
  const rawFraction = sanitized.slice(firstDotIndex + 1).replace(/\./g, '');
  const fractionPart = rawFraction.slice(0, 2).padEnd(2, '0');
  const whole = Number.parseInt(wholePart, 10);
  const fraction = Number.parseInt(fractionPart, 10);

  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return 0;
  return Math.max(0, whole * 100 + fraction);
}

/** Renders a single modifier selection set as one human readable line. */
export function describeModifiers(modifiers: readonly SelectedModifier[]): string {
  if (modifiers.length === 0) return 'No modifiers';
  return modifiers.map((modifier) => modifier.optionName).join(' · ');
}

let uuidFallbackCounter = 0;

/**
 * Cryptographically strong identifier.
 *
 * Uses `crypto.randomUUID()` when available and falls back to
 * `crypto.getRandomValues()`. The last-resort branch (no Web Crypto at all)
 * uses a monotonic counter rather than a pseudo-random generator, which is
 * predictable and therefore unsuitable for payment and ticket identifiers.
 *
 * That counter branch still has to emit a *syntactically valid* RFC 4122
 * version 4 UUID: order numbers, payment records and table keys are matched by
 * that shape in reports and integrations, and a bespoke `id-<base36>` string
 * breaks every consumer that expects 8-4-4-4-12 hex.
 */
export function createUuid(): UUID {
  const cryptoRef: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    return formatUuidBytes(
      cryptoRef.getRandomValues(new Uint8Array(16)),
    );
  }

  uuidFallbackCounter += 1;
  // 8 bytes of millisecond timestamp followed by 8 bytes of monotonic counter:
  // no entropy, but strictly increasing, so two ids minted by one terminal can
  // never collide the way a repeated `Date.now()` alone could.
  const timestampHex = Date.now().toString(16).padStart(16, '0').slice(-16);
  const counterHex = uuidFallbackCounter.toString(16).padStart(16, '0').slice(-16);
  return formatUuidBytes(hexToBytes(`${timestampHex}${counterHex}`));
}

/** Renders 16 bytes as a version 4, variant 1 UUID in 8-4-4-4-12 hex form. */
function formatUuidBytes(bytes: Uint8Array): UUID {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Parses a hex string of even length into bytes, padding an odd tail with 0. */
function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16) || 0;
  }

  return bytes;
}

/**
 * Builds an acquirer-style authorization reference from Web Crypto entropy.
 * Used for card-present tenders; cash tenders carry no reference.
 */
export function createTransactionReference(prefix = 'AUTH'): string {
  const cryptoRef: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(8));
    const token = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 10)
      .toUpperCase();
    return `${prefix}-${token}`;
  }

  uuidFallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${uuidFallbackCounter.toString(36)}`.toUpperCase();
}