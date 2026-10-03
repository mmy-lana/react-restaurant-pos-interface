/**
 * Restaurant POS Touch Interface — canonical domain model.
 *
 * Every monetary value in this application is expressed as an integer number of
 * cents (`Cents`) so that no arithmetic ever touches a floating point value.
 * $14.50 is stored as `1450`.
 */

export type UUID = string;
/** Integer-only monetary representation (e.g. $14.50 = 1450). */
export type Cents = number;
export type ISO8601String = string;

export type DiningOption = 'dine_in' | 'takeout' | 'drive_thru' | 'delivery';
export type OrderStatus = 'draft' | 'parked' | 'sent_to_kitchen' | 'paid' | 'voided';
export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'gift_card' | 'digital_wallet';
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'payment_pending';

export interface ModifierOption {
  readonly id: UUID;
  readonly name: string;
  readonly priceDeltaInCents: Cents;
  readonly isDefault: boolean;
}

export interface ModifierGroup {
  readonly id: UUID;
  readonly name: string;
  /** 0 for optional groups, 1 or more for mandatory groups. */
  readonly minSelections: number;
  /** 1 renders as radio (single choice), greater than 1 renders as multi-choice. */
  readonly maxSelections: number;
  readonly options: readonly ModifierOption[];
}

export interface MenuItem {
  readonly id: UUID;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: UUID;
  readonly priceInCents: Cents;
  /** Percentage value, e.g. `8.25` for 8.25%. */
  readonly taxRatePercent: number;
  readonly modifierGroups: readonly ModifierGroup[];
  readonly isAvailable: boolean;
  readonly preparationMinutes: number;
  readonly barcode?: string;
  /** Hex fallback or Tailwind token used by the catalog tile accent rail. */
  readonly colorTag?: string;
  readonly createdAt: ISO8601String;
  readonly updatedAt: ISO8601String;
}

export interface SelectedModifier {
  readonly modifierGroupId: UUID;
  readonly modifierGroupName: string;
  readonly optionId: UUID;
  readonly optionName: string;
  readonly priceDeltaInCents: Cents;
}

export interface OrderLineItem {
  /** Client generated identifier guaranteeing unique ticket rows. */
  readonly clientLineItemId: UUID;
  readonly menuItemId: UUID;
  readonly name: string;
  readonly basePriceInCents: Cents;
  readonly selectedModifiers: readonly SelectedModifier[];
  readonly quantity: number;
  readonly discountInCents: Cents;
  readonly specialInstructions: string;
  /**
   * Tax rate captured when the row was rung (percentage, e.g. `8.25`).
   *
   * The rate is snapshotted per row instead of being re-read from the catalog
   * so that quantity edits, parked tickets and historical reprints always
   * reproduce the exact figures that were shown to the guest, even after the
   * store changes its tax configuration.
   */
  readonly taxRatePercent: number;
  /** basePriceInCents + sum(modifier.priceDeltaInCents) */
  readonly unitPriceInCents: Cents;
  /** (unitPriceInCents * quantity) - discountInCents */
  readonly subtotalInCents: Cents;
  /** subtotalInCents * (taxRatePercent / 100) */
  readonly taxInCents: Cents;
  /** subtotalInCents + taxInCents */
  readonly totalInCents: Cents;
}

export interface PaymentRecord {
  readonly id: UUID;
  readonly orderId: UUID;
  readonly method: PaymentMethod;
  readonly amountInCents: Cents;
  readonly tenderAmountInCents: Cents;
  readonly changeReturnedInCents: Cents;
  readonly transactionReference?: string;
  readonly processedAt: ISO8601String;
}

export interface DiningTable {
  readonly id: UUID;
  readonly label: string;
  readonly section: 'main_floor' | 'patio' | 'bar';
  readonly capacity: number;
  readonly status: TableStatus;
  readonly activeOrderId?: UUID;
  /** Optimistic lock counter. */
  readonly version: number;
}

export interface OrderCategory {
  readonly id: UUID;
  readonly name: string;
  readonly sortOrder: number;
  /** Key of the lucide-react icon rendered on the category pill. */
  readonly iconIdentifier: string;
}

export interface OrderSummary {
  readonly itemsCount: number;
  readonly rawSubtotalInCents: Cents;
  readonly itemDiscountsInCents: Cents;
  readonly orderDiscountInCents: Cents;
  readonly taxableAmountInCents: Cents;
  readonly totalTaxInCents: Cents;
  readonly tipInCents: Cents;
  readonly finalPayableInCents: Cents;
  readonly totalPaidInCents: Cents;
  readonly remainingBalanceInCents: Cents;
}

export interface Order {
  readonly id: UUID;
  /** Format: `POS-YYYYMMDD-XXXX`. */
  readonly orderNumber: string;
  readonly diningOption: DiningOption;
  readonly tableId?: UUID;
  readonly guestCount: number;
  readonly status: OrderStatus;
  readonly lineItems: readonly OrderLineItem[];
  readonly summary: OrderSummary;
  readonly payments: readonly PaymentRecord[];
  readonly cashierId: UUID;
  readonly note?: string;
  /** Optimistic lock counter. */
  readonly version: number;
  readonly createdAt: ISO8601String;
  readonly updatedAt: ISO8601String;
  readonly completedAt?: ISO8601String;
}

export interface CashierSession {
  readonly id: UUID;
  readonly cashierId: UUID;
  readonly cashierName: string;
  readonly openingFloatInCents: Cents;
  readonly closingFloatInCents?: Cents;
  readonly openedAt: ISO8601String;
  readonly closedAt?: ISO8601String;
  readonly totalCashReceivedInCents: Cents;
  readonly totalCardReceivedInCents: Cents;
  readonly totalGiftCardReceivedInCents: Cents;
  readonly totalDigitalWalletReceivedInCents: Cents;
}

/**
 * Recursively strips `readonly` modifiers so Dexie can hold mutable records
 * while the domain surface stays strictly immutable.
 */
export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T[P] extends object
      ? DeepMutable<T[P]>
      : T[P];
};

/** Mutable DB record variants that satisfy the Dexie read/write contracts. */
export type MenuItemRecord = DeepMutable<MenuItem>;
export type ModifierGroupRecord = DeepMutable<ModifierGroup>;
export type ModifierOptionRecord = DeepMutable<ModifierOption>;
export type OrderRecord = DeepMutable<Order>;
export type OrderLineItemRecord = DeepMutable<OrderLineItem>;
export type SelectedModifierRecord = DeepMutable<SelectedModifier>;
export type PaymentRecordDb = DeepMutable<PaymentRecord>;
export type DiningTableRecord = DeepMutable<DiningTable>;
export type CashierSessionRecord = DeepMutable<CashierSession>;
export type OrderCategoryRecord = DeepMutable<OrderCategory>;