import type { CashierSessionRecord } from '@/types/pos';
import type { POSDatabase } from '@/db/posDatabase';
import {
  SEED_CATEGORIES,
  SEED_MENU_ITEMS,
  SEED_TABLES,
  createSeedCashierSession,
} from '@/db/seedData';

export interface SeedReport {
  /** Rows actually written by this call (0 when the database was preserved). */
  readonly categoriesWritten: number;
  readonly menuItemsWritten: number;
  readonly tablesWritten: number;
  readonly session: CashierSessionRecord;
  readonly alreadySeeded: boolean;
  /** Stores that hold data but are missing rows, surfaced for diagnostics. */
  readonly incompleteStores: readonly string[];
}

export interface SeedInventory {
  readonly categories: number;
  readonly menuItems: number;
  readonly tables: number;
}

/** Reads the current catalog population without mutating anything. */
export async function readSeedInventory(posDb: POSDatabase): Promise<SeedInventory> {
  const [categories, menuItems, tables] = await Promise.all([
    posDb.categories.count(),
    posDb.menuItems.count(),
    posDb.diningTables.count(),
  ]);

  return { categories, menuItems, tables };
}

/**
 * Installs the starter catalog, floor plan and opening shift — but only into a
 * completely empty register.
 *
 * Re-seeding a populated database used to overwrite live catalog edits (a
 * re-priced burger, an 86'd item, a renamed category) on every boot. Existing
 * records are now preserved verbatim and reported as `alreadySeeded`.
 */
export async function seedDatabase(posDb: POSDatabase): Promise<SeedReport> {
  const inventory = await readSeedInventory(posDb);
  const storesAreEmpty = inventory.categories === 0 && inventory.menuItems === 0 && inventory.tables === 0;

  if (storesAreEmpty) {
    await posDb.categories.bulkPut(SEED_CATEGORIES.map((row) => ({ ...row })));
    await posDb.menuItems.bulkPut(SEED_MENU_ITEMS.map((row) => structuredClone(row)));
    await posDb.diningTables.bulkPut(SEED_TABLES.map((row) => ({ ...row })));
  }

  const session = await ensureCashierSession(posDb);

  const incompleteStores: string[] = [];
  if (inventory.categories === 0) incompleteStores.push('categories');
  if (inventory.menuItems === 0) incompleteStores.push('menuItems');
  if (inventory.tables === 0) incompleteStores.push('tables');

  return {
    categoriesWritten: storesAreEmpty ? SEED_CATEGORIES.length : 0,
    menuItemsWritten: storesAreEmpty ? SEED_MENU_ITEMS.length : 0,
    tablesWritten: storesAreEmpty ? SEED_TABLES.length : 0,
    session,
    alreadySeeded: !storesAreEmpty,
    incompleteStores,
  };
}

/**
 * Returns the currently open shift, opening a fresh one when the register has
 * no active session. IndexedDB cannot index an absent `closedAt` value, so the
 * lookup is a bounded scan over the (small) session table.
 */
export async function ensureCashierSession(posDb: POSDatabase): Promise<CashierSessionRecord> {
  const allSessions = await posDb.sessions.toArray();
  const openSession = allSessions.find((session) => session.closedAt === undefined);
  if (openSession) return openSession;

  const seedSession = createSeedCashierSession();
  const persistedSeedSession = await posDb.sessions.get(seedSession.id);
  if (persistedSeedSession) return persistedSeedSession;

  await posDb.sessions.put(seedSession);
  return seedSession;
}
