import Dexie, { type Table } from 'dexie';
import type {
  Cents,
  CashierSessionRecord,
  DiningTableRecord,
  MenuItemRecord,
  OrderCategoryRecord,
  OrderRecord,
  PaymentMethod,
  UUID,
} from '@/types/pos';

/**
 * Offline-first persistence layer for the POS.
 *
 * This module is intentionally free of React/Context imports so it can be
 * consumed from reducers, thunks, seed routines and headless verification
 * scripts alike.
 */

export interface TableUpdateIntent {
  readonly tableId: UUID;
  /** `true` frees the table, `false` marks it occupied by the target order. */
  readonly release: boolean;
}

/**
 * Shift-drawer increment applied inside the order-finalization transaction so a
 * settled ticket and its drawer totals can never diverge.
 */
export interface SessionPaymentIntent {
  readonly sessionId: string;
  readonly method: PaymentMethod;
  readonly amountInCents: Cents;
}

/**
 * Atomically reserved daily ticket sequence.
 *
 * The row is written inside the same read-write transaction that mints the
 * number, so two terminals booting at the same instant can never mint the same
 * `POS-YYYYMMDD-XXXX`, even before either order is persisted.
 */
export interface OrderSequenceRecord {
  readonly key: string;
  readonly value: number;
  readonly updatedAt: string;
}

/** Thrown when an optimistic write loses the race against another terminal. */
export class OptimisticLockError extends Error {
  public readonly code = 'CONCURRENCY_ERROR';
  public readonly orderId: UUID;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  public constructor(orderId: UUID, expectedVersion: number, actualVersion: number) {
    super(
      `CONCURRENCY_ERROR: Order ${orderId} version mismatch (current: ${actualVersion}, target: ${expectedVersion})`,
    );
    this.name = 'OptimisticLockError';
    this.orderId = orderId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class POSDatabase extends Dexie {
  menuItems!: Table<MenuItemRecord, string>;
  categories!: Table<OrderCategoryRecord, string>;
  orders!: Table<OrderRecord, string>;
  /**
   * Floor plan store. IndexedDB object store name stays `tables` exactly as
   * specified by the blueprint, but the instance property is renamed to
   * `diningTables` because `Dexie.tables` is already reserved by Dexie itself
   * for the live table-name registry.
   */
  diningTables!: Table<DiningTableRecord, string>;
  sessions!: Table<CashierSessionRecord, string>;
  /** Daily order-number reservations, keyed by `POS-YYYYMMDD`. */
  counters!: Table<OrderSequenceRecord, string>;

  public constructor(name = 'RestaurantPOS_DB') {
    super(name);

    this.version(1).stores({
      menuItems: 'id, sku, categoryId, isAvailable',
      categories: 'id, sortOrder',
      orders: 'id, &orderNumber, status, diningOption, tableId, version, createdAt, completedAt',
      tables: 'id, status, section, version',
      sessions: 'id, cashierId, openedAt, closedAt',
    });

    // v2 adds the atomic sequence reservation store; every other store keeps its
    // blueprint indexes untouched.
    this.version(2).stores({
      menuItems: 'id, sku, categoryId, isAvailable',
      categories: 'id, sortOrder',
      orders: 'id, &orderNumber, status, diningOption, tableId, version, createdAt, completedAt',
      tables: 'id, status, section, version',
      sessions: 'id, cashierId, openedAt, closedAt',
      counters: 'key',
    });

    // Dexie only auto-binds properties whose name matches an object store, so the
    // floor plan store is bound explicitly to its `tables` store name.
    this.diningTables = this.table<DiningTableRecord, string>('tables');
  }
}

/** Singleton database instance with zero React/Context imports. */
export const db = new POSDatabase();

/** Maps a tender method onto the shift-drawer bucket it accumulates into. */
function applySessionPayment(
  session: CashierSessionRecord,
  intent: SessionPaymentIntent,
): CashierSessionRecord {
  const amount = Math.max(0, intent.amountInCents);

  switch (intent.method) {
    case 'cash':
      return { ...session, totalCashReceivedInCents: session.totalCashReceivedInCents + amount };
    case 'credit_card':
    case 'debit_card':
      return { ...session, totalCardReceivedInCents: session.totalCardReceivedInCents + amount };
    case 'gift_card':
      return { ...session, totalGiftCardReceivedInCents: session.totalGiftCardReceivedInCents + amount };
    case 'digital_wallet':
      return {
        ...session,
        totalDigitalWalletReceivedInCents: session.totalDigitalWalletReceivedInCents + amount,
      };
    default:
      return session;
  }
}

/**
 * Persists an order with an optimistic version check while atomically syncing
 * the linked table occupancy and, when provided, the shift-drawer totals.
 *
 * All three stores are written inside one IndexedDB read-write transaction, so
 * a settled ticket, its released table and the drawer increment either all land
 * or none do — there is no window where the drawer drifts away from the ledger.
 * Dexie serialises overlapping read-write transactions across tabs of the same
 * origin, so the read-modify-write of the session row is safe here.
 *
 * The stored order is written with `version + 1`; the caller must adopt the
 * incremented version before its next write.
 *
 * @throws {OptimisticLockError} when another writer already advanced the row.
 */
export async function saveOrderWithOptimisticLock(
  posDb: POSDatabase,
  targetOrder: OrderRecord,
  tableUpdate?: TableUpdateIntent,
  sessionPayment?: SessionPaymentIntent,
): Promise<void> {
  await posDb.transaction(
    'rw',
    [posDb.orders, posDb.diningTables, posDb.sessions],
    async () => {
      const existing = await posDb.orders.get(targetOrder.id);
      if (existing && existing.version !== targetOrder.version) {
        throw new OptimisticLockError(targetOrder.id, targetOrder.version, existing.version);
      }

      await posDb.orders.put({
        ...targetOrder,
        version: targetOrder.version + 1,
        updatedAt: new Date().toISOString(),
      });

      if (tableUpdate) {
        const table = await posDb.diningTables.get(tableUpdate.tableId);
        if (table) {
          await posDb.diningTables.put({
            ...table,
            status: tableUpdate.release ? 'available' : 'occupied',
            ...(tableUpdate.release ? {} : { activeOrderId: targetOrder.id }),
            version: table.version + 1,
          });
        }
      }

      if (sessionPayment) {
        const session = await posDb.sessions.get(sessionPayment.sessionId);
        if (session) {
          await posDb.sessions.put(applySessionPayment(session, sessionPayment));
        }
      }
    },
  );
}

/**
 * Releases a floor-plan table back to the pool.
 *
 * Used when a cashier un-seats a ticket: clearing the association in React
 * state alone would leave `activeOrderId` and the occupied status behind in
 * IndexedDB, so the next party would be seated at a table the floor still
 * believes is taken. When `activeOrderId` is supplied, the row is only cleared
 * if it really belongs to that order, so a concurrent seating is never undone.
 */
export async function releaseDiningTable(
  posDb: POSDatabase,
  tableId: UUID,
  activeOrderId?: UUID,
): Promise<void> {
  await posDb.transaction('rw', posDb.diningTables, async () => {
    const table = await posDb.diningTables.get(tableId);
    if (!table) return;
    if (activeOrderId !== undefined && table.activeOrderId !== activeOrderId) return;

    await posDb.diningTables.put({
      ...table,
      status: 'available',
      activeOrderId: undefined,
      version: table.version + 1,
    });
  });
}

/** Explicitly opens the database; safe to call repeatedly (Dexie memoizes). */
export async function openPOSDatabase(posDb: POSDatabase = db): Promise<void> {
  if (!posDb.isOpen()) {
    await posDb.open();
  }
}

/** Closes the connection (used by teardown and by hard-reset tooling). */
export function closePOSDatabase(posDb: POSDatabase = db): void {
  if (posDb.isOpen()) {
    posDb.close();
  }
}

/**
 * Wipes every register table. Exposed through the degraded-mode recovery action
 * so a corrupted IndexedDB profile can be rebuilt from the seed routine.
 */
export async function resetPOSDatabase(posDb: POSDatabase = db): Promise<void> {
  await posDb.transaction(
    'rw',
    [posDb.menuItems, posDb.categories, posDb.orders, posDb.diningTables, posDb.sessions, posDb.counters],
    async () => {
      await Promise.all([
        posDb.menuItems.clear(),
        posDb.categories.clear(),
        posDb.orders.clear(),
        posDb.diningTables.clear(),
        posDb.sessions.clear(),
        posDb.counters.clear(),
      ]);
    },
  );
}
