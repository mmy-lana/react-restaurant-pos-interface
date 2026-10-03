import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { useImmerReducer } from 'use-immer';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  Cents,
  CashierSessionRecord,
  DiningTableRecord,
  DiningOption,
  MenuItem,
  MenuItemRecord,
  Order,
  OrderCategoryRecord,
  OrderRecord,
  PaymentRecord,
  SelectedModifier,
  UUID,
} from '@/types/pos';
import { db, OptimisticLockError, saveOrderWithOptimisticLock } from '@/db/posDatabase';
import { applyPaymentToSessionTotals, seedDatabase } from '@/db/seed';
import { APP_TITLE, DEFAULT_TAX_RATE_PERCENT, STORE_IDENTIFIER } from '@/db/seedData';
import { AudioFeedback } from '@/utils/audioFeedback';
import { FinancialEngine } from '@/utils/financial';
import {
  createInitialModifierDraft,
  resolveModifiersFromDraft,
  toggleModifierOption,
} from '@/utils/modifiers';
import {
  buildOrderLineItem,
  createEmptyOrder,
  createEmptyOrderSummary,
  recomputeLineItem,
} from '@/utils/orderFactory';

/* -------------------------------------------------------------------------- */
/*                                  State shape                                */
/* -------------------------------------------------------------------------- */

export type ActiveModal =
  | 'none'
  | 'modifier'
  | 'payment'
  | 'table_picker'
  | 'numpad_discount'
  | 'order_history';

export type NumpadMode = 'item_quantity' | 'item_discount' | 'order_discount' | 'custom_tender';

export interface ActivePOSState {
  isLoading: boolean;
  seedError: string | null;
  currentOrder: OrderRecord;
  selectedCategory: UUID | 'all';
  searchQuery: string;
  activeModal: ActiveModal;
  stagedMenuItem: MenuItem | null;
  stagedModifierDraft: Record<UUID, UUID[]>;
  stagedLineItemIndex: number | null;
  isNumpadOpen: boolean;
  numpadValue: string;
  activeSession: CashierSessionRecord | null;

  /* ---- documented extensions required by the touch UI ---- */
  /** Next pre-allocated `POS-YYYYMMDD-XXXX` number, minted asynchronously. */
  nextOrderNumber: string;
  /** Denormalized table label so the header can render before the DB write. */
  assignedTableLabel: string | null;
  /** Quantity staged inside the modifier modal. */
  stagedQuantity: number;
  /** Kitchen note staged inside the modifier modal. */
  stagedNote: string;
  /** Which numpad workflow is currently armed. */
  numpadMode: NumpadMode;
  /** Ticket row targeted by the numpad, when applicable. */
  numpadTargetLineItemId: UUID | null;
  /** True while a persistence thunk owns the register. */
  isMutating: boolean;
  /** Last persistence failure, surfaced as a dismissible banner. */
  persistenceError: string | null;
}

export type POSAction =
  | { type: 'SELECT_CATEGORY'; payload: UUID | 'all' }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'OPEN_MODIFIER_MODAL'; payload: MenuItem }
  | { type: 'CLOSE_MODAL' }
  | { type: 'ADD_ITEM_DIRECT'; payload: MenuItem }
  | {
      type: 'ADD_STAGED_ITEM';
      payload: { menuItem: MenuItem; modifiers: SelectedModifier[]; quantity: number; note: string };
    }
  | { type: 'UPDATE_ITEM_QUANTITY'; payload: { clientLineItemId: UUID; delta: number } }
  | { type: 'REMOVE_ITEM'; payload: { clientLineItemId: UUID } }
  | { type: 'APPLY_ITEM_DISCOUNT'; payload: { clientLineItemId: UUID; discountInCents: Cents } }
  | { type: 'APPLY_ORDER_DISCOUNT'; payload: { discountInCents: Cents } }
  | { type: 'SET_DINING_OPTION'; payload: DiningOption }
  | { type: 'ASSIGN_TABLE'; payload: { tableId: UUID; label: string } }
  | { type: 'PROCESS_PAYMENT'; payload: PaymentRecord }
  | { type: 'PARK_ORDER' }
  | { type: 'NEW_ORDER' }
  | { type: 'RESTORE_ORDER'; payload: Order }
  /* ---- UI orchestration actions ---- */
  | { type: 'SET_ACTIVE_MODAL'; payload: ActiveModal }
  | { type: 'UPDATE_STAGED_DRAFT'; payload: { groupId: UUID; optionId: UUID } }
  | { type: 'SET_STAGED_QUANTITY'; payload: number }
  | { type: 'SET_STAGED_NOTE'; payload: string }
  | { type: 'SET_STAGED_LINE_INDEX'; payload: number | null }
  | { type: 'OPEN_NUM_PAD'; payload: { mode: NumpadMode; targetClientLineItemId?: UUID | null } }
  | { type: 'CLOSE_NUM_PAD' }
  | { type: 'SET_NUM_PAD_VALUE'; payload: string }
  | { type: 'APPEND_NUM_PAD_KEY'; payload: string }
  | { type: 'BACKSPACE_NUM_PAD' }
  | { type: 'BOOT_STARTED' }
  | {
      type: 'BOOT_SUCCEEDED';
      payload: { order: OrderRecord; session: CashierSessionRecord; nextOrderNumber: string };
    }
  | { type: 'BOOT_FAILED'; payload: string }
  | { type: 'SET_NEXT_ORDER_NUMBER'; payload: string }
  | {
      type: 'SET_MUTATION_STATE';
      payload: { isMutating: boolean; error?: string | null };
    }
  | { type: 'DISMISS_ERROR' }
  | { type: 'ORDER_COMMITTED'; payload: { version: number; updatedAt: string } }
  | { type: 'REPLACE_ORDER'; payload: OrderRecord }
  | { type: 'SET_GUEST_COUNT'; payload: number }
  | { type: 'SET_ORDER_NOTE'; payload: string };

/* -------------------------------------------------------------------------- */
/*                                Initial state                                */
/* -------------------------------------------------------------------------- */

const BOOT_ORDER_NUMBER = 'POS-00000000-0000';
const BOOT_CASHIER_ID = 'cashier-pending';

export function createInitialPOSState(): ActivePOSState {
  return {
    isLoading: true,
    seedError: null,
    currentOrder: createEmptyOrder({ orderNumber: BOOT_ORDER_NUMBER, cashierId: BOOT_CASHIER_ID }),
    selectedCategory: 'all',
    searchQuery: '',
    activeModal: 'none',
    stagedMenuItem: null,
    stagedModifierDraft: {},
    stagedLineItemIndex: null,
    isNumpadOpen: false,
    numpadValue: '',
    activeSession: null,
    nextOrderNumber: BOOT_ORDER_NUMBER,
    assignedTableLabel: null,
    stagedQuantity: 1,
    stagedNote: '',
    numpadMode: 'item_quantity',
    numpadTargetLineItemId: null,
    isMutating: false,
    persistenceError: null,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Reducer                                    */
/* -------------------------------------------------------------------------- */

function refreshSummary(order: OrderRecord): void {
  order.summary = FinancialEngine.calculateOrderSummary(
    order.lineItems,
    order.summary.orderDiscountInCents,
    order.summary.tipInCents,
    order.payments,
  );
  order.updatedAt = new Date().toISOString();
}

function isBareRow(row: OrderRecord['lineItems'][number]): boolean {
  return (
    row.selectedModifiers.length === 0 &&
    row.discountInCents === 0 &&
    row.specialInstructions.trim().length === 0
  );
}

export function posReducer(state: ActivePOSState, action: POSAction): ActivePOSState {
  switch (action.type) {
    /* ----------------------------- boot ------------------------------ */
    case 'BOOT_STARTED': {
      state.isLoading = true;
      state.seedError = null;
      return state;
    }

    case 'BOOT_SUCCEEDED': {
      state.isLoading = false;
      state.seedError = null;
      state.currentOrder = action.payload.order;
      state.activeSession = action.payload.session;
      state.nextOrderNumber = action.payload.nextOrderNumber;
      state.assignedTableLabel = null;
      return state;
    }

    case 'BOOT_FAILED': {
      state.isLoading = false;
      state.seedError = action.payload;
      return state;
    }

    case 'SET_NEXT_ORDER_NUMBER': {
      state.nextOrderNumber = action.payload;
      return state;
    }

    /* ---------------------------- browsing --------------------------- */
    case 'SELECT_CATEGORY': {
      state.selectedCategory = action.payload;
      return state;
    }

    case 'SET_SEARCH_QUERY': {
      state.searchQuery = action.payload;
      return state;
    }

    /* ----------------------------- modals ---------------------------- */
    case 'SET_ACTIVE_MODAL': {
      state.activeModal = action.payload;
      if (action.payload !== 'modifier') {
        state.stagedMenuItem = null;
        state.stagedModifierDraft = {};
        state.stagedLineItemIndex = null;
      }
      return state;
    }

    case 'CLOSE_MODAL': {
      state.activeModal = 'none';
      state.stagedMenuItem = null;
      state.stagedModifierDraft = {};
      state.stagedLineItemIndex = null;
      state.stagedQuantity = 1;
      state.stagedNote = '';
      state.isNumpadOpen = false;
      return state;
    }

    case 'OPEN_MODIFIER_MODAL': {
      state.stagedMenuItem = action.payload;
      state.stagedModifierDraft = createInitialModifierDraft(action.payload);
      state.stagedQuantity = 1;
      state.stagedNote = '';
      state.stagedLineItemIndex = null;
      state.activeModal = 'modifier';
      return state;
    }

    case 'UPDATE_STAGED_DRAFT': {
      const item = state.stagedMenuItem;
      if (!item) return state;

      const group = item.modifierGroups.find((candidate) => candidate.id === action.payload.groupId);
      if (!group) return state;

      state.stagedModifierDraft = toggleModifierOption(
        state.stagedModifierDraft,
        group,
        action.payload.optionId,
      );
      return state;
    }

    case 'SET_STAGED_QUANTITY': {
      state.stagedQuantity = Math.max(1, Math.min(99, Math.floor(action.payload)));
      return state;
    }

    case 'SET_STAGED_NOTE': {
      state.stagedNote = action.payload;
      return state;
    }

    case 'SET_STAGED_LINE_INDEX': {
      state.stagedLineItemIndex = action.payload;
      return state;
    }

    /* ----------------------------- numpad ---------------------------- */
    case 'OPEN_NUM_PAD': {
      state.isNumpadOpen = true;
      state.numpadMode = action.payload.mode;
      state.numpadTargetLineItemId = action.payload.targetClientLineItemId ?? null;
      state.numpadValue = '';
      state.activeModal = action.payload.mode === 'order_discount' ? 'numpad_discount' : state.activeModal;
      return state;
    }

    case 'CLOSE_NUM_PAD': {
      state.isNumpadOpen = false;
      state.numpadValue = '';
      state.numpadTargetLineItemId = null;
      if (state.activeModal === 'numpad_discount') state.activeModal = 'none';
      return state;
    }

    case 'SET_NUM_PAD_VALUE': {
      state.numpadValue = action.payload;
      return state;
    }

    case 'APPEND_NUM_PAD_KEY': {
      const key = action.payload;
      const isDot = key === '.';
      const current = state.numpadValue;

      if (isDot && current.includes('.')) return state;
      if (current.includes('.') && current.split('.')[1]?.length >= 2) return state;
      if (current === '0' && !isDot) {
        state.numpadValue = key;
        return state;
      }

      state.numpadValue = `${current}${key}`.slice(0, 9);
      return state;
    }

    case 'BACKSPACE_NUM_PAD': {
      state.numpadValue = state.numpadValue.slice(0, -1);
      return state;
    }

    /* ------------------------------ ticket --------------------------- */
    case 'ADD_ITEM_DIRECT': {
      const menuItem = action.payload;
      if (!menuItem.isAvailable) return state;

      const order = state.currentOrder;
      const existingRow = order.lineItems.find(
        (row) => row.menuItemId === menuItem.id && isBareRow(row),
      );

      if (existingRow) {
        Object.assign(
          existingRow,
          recomputeLineItem(existingRow, existingRow.quantity + 1, existingRow.discountInCents),
        );
      } else {
        order.lineItems.push(
          buildOrderLineItem({
            menuItemId: menuItem.id,
            name: menuItem.name,
            basePriceInCents: menuItem.priceInCents,
            taxRatePercent: menuItem.taxRatePercent,
          }),
        );
      }

      refreshSummary(order);
      return state;
    }

    case 'ADD_STAGED_ITEM': {
      const { menuItem, modifiers, quantity, note } = action.payload;
      if (!menuItem.isAvailable) return state;

      const order = state.currentOrder;
      order.lineItems.push(
        buildOrderLineItem({
          menuItemId: menuItem.id,
          name: menuItem.name,
          basePriceInCents: menuItem.priceInCents,
          taxRatePercent: menuItem.taxRatePercent,
          modifiers,
          quantity,
          specialInstructions: note,
        }),
      );

      refreshSummary(order);
      state.activeModal = 'none';
      state.stagedMenuItem = null;
      state.stagedModifierDraft = {};
      state.stagedQuantity = 1;
      state.stagedNote = '';
      return state;
    }

    case 'UPDATE_ITEM_QUANTITY': {
      const order = state.currentOrder;
      const row = order.lineItems.find(
        (candidate) => candidate.clientLineItemId === action.payload.clientLineItemId,
      );
      if (!row) return state;

      const nextQuantity = row.quantity + action.payload.delta;
      if (nextQuantity <= 0) {
        order.lineItems = order.lineItems.filter(
          (candidate) => candidate.clientLineItemId !== action.payload.clientLineItemId,
        );
      } else {
        Object.assign(
          row,
          recomputeLineItem(row, nextQuantity, row.discountInCents),
        );
      }

      refreshSummary(order);
      return state;
    }

    case 'REMOVE_ITEM': {
      const order = state.currentOrder;
      order.lineItems = order.lineItems.filter(
        (candidate) => candidate.clientLineItemId !== action.payload.clientLineItemId,
      );
      refreshSummary(order);
      return state;
    }

    case 'APPLY_ITEM_DISCOUNT': {
      const order = state.currentOrder;
      const row = order.lineItems.find(
        (candidate) => candidate.clientLineItemId === action.payload.clientLineItemId,
      );
      if (!row) return state;

      const grossLineCents = row.unitPriceInCents * row.quantity;
      const safeDiscount = Math.min(Math.max(0, action.payload.discountInCents), grossLineCents);
      Object.assign(row, recomputeLineItem(row, row.quantity, safeDiscount));

      refreshSummary(order);
      return state;
    }

    case 'APPLY_ORDER_DISCOUNT': {
      const order = state.currentOrder;
      const undiscounted = FinancialEngine.calculateOrderSummary(order.lineItems, 0, 0, order.payments);
      const clampedDiscount = Math.min(
        Math.max(0, action.payload.discountInCents),
        undiscounted.taxableAmountInCents,
      );

      order.summary.orderDiscountInCents = clampedDiscount;
      refreshSummary(order);
      return state;
    }

    case 'SET_DINING_OPTION': {
      state.currentOrder.diningOption = action.payload;
      state.currentOrder.updatedAt = new Date().toISOString();
      return state;
    }

    case 'ASSIGN_TABLE': {
      state.currentOrder.tableId = action.payload.tableId;
      state.assignedTableLabel = action.payload.label;
      state.currentOrder.updatedAt = new Date().toISOString();
      return state;
    }

    case 'SET_GUEST_COUNT': {
      state.currentOrder.guestCount = Math.max(1, Math.min(50, Math.floor(action.payload)));
      state.currentOrder.updatedAt = new Date().toISOString();
      return state;
    }

    case 'SET_ORDER_NOTE': {
      state.currentOrder.note = action.payload;
      state.currentOrder.updatedAt = new Date().toISOString();
      return state;
    }

    case 'PROCESS_PAYMENT': {
      const order = state.currentOrder;
      order.payments = [...order.payments, structuredClone(action.payload)];
      refreshSummary(order);
      state.activeModal = 'none';
      state.isNumpadOpen = false;
      state.numpadValue = '';
      return state;
    }

    /* ------------------------- order lifecycle ----------------------- */
    case 'PARK_ORDER': {
      state.currentOrder.status = 'parked';
      return state;
    }

    case 'NEW_ORDER': {
      state.currentOrder = createEmptyOrder({
        orderNumber: state.nextOrderNumber,
        cashierId: state.activeSession?.cashierId ?? BOOT_CASHIER_ID,
        diningOption: state.currentOrder.diningOption,
      });
      state.assignedTableLabel = null;
      state.activeModal = 'none';
      state.isNumpadOpen = false;
      state.numpadValue = '';
      state.stagedMenuItem = null;
      state.stagedModifierDraft = {};
      state.persistenceError = null;
      return state;
    }

    case 'RESTORE_ORDER': {
      const restored = structuredClone(action.payload) as unknown as OrderRecord;
      state.currentOrder = { ...restored, summary: createEmptyOrderSummary() };
      refreshSummary(state.currentOrder);
      state.activeModal = 'none';
      state.assignedTableLabel = null;
      return state;
    }

    case 'REPLACE_ORDER': {
      state.currentOrder = action.payload;
      state.assignedTableLabel = null;
      return state;
    }

    case 'ORDER_COMMITTED': {
      state.currentOrder.version = action.payload.version;
      state.currentOrder.updatedAt = action.payload.updatedAt;
      return state;
    }

    /* ---------------------------- mutations -------------------------- */
    case 'SET_MUTATION_STATE': {
      state.isMutating = action.payload.isMutating;
      state.persistenceError =
        action.payload.error === undefined ? state.persistenceError : action.payload.error;
      return state;
    }

    case 'DISMISS_ERROR': {
      state.persistenceError = null;
      return state;
    }

    default: {
      // Exhaustiveness guard: adding a new action without handling it is a
      // compile-time error thanks to `never` narrowing below.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                Context value                                */
/* -------------------------------------------------------------------------- */

export interface POSCatalogSnapshot {
  readonly categories: readonly OrderCategoryRecord[];
  readonly menuItems: readonly MenuItemRecord[];
  readonly tables: readonly DiningTableRecord[];
  readonly isCatalogLoading: boolean;
}

export interface POSActions {
  readonly selectCategory: (categoryId: UUID | 'all') => void;
  readonly setSearchQuery: (query: string) => void;
  readonly openItem: (menuItem: MenuItem) => void;
  readonly addItemDirect: (menuItem: MenuItem) => void;
  readonly submitStagedItem: () => void;
  readonly toggleStagedModifier: (groupId: UUID, optionId: UUID) => void;
  readonly setStagedQuantity: (quantity: number) => void;
  readonly setStagedNote: (note: string) => void;
  readonly incrementQuantity: (clientLineItemId: UUID, delta: number) => void;
  readonly removeItem: (clientLineItemId: UUID) => void;
  readonly applyItemDiscount: (clientLineItemId: UUID, discountInCents: Cents) => void;
  readonly applyOrderDiscount: (discountInCents: Cents) => void;
  readonly setDiningOption: (diningOption: DiningOption) => void;
  readonly assignTable: (tableId: UUID, label: string) => void;
  readonly openPayment: () => void;
  readonly closeModal: () => void;
  readonly setActiveModal: (modal: ActiveModal) => void;
  readonly openNumpad: (mode: NumpadMode, targetClientLineItemId?: UUID | null) => void;
  readonly closeNumpad: () => void;
  readonly commitNumpadValue: (rawValue: string) => void;
  readonly parkCurrentOrder: () => Promise<void>;
  readonly settleOrder: (payment: PaymentRecord) => Promise<void>;
  readonly startNewOrder: () => Promise<void>;
  readonly restoreOrder: (order: Order) => void;
  readonly retryBoot: () => void;
  readonly dismissError: () => void;
  readonly findMenuItemByBarcode: (barcode: string) => MenuItem | null;
}

export interface POSContextValue {
  readonly state: ActivePOSState;
  readonly dispatch: Dispatch<POSAction>;
  readonly catalog: POSCatalogSnapshot;
  readonly visibleItems: readonly MenuItemRecord[];
  readonly activeTableLabel: string | null;
  readonly storeIdentifier: string;
  readonly appTitle: string;
  readonly defaultTaxRatePercent: number;
  readonly audioMuted: boolean;
  readonly toggleAudioMute: () => void;
  readonly actions: POSActions;
}

export const POSContext = createContext<POSContextValue | null>(null);

const EMPTY_CATEGORIES: readonly OrderCategoryRecord[] = [];
const EMPTY_MENU_ITEMS: readonly MenuItemRecord[] = [];
const EMPTY_TABLES: readonly DiningTableRecord[] = [];
const SECTION_ORDER: readonly DiningTableRecord['section'][] = ['main_floor', 'patio', 'bar'];

function toErrorMessage(error: unknown): string {
  if (error instanceof OptimisticLockError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown persistence failure';
}

export interface POSProviderProps {
  readonly children: ReactNode;
}

export function POSProvider({ children }: POSProviderProps) {
  const [state, dispatch] = useImmerReducer(posReducer, createInitialPOSState());
  const [audioMuted, setAudioMuted] = useState<boolean>(() => {
    AudioFeedback.hydrateMutePreference();
    return AudioFeedback.isMuted();
  });
  const bootInFlight = useRef(false);

  // Only `sortOrder`, `status` and `section` carry Dexie indexes, so menu items
  // and tables are sorted in memory to stay faithful to the blueprint schema.
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const menuItemsRaw = useLiveQuery(() => db.menuItems.toArray(), []);
  const tablesRaw = useLiveQuery(() => db.diningTables.toArray(), []);

  const menuItems = useMemo(
    () =>
      menuItemsRaw
        ? [...menuItemsRaw].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
        : undefined,
    [menuItemsRaw],
  );

  const tables = useMemo(
    () =>
      tablesRaw
        ? [...tablesRaw].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
        : undefined,
    [tablesRaw],
  );

  const catalog: POSCatalogSnapshot = useMemo(
    () => ({
      categories: categories ?? EMPTY_CATEGORIES,
      menuItems: menuItems ?? EMPTY_MENU_ITEMS,
      tables: tables ?? EMPTY_TABLES,
      isCatalogLoading: categories === undefined || menuItems === undefined || tables === undefined,
    }),
    [categories, menuItems, tables],
  );

  /* ---------------------------------------------------------------- boot */

  const runBoot = useCallback(async () => {
    if (bootInFlight.current) return;
    bootInFlight.current = true;

    dispatch({ type: 'BOOT_STARTED' });

    try {
      const report = await seedDatabase(db);
      const orderNumber = await FinancialEngine.generateOrderNumber(db);

      const order = createEmptyOrder({
        orderNumber,
        cashierId: report.session.cashierId,
        guestCount: 1,
      });

      dispatch({
        type: 'BOOT_SUCCEEDED',
        payload: { order, session: report.session, nextOrderNumber: orderNumber },
      });

      AudioFeedback.hydrateMutePreference();
    } catch (error) {
      dispatch({ type: 'BOOT_FAILED', payload: toErrorMessage(error) });
      AudioFeedback.playWarning();
    } finally {
      bootInFlight.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    AudioFeedback.installGestureUnlock();
    void runBoot();
  }, [runBoot]);

  /* ------------------------------------------------------- persistence  */

  const mintNextOrderNumber = useCallback(async (): Promise<string> => {
    try {
      return await FinancialEngine.generateOrderNumber(db);
    } catch {
      // Sequence minting is best effort: a read failure must never block service.
      return state.nextOrderNumber;
    }
  }, [state.nextOrderNumber]);

  const commitCurrentOrder = useCallback(
    async (
      overrides: Partial<Pick<OrderRecord, 'status' | 'completedAt'>>,
      tableIntent?: { tableId: UUID; release: boolean },
    ): Promise<boolean> => {
      const snapshot = structuredClone(state.currentOrder) as OrderRecord;
      const merged: OrderRecord = {
        ...snapshot,
        ...overrides,
        version: snapshot.version,
        summary: snapshot.summary,
      };

      dispatch({ type: 'SET_MUTATION_STATE', payload: { isMutating: true, error: null } });

      try {
        await saveOrderWithOptimisticLock(db, merged, tableIntent);
        dispatch({
          type: 'ORDER_COMMITTED',
          payload: { version: snapshot.version + 1, updatedAt: new Date().toISOString() },
        });
        return true;
      } catch (error) {
        const message = toErrorMessage(error);
        dispatch({ type: 'SET_MUTATION_STATE', payload: { isMutating: false, error: message } });
        AudioFeedback.playWarning();

        if (error instanceof OptimisticLockError) {
          const authoritative = await db.orders.get(snapshot.id).catch(() => undefined);
          if (authoritative) {
            dispatch({ type: 'REPLACE_ORDER', payload: authoritative });
          }
        }
        return false;
      } finally {
        dispatch({ type: 'SET_MUTATION_STATE', payload: { isMutating: false } });
      }
    },
    [dispatch, state.currentOrder],
  );

  /* ------------------------------------------------------------ actions */

  const startNewOrder = useCallback(async () => {
    const nextNumber = await mintNextOrderNumber();
    dispatch({ type: 'SET_NEXT_ORDER_NUMBER', payload: nextNumber });
    dispatch({ type: 'NEW_ORDER' });
  }, [dispatch, mintNextOrderNumber]);

  const parkCurrentOrder = useCallback(async () => {
    const order = state.currentOrder;
    if (order.lineItems.length === 0) {
      dispatch({
        type: 'SET_MUTATION_STATE',
        payload: { isMutating: false, error: 'Cannot park an empty ticket.' },
      });
      AudioFeedback.playWarning();
      return;
    }

    dispatch({ type: 'PARK_ORDER' });
    const committed = await commitCurrentOrder({ status: 'parked' }, order.tableId ? { tableId: order.tableId, release: true } : undefined);
    if (!committed) return;

    AudioFeedback.playChime();
    await startNewOrder();
  }, [commitCurrentOrder, dispatch, startNewOrder, state.currentOrder]);

  const settleOrder = useCallback(
    async (payment: PaymentRecord) => {
      const order = state.currentOrder;
      const completedAt = new Date().toISOString();

      const committed = await commitCurrentOrder({ status: 'paid', completedAt }, order.tableId ? { tableId: order.tableId, release: true } : undefined);
      if (!committed) return;

      if (state.activeSession) {
        try {
          await applyPaymentToSessionTotals(db, state.activeSession.id, payment.method, payment.amountInCents);
        } catch (error) {
          dispatch({ type: 'SET_MUTATION_STATE', payload: { isMutating: false, error: toErrorMessage(error) } });
        }
      }

      AudioFeedback.playSuccess();
      dispatch({ type: 'SET_MUTATION_STATE', payload: { isMutating: false } });
      await startNewOrder();
    },
    [commitCurrentOrder, dispatch, startNewOrder, state.activeSession, state.currentOrder],
  );

  const commitNumpadValue = useCallback(
    (rawValue: string) => {
      const digits = rawValue.trim();
      if (digits.length === 0) return;

      const targetId = state.numpadTargetLineItemId;
      const mode = state.numpadMode;
      const row = state.currentOrder.lineItems.find((candidate) => candidate.clientLineItemId === targetId);

      switch (mode) {
        case 'item_quantity': {
          if (!row) return;
          const nextQuantity = Math.max(1, Math.min(99, Math.floor(Number.parseFloat(digits) || 1)));
          dispatch({ type: 'UPDATE_ITEM_QUANTITY', payload: { clientLineItemId: row.clientLineItemId, delta: nextQuantity - row.quantity } });
          break;
        }
        case 'item_discount': {
          if (!row) return;
          const cents = Math.round((Number.parseFloat(digits) || 0) * 100);
          dispatch({ type: 'APPLY_ITEM_DISCOUNT', payload: { clientLineItemId: row.clientLineItemId, discountInCents: cents } });
          break;
        }
        case 'order_discount': {
          const cents = Math.round((Number.parseFloat(digits) || 0) * 100);
          dispatch({ type: 'APPLY_ORDER_DISCOUNT', payload: { discountInCents: cents } });
          break;
        }
        case 'custom_tender': {
          // Tender amounts are handled by the payment modal; the numpad here only
          // stages the digits the cashier typed.
          break;
        }
        default:
          break;
      }

      dispatch({ type: 'CLOSE_NUM_PAD' });
      AudioFeedback.triggerBeep(720, 0.04, 'sine');
    },
    [dispatch, state.currentOrder.lineItems, state.numpadMode, state.numpadTargetLineItemId],
  );

  const visibleItems = useMemo(() => {
    const query = state.searchQuery.trim().toLowerCase();

    return catalog.menuItems.filter((item) => {
      if (state.selectedCategory !== 'all' && item.categoryId !== state.selectedCategory) return false;
      if (query.length === 0) return true;

      return (
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        (item.barcode?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [catalog.menuItems, state.searchQuery, state.selectedCategory]);

  const findMenuItemByBarcode = useCallback(
    (barcode: string): MenuItem | null => {
      const normalized = barcode.trim();
      if (normalized.length === 0) return null;
      const match = catalog.menuItems.find((item) => item.barcode === normalized);
      return match ?? null;
    },
    [catalog.menuItems],
  );

  const activeTableLabel = useMemo(() => {
    const tableId = state.currentOrder.tableId;
    if (!tableId) return null;
    const match = catalog.tables.find((table) => table.id === tableId);
    return match?.label ?? state.assignedTableLabel;
  }, [catalog.tables, state.assignedTableLabel, state.currentOrder.tableId]);

  const actions = useMemo<POSActions>(
    () => ({
      selectCategory: (categoryId) => {
        dispatch({ type: 'SELECT_CATEGORY', payload: categoryId });
        AudioFeedback.playTick();
      },
      setSearchQuery: (query) => dispatch({ type: 'SET_SEARCH_QUERY', payload: query }),
      openItem: (menuItem) => {
        AudioFeedback.triggerBeep(680, 0.035, 'sine');

        if (!menuItem.isAvailable) {
          AudioFeedback.playWarning();
          dispatch({
            type: 'SET_MUTATION_STATE',
            payload: { isMutating: false, error: `${menuItem.name} is 86'd (out of stock).` },
          });
          return;
        }

        if (menuItem.modifierGroups.length > 0) {
          dispatch({ type: 'OPEN_MODIFIER_MODAL', payload: menuItem });
          return;
        }

        dispatch({ type: 'ADD_ITEM_DIRECT', payload: menuItem });
      },
      addItemDirect: (menuItem) => dispatch({ type: 'ADD_ITEM_DIRECT', payload: menuItem }),
      submitStagedItem: () => {
        const item = state.stagedMenuItem;
        if (!item) return;

        const modifiers = resolveModifiersFromDraft(item, state.stagedModifierDraft);
        dispatch({
          type: 'ADD_STAGED_ITEM',
          payload: {
            menuItem: item,
            modifiers,
            quantity: state.stagedQuantity,
            note: state.stagedNote,
          },
        });
        AudioFeedback.triggerBeep(820, 0.05, 'triangle');
      },
      toggleStagedModifier: (groupId, optionId) =>
        dispatch({ type: 'UPDATE_STAGED_DRAFT', payload: { groupId, optionId } }),
      setStagedQuantity: (quantity) => dispatch({ type: 'SET_STAGED_QUANTITY', payload: quantity }),
      setStagedNote: (note) => dispatch({ type: 'SET_STAGED_NOTE', payload: note }),
      incrementQuantity: (clientLineItemId, delta) =>
        dispatch({ type: 'UPDATE_ITEM_QUANTITY', payload: { clientLineItemId, delta } }),
      removeItem: (clientLineItemId) => {
        dispatch({ type: 'REMOVE_ITEM', payload: { clientLineItemId } });
        AudioFeedback.playTick();
      },
      applyItemDiscount: (clientLineItemId, discountInCents) =>
        dispatch({ type: 'APPLY_ITEM_DISCOUNT', payload: { clientLineItemId, discountInCents } }),
      applyOrderDiscount: (discountInCents) => {
        dispatch({ type: 'APPLY_ORDER_DISCOUNT', payload: { discountInCents } });
        AudioFeedback.playTick();
      },
      setDiningOption: (diningOption) => {
        dispatch({ type: 'SET_DINING_OPTION', payload: diningOption });
        AudioFeedback.playTick();
      },
      assignTable: (tableId, label) => {
        dispatch({ type: 'ASSIGN_TABLE', payload: { tableId, label } });
        AudioFeedback.triggerBeep(760, 0.05, 'triangle');
      },
      openPayment: () => {
        if (state.currentOrder.lineItems.length === 0) {
          dispatch({
            type: 'SET_MUTATION_STATE',
            payload: { isMutating: false, error: 'Add at least one item before taking payment.' },
          });
          AudioFeedback.playWarning();
          return;
        }
        dispatch({ type: 'SET_ACTIVE_MODAL', payload: 'payment' });
        AudioFeedback.triggerBeep(700, 0.05, 'triangle');
      },
      closeModal: () => {
        dispatch({ type: 'CLOSE_MODAL' });
        AudioFeedback.playTick();
      },
      setActiveModal: (modal) => dispatch({ type: 'SET_ACTIVE_MODAL', payload: modal }),
      openNumpad: (mode, targetClientLineItemId) =>
        dispatch({ type: 'OPEN_NUM_PAD', payload: { mode, targetClientLineItemId } }),
      closeNumpad: () => dispatch({ type: 'CLOSE_NUM_PAD' }),
      commitNumpadValue,
      parkCurrentOrder: () => parkCurrentOrder(),
      settleOrder: (payment) => settleOrder(payment),
      startNewOrder: () => startNewOrder(),
      restoreOrder: (order) => {
        dispatch({ type: 'RESTORE_ORDER', payload: order });
        AudioFeedback.playChime();
      },
      retryBoot: () => {
        void runBoot();
      },
      dismissError: () => dispatch({ type: 'DISMISS_ERROR' }),
      findMenuItemByBarcode,
    }),
    [
      commitNumpadValue,
      dispatch,
      findMenuItemByBarcode,
      parkCurrentOrder,
      runBoot,
      settleOrder,
      startNewOrder,
      state.currentOrder.lineItems.length,
      state.stagedMenuItem,
      state.stagedModifierDraft,
      state.stagedNote,
      state.stagedQuantity,
    ],
  );

  const toggleAudioMute = useCallback(() => {
    setAudioMuted((muted) => {
      const next = !muted;
      AudioFeedback.setMuted(next);
      if (!next) AudioFeedback.playTick();
      return next;
    });
  }, [setAudioMuted]);

  const value = useMemo<POSContextValue>(
    () => ({
      state,
      dispatch,
      catalog,
      visibleItems,
      activeTableLabel,
      storeIdentifier: STORE_IDENTIFIER,
      appTitle: APP_TITLE,
      defaultTaxRatePercent: DEFAULT_TAX_RATE_PERCENT,
      audioMuted,
      toggleAudioMute,
      actions,
    }),
    [state, dispatch, catalog, visibleItems, activeTableLabel, audioMuted, toggleAudioMute, actions],
  );

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                   */
/* -------------------------------------------------------------------------- */