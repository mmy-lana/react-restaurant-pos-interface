# Architecture Specification: Restaurant Point-of-Sale (POS) Touch Interface

- Project Title: Restaurant Point-of-Sale (POS) Touch Interface
- Slug / Repository: `react-restaurant-pos-interface`
- Primary Stack: React (latest), TypeScript (latest with `"lib": ["DOM", "DOM.Iterable", "ES2022"]`), Tailwind CSS (v4 via CSS `@theme` directives in `src/styles/globals.css`, no `tailwind.config.ts`), Dexie.js (latest), Immer (latest), Lucide React (latest)
- Form Factor Target: iPad / Tablet Landscape (1024px x 768px, 11-inch/12.9-inch 1366px x 1024px) with adaptive responsive support for 360px-430px mobile and 1024px+ desktop.
- Design System: Dark mode, high-contrast tactical kitchen/cashier grid (`zinc-950` canvas, `zinc-900` card fills, `emerald-500` primary action, `amber-500` tender alerts, `rose-500` voids, `tabular-nums font-mono` pricing figures).

---

## 1. Data Schema & Pure TypeScript Interfaces

```typescript
export type UUID = string;
export type Cents = number; // Integer-only monetary representation (e.g., $14.50 = 1450)
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
  readonly minSelections: number; // 0 for optional, 1+ for mandatory
  readonly maxSelections: number; // 1 for single-choice (radio), >1 for multi-choice
  readonly options: readonly ModifierOption[];
}

export interface MenuItem {
  readonly id: UUID;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: UUID;
  readonly priceInCents: Cents;
  readonly taxRatePercent: number; // e.g., 8.25 for 8.25%
  readonly modifierGroups: readonly ModifierGroup[];
  readonly isAvailable: boolean;
  readonly preparationMinutes: number;
  readonly barcode?: string;
  readonly colorTag?: string; // Hex fallback or Tailwind token
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
  readonly clientLineItemId: UUID; // Generated client-side for item uniqueness in ticket
  readonly menuItemId: UUID;
  readonly name: string;
  readonly basePriceInCents: Cents;
  readonly selectedModifiers: readonly SelectedModifier[];
  readonly quantity: number;
  readonly discountInCents: Cents;
  readonly specialInstructions: string;
  readonly unitPriceInCents: Cents; // basePriceInCents + sum(modifiers.priceDeltaInCents)
  readonly subtotalInCents: Cents; // (unitPriceInCents * quantity) - discountInCents
  readonly taxInCents: Cents; // subtotalInCents * (taxRatePercent / 100)
  readonly totalInCents: Cents; // subtotalInCents + taxInCents
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
  readonly version: number; // Optimistic lock counter
}

export interface OrderCategory {
  readonly id: UUID;
  readonly name: string;
  readonly sortOrder: number;
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
  readonly orderNumber: string; // Format: POS-YYYYMMDD-XXXX
  readonly diningOption: DiningOption;
  readonly tableId?: UUID;
  readonly guestCount: number;
  readonly status: OrderStatus;
  readonly lineItems: readonly OrderLineItem[];
  readonly summary: OrderSummary;
  readonly payments: readonly PaymentRecord[];
  readonly cashierId: UUID;
  readonly note?: string;
  readonly version: number; // Optimistic lock counter
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

// Mutable DB record variants to satisfy Dexie read/write contracts
export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T[P] extends object
    ? DeepMutable<T[P]>
    : T[P];
};

export type MenuItemRecord = DeepMutable<MenuItem>;
export type OrderRecord = DeepMutable<Order>;
export type DiningTableRecord = DeepMutable<DiningTable>;
export type CashierSessionRecord = DeepMutable<CashierSession>;
export type OrderCategoryRecord = DeepMutable<OrderCategory>;
```

---

## 2. Storage & State Management Architecture

### 2.1 IndexedDB Schema (Dexie.js)
```typescript
import Dexie, { type Table } from 'dexie';

export class POSDatabase extends Dexie {
  menuItems!: Table<MenuItemRecord, string>;
  categories!: Table<OrderCategoryRecord, string>;
  orders!: Table<OrderRecord, string>;
  tables!: Table<DiningTableRecord, string>;
  sessions!: Table<CashierSessionRecord, string>;

  constructor() {
    super('RestaurantPOS_DB');
    this.version(1).stores({
      menuItems: 'id, sku, categoryId, isAvailable',
      categories: 'id, sortOrder',
      orders: 'id, &orderNumber, status, diningOption, tableId, version, createdAt, completedAt',
      tables: 'id, status, section, version',
      sessions: 'id, cashierId, openedAt, closedAt'
    });
  }
}

// Singleton database instance with zero React/Context imports
export const db = new POSDatabase();

export async function saveOrderWithOptimisticLock(
  posDb: POSDatabase,
  targetOrder: OrderRecord,
  tableUpdate?: { tableId: UUID; release: boolean }
): Promise<void> {
  await posDb.transaction('rw', posDb.orders, posDb.tables, async () => {
    const existing = await posDb.orders.get(targetOrder.id);
    if (existing && existing.version !== targetOrder.version) {
      throw new Error(`CONCURRENCY_ERROR: Order ${targetOrder.id} version mismatch (current: ${existing.version}, target: ${targetOrder.version})`);
    }

    await posDb.orders.put({
      ...targetOrder,
      version: targetOrder.version + 1,
      updatedAt: new Date().toISOString()
    });

    if (tableUpdate) {
      const table = await posDb.tables.get(tableUpdate.tableId);
      if (table) {
        await posDb.tables.put({
          ...table,
          status: tableUpdate.release ? 'available' : 'occupied',
          activeOrderId: tableUpdate.release ? undefined : targetOrder.id,
          version: table.version + 1
        });
      }
    }
  });
}
```

### 2.2 Global POS State Architecture
The client runtime uses an Immer-driven single-source-of-truth active transaction state.

```typescript
export interface ActivePOSState {
  isLoading: boolean;
  seedError: string | null;
  currentOrder: DeepMutable<Order>;
  selectedCategory: UUID | 'all';
  searchQuery: string;
  activeModal: 'none' | 'modifier' | 'payment' | 'table_picker' | 'numpad_discount' | 'order_history';
  stagedMenuItem: MenuItem | null;
  stagedModifierDraft: Record<UUID, UUID[]>; // Group ID -> Selected Option IDs
  stagedLineItemIndex: number | null;
  isNumpadOpen: boolean;
  numpadValue: string;
  activeSession: DeepMutable<CashierSession> | null;
}

export type POSAction =
  | { type: 'SELECT_CATEGORY'; payload: UUID | 'all' }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'OPEN_MODIFIER_MODAL'; payload: MenuItem }
  | { type: 'CLOSE_MODAL' }
  | { type: 'ADD_ITEM_DIRECT'; payload: MenuItem }
  | { type: 'ADD_STAGED_ITEM'; payload: { menuItem: MenuItem; modifiers: SelectedModifier[]; quantity: number; note: string } }
  | { type: 'UPDATE_ITEM_QUANTITY'; payload: { clientLineItemId: UUID; delta: number } }
  | { type: 'REMOVE_ITEM'; payload: { clientLineItemId: UUID } }
  | { type: 'APPLY_ITEM_DISCOUNT'; payload: { clientLineItemId: UUID; discountInCents: Cents } }
  | { type: 'APPLY_ORDER_DISCOUNT'; payload: { discountInCents: Cents } }
  | { type: 'SET_DINING_OPTION'; payload: DiningOption }
  | { type: 'ASSIGN_TABLE'; payload: { tableId: UUID; label: string } }
  | { type: 'PROCESS_PAYMENT'; payload: PaymentRecord }
  | { type: 'PARK_ORDER' }
  | { type: 'NEW_ORDER' }
  | { type: 'RESTORE_ORDER'; payload: Order };
```

---

## 3. Core Feature Logic & Pure Math Engines

### 3.1 Financial Calculation Engine
All calculations use integer cents with banker's rounding (`Math.round`) to prevent floating-point drift.

```typescript
export class FinancialEngine {
  public static calculateLineItem(
    basePrice: Cents,
    modifiers: readonly SelectedModifier[],
    quantity: number,
    itemDiscount: Cents,
    taxRatePercent: number
  ): {
    unitPriceInCents: Cents;
    subtotalInCents: Cents;
    taxInCents: Cents;
    totalInCents: Cents;
  } {
    const modifierSum = modifiers.reduce((acc, mod) => acc + mod.priceDeltaInCents, 0);
    const unitPriceInCents = Math.max(0, basePrice + modifierSum);
    const grossPrice = unitPriceInCents * quantity;
    const subtotalInCents = Math.max(0, grossPrice - itemDiscount);
    const taxInCents = Math.round(subtotalInCents * (taxRatePercent / 100));
    const totalInCents = subtotalInCents + taxInCents;

    return { unitPriceInCents, subtotalInCents, taxInCents, totalInCents };
  }

  public static calculateOrderSummary(
    items: readonly OrderLineItem[],
    orderDiscountInCents: Cents = 0,
    tipInCents: Cents = 0,
    payments: readonly PaymentRecord[] = []
  ): OrderSummary {
    const itemsCount = items.reduce((acc, item) => acc + item.quantity, 0);
    const rawSubtotalInCents = items.reduce((acc, item) => acc + (item.unitPriceInCents * item.quantity), 0);
    const itemDiscountsInCents = items.reduce((acc, item) => acc + item.discountInCents, 0);

    const subtotalAfterItemDiscounts = Math.max(0, rawSubtotalInCents - itemDiscountsInCents);
    const effectiveOrderDiscount = Math.min(subtotalAfterItemDiscounts, orderDiscountInCents);
    const taxableAmountInCents = subtotalAfterItemDiscounts - effectiveOrderDiscount;

    // Prorate order discount across items to accurately recalculate item-specific tax
    // When subtotalAfterItemDiscounts is 0, effectiveOrderDiscount is clamped to 0, ratio stays 0, no tax is owed.
    const discountRatio = subtotalAfterItemDiscounts > 0 ? effectiveOrderDiscount / subtotalAfterItemDiscounts : 0;
    const totalTaxInCents = items.reduce((acc, item) => {
      const proratedItemSubtotal = item.subtotalInCents * (1 - discountRatio);
      const taxRate = item.subtotalInCents > 0 ? item.taxInCents / item.subtotalInCents : 0;
      return acc + Math.round(proratedItemSubtotal * taxRate);
    }, 0);

    const finalPayableInCents = taxableAmountInCents + totalTaxInCents + tipInCents;
    const totalPaidInCents = payments.reduce((acc, p) => acc + p.amountInCents, 0);
    const remainingBalanceInCents = Math.max(0, finalPayableInCents - totalPaidInCents);

    return {
      itemsCount,
      rawSubtotalInCents,
      itemDiscountsInCents,
      orderDiscountInCents: effectiveOrderDiscount,
      taxableAmountInCents,
      totalTaxInCents,
      tipInCents,
      finalPayableInCents,
      totalPaidInCents,
      remainingBalanceInCents,
    };
  }

  public static computeQuickCashOptions(payableInCents: Cents): readonly Cents[] {
    if (payableInCents <= 0) return [0];

    const payableDollars = payableInCents / 100;
    const exact = payableInCents;
    const nextFive = Math.ceil(payableDollars / 5) * 5 * 100;
    const nextTen = Math.ceil(payableDollars / 10) * 10 * 100;
    const nextTwenty = Math.ceil(payableDollars / 20) * 20 * 100;
    const nextFifty = Math.ceil(payableDollars / 50) * 50 * 100;
    const nextHundred = Math.ceil(payableDollars / 100) * 100 * 100;

    const rawTenders = [exact, nextFive, nextTen, nextTwenty, nextFifty, nextHundred];
    const uniqueTenders = Array.from(new Set(rawTenders)).filter(amount => amount >= payableInCents);
    // Keep exactly 4 tactical quick-cash tender buttons for a balanced 2x2 grid layout
    return uniqueTenders.sort((a, b) => a - b).slice(0, 4);
  }

  public static buildPaymentRecord(
    orderId: UUID,
    method: PaymentMethod,
    amountInCents: Cents,
    tenderAmountInCents: Cents,
    transactionReference?: string
  ): PaymentRecord {
    const changeReturnedInCents = Math.max(0, tenderAmountInCents - amountInCents);
    return {
      id: crypto.randomUUID(),
      orderId,
      method,
      amountInCents,
      tenderAmountInCents,
      changeReturnedInCents,
      transactionReference,
      processedAt: new Date().toISOString(),
    };
  }

  public static async generateOrderNumber(posDb: POSDatabase): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `POS-${year}${month}${day}`;

    return await posDb.transaction('rw', posDb.orders, async () => {
      const existingCount = await posDb.orders
        .where('orderNumber')
        .startsWith(datePrefix)
        .count();

      let sequence = existingCount + 1;
      let orderCandidate = `${datePrefix}-${String(sequence).padStart(4, '0')}`;

      // Loop handles sequence gaps from voided orders on the same day.
      while (await posDb.orders.where('orderNumber').equals(orderCandidate).first()) {
        sequence += 1;
        orderCandidate = `${datePrefix}-${String(sequence).padStart(4, '0')}`;
      }

      return orderCandidate;
    });
  }
}
```

### 3.2 Audio & Haptic Feedback Controller
Synthesizes auditory cues via Web Audio API without network asset dependencies, guarded against SSR environments.

```typescript
export class AudioFeedback {
  private static ctx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (AudioContextConstructor) {
        this.ctx = new AudioContextConstructor();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public static triggerBeep(freq = 600, duration = 0.04, type: OscillatorType = 'sine'): void {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(12);
      }
    } catch {
      // Audio execution safely ignored in unauthenticated/headless contexts
    }
  }

  public static playSuccess(): void {
    this.triggerBeep(880, 0.05, 'triangle');
    setTimeout(() => this.triggerBeep(1320, 0.08, 'sine'), 50);
  }

  public static playWarning(): void {
    this.triggerBeep(240, 0.15, 'sawtooth');
  }
}
```

---

## 4. Component Architecture Hierarchy

```
src/
├── components/
│   ├── primitives/
│   │   ├── TouchButton.tsx           # Minimum 48px tactile button with active scale feedback (:active:scale-95)
│   │   ├── PriceDisplay.tsx          # Tabular numerals (tabular-nums font-mono) cents-to-currency formatter
│   │   ├── Badge.tsx                 # Status and modifier counters
│   │   ├── ModalShell.tsx            # Overlay with backdrop blur and touch dismiss
│   │   └── SearchInput.tsx           # Large high-contrast touch input with clear trigger
│   ├── molecules/
│   │   ├── CategoryPill.tsx          # Horizontal scrollable category pill button with selection highlight
│   │   ├── ProductTile.tsx           # Item grid card with stock indicators and price badge
│   │   ├── TicketLineItem.tsx        # Order summary row with quantity triggers and modifiers (key=clientLineItemId)
│   │   ├── NumpadGrid.tsx            # 12-key tactile touch keypad (0-9, backspace, clear)
│   │   └── QuickCashButtons.tsx      # 2x2 grid containing 4 calculated quick tender buttons
│   ├── organisms/
│   │   ├── CatalogGrid.tsx           # Responsive CSS Grid for products
│   │   ├── ActiveOrderTicket.tsx     # Running register panel with scroll lock and subtotaling
│   │   ├── ModifierSelectionModal.tsx# Single/multiple modifier validation modal using stagedModifierDraft
│   │   ├── PaymentCheckoutModal.tsx  # Tender intake, change calculator, method selector
│   │   ├── TableManagementDrawer.tsx # Floor plan table layout selection grid
│   │   └── TopNavigationHeader.tsx   # Register session info, order status, connection status
│   └── templates/
│       └── POSLayoutShell.tsx        # Split layout (Catalog Left, Ticket Right on iPad)
```

---

## 5. Responsive Shell & Touch Adaptation Matrix

| Breakpoint | Window Width | Layout Strategy | Ticket Behavior | Catalog Grid |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile S/M** | 360px - 390px | Single-column catalog; sticky order bar at bottom | Bottom drawer sheet (slides up on tap) | 2 columns, compact touch cards (min-height: 100px) |
| **Mobile L** | 391px - 430px | Single-column catalog; sticky order bar at bottom | Fullscreen overlay sheet upon expanding bottom bar | 2 columns, touch cards (min-height: 110px) |
| **Tablet Portrait** | 768px - 834px | Stacked split layout: 60% catalog height, 40% ticket height | Bottom split pane or docked horizontal drawer | 3 columns, high-contrast badges |
| **iPad Landscape** | 1024px - 1180px | Split screen: 65% Catalog view, 35% Active Ticket view | Fixed right rail, strictly non-overlapping, zero drawer toggling | 3 to 4 columns, expanded tactile cards (min-height: 120px) |
| **Desktop / POS Station** | 1280px+ | Split screen: 70% Catalog view, 30% Active Ticket view | Fixed right rail with embedded instant numpad | 4 to 5 columns with expanded modifier previews |

### Zero Hover Rule
All interactions are strictly engineered for touch:
- No tooltips that require mouse hover.
- Buttons feature `:active:scale-95` and `:active:bg-*` instead of subtle `:hover`.
- All clickable tap zones are bounded to a minimum touch target size of 48px x 48px.

---

## 6. 5-Phase Sequential Implementation Queue

### Phase 1: Types, Storage/API Client Config, and Base Utilities
- [ ] Ensure tsconfig targets `"lib": ["DOM", "DOM.Iterable", "ES2022"]` to satisfy Web Audio constructors.
- [ ] Define exhaustive pure domain interfaces and mutable DB record variants (`src/types/pos.ts`).
- [ ] Implement financial utilities (`src/utils/financial.ts`): Cents conversions, prorated tax calculation, `computeQuickCashOptions` (4 items), `buildPaymentRecord`, and `generateOrderNumber(posDb)`.
- [ ] Setup Dexie.js offline database (`src/db/posDatabase.ts`) as a pure module without React dependencies, defining mutable schema stores and optimistic transaction helper `saveOrderWithOptimisticLock`.
- [ ] Implement Web Audio and Haptic feedback controller (`src/utils/audioFeedback.ts`) with strict SSR guards and safe constructor widening.
- [ ] Create Immer-powered context (`src/context/POSContext.tsx`) with `isLoading: true` gate; execute catalog seed in a try/catch block, recording errors to `seedError: string | null` and setting `isLoading: false` to allow graceful offline/degraded operation.

### Phase 2: Design Foundation & Atomic UI Primitives
- [ ] Configure Tailwind v4 `@theme` directive in `src/styles/globals.css` with dark tactical palette tokens (no legacy `tailwind.config.ts`).
- [ ] Build `TouchButton.tsx`: minimum 48px height, `:active:scale-95`, vibration trigger on tap, loading spinner.
- [ ] Build `PriceDisplay.tsx`: tabular numerals (`tabular-nums font-mono`), cents-to-currency formatting.
- [ ] Build `Badge.tsx`: count badges, preparation timers, table indicator states.
- [ ] Build `SearchInput.tsx`: touch-sized text entry with immediate inline clear button.
- [ ] Build `ModalShell.tsx`: responsive backdrop overlay with physical close button and touch trap.

### Phase 3: Compound Molecules & Feature Components
- [ ] Build `CategoryPill.tsx`: horizontally scrollable container `<div className="overflow-x-auto scrollbar-hide flex gap-2 pb-1">` with `flex-shrink-0 whitespace-nowrap` pills.
- [ ] Build `ProductTile.tsx`: catalog card with availability indicator, displaying title, price, category tag, and modifier requirements badge.
- [ ] Build `TicketLineItem.tsx`: line item row displaying quantity modification triggers (+ / -), modifier summary, and price. Must strictly use `clientLineItemId` as React `key`.
- [ ] Build `NumpadGrid.tsx`: high-contrast 12-key numeric keypad for quantity adjustment, discounts, and custom cash amounts.
- [ ] Build `QuickCashButtons.tsx`: 2x2 grid containing the 4 calculated tender denomination buttons.

### Phase 4: Domain Logic, Reactive State, and Specialized Organisms
- [ ] Build `CatalogGrid.tsx`: dynamic grid integrating search querying and category filtering with empty/fallback states.
- [ ] Implement `ADD_ITEM_DIRECT` reducer guard checking `menuItem.isAvailable`; reject with `AudioFeedback.playWarning()` if unavailable.
- [ ] Build `ActiveOrderTicket.tsx`: running bill calculation, dining option toggle, item clearance, and immediate checkout CTA.
- [ ] Build `ModifierSelectionModal.tsx`: dynamic validation engine using `stagedModifierDraft` state, enforcing `minSelections` and `maxSelections` rules before adding items.
- [ ] Build `PaymentCheckoutModal.tsx`: split payment processing, tender calculation strictly via `FinancialEngine.buildPaymentRecord`, and invoice settlement.
- [ ] Implement async order parking and settlement thunks using `saveOrderWithOptimisticLock` (`order.version`, `table.version`) and active table clearance (`activeOrderId: undefined`).
- [ ] Build `TableManagementDrawer.tsx`: visual selector for restaurant tables with capacity and occupancy indicators.
- [ ] Build `TopNavigationHeader.tsx`: cashier shift status, connectivity indicator, current table identifier, order number display.

### Phase 5: Complete Page/Screen Assembly & Responsive Shell
- [ ] Build `POSLayoutShell.tsx`: responsive layout wrapping top header, main catalog grid, and order ticket rail.
- [ ] Integrate mobile responsive drawer sheet for viewport widths `< 1024px`.
- [ ] Bind keyboard shortcuts for physical scanner integration (Enter to submit, Barcode scanner event listener buffer).
- [ ] Implement order completion persistence flow: write paid order to IndexedDB, release table, reset active ticket.
- [ ] Execute stress testing: 50+ item orders, rapid taps, split payment reconciliations, and responsive viewport validation across 360px, 390px, 430px, 768px, and 1024px+.

docs: compile complete patched architectural blueprint for pos touch interface