import Dexie, { type Table } from 'dexie';
import type {
  CashierSessionRecord,
  DiningTableRecord,
  MenuItemRecord,
  OrderCategoryRecord,
  OrderRecord,
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

  public constructor(name = 'RestaurantPOS_DB') {
    super(name);

    this.version(1).stores({
      menuItems: 'id, sku, categoryId, isAvailable',
      categories: 'id, sortOrder',
      orders: 'id, &orderNumber, status, diningOption, tableId, version, createdAt, completedAt',
      tables: 'id, status, section, version',
      sessions: 'id, cashierId, openedAt, closedAt',
    });

    // Dexie only auto-binds properties whose name matches an object store, so the
    // floor plan store is bound explicitly to its `tables` store name.
    this.diningTables = this.table<DiningTableRecord, string>('tables');
  }
}

/** Singleton database instance with zero React/Context imports. */
export const db = new POSDatabase();

/**
 * Persists an order with an optimistic version check and, optionally, syncs the
 * linked table occupancy inside the very same IndexedDB transaction.
 *
 * The stored record is written with `version + 1`; the caller must adopt the
 * incremented version (returned through the mutation of `targetOrder` by the
 * caller-side reducer, or by re-reading the row) before its next write.
 *
 * @throws {OptimisticLockError} when another writer already advanced the row.
 */
export async function saveOrderWithOptimisticLock(
  posDb: POSDatabase,
  targetOrder: OrderRecord,
  tableUpdate?: TableUpdateIntent,
): Promise<void> {
  await posDb.transaction('rw', posDb.orders, posDb.diningTables, async () => {
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
    [posDb.menuItems, posDb.categories, posDb.orders, posDb.diningTables, posDb.sessions],
    async () => {
      await Promise.all([
        posDb.menuItems.clear(),
        posDb.categories.clear(),
        posDb.orders.clear(),
        posDb.diningTables.clear(),
        posDb.sessions.clear(),
      ]);
    },
  );
}