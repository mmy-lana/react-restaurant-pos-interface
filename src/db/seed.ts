import type { CashierSessionRecord } from '@/types/pos';
import type { POSDatabase } from '@/db/posDatabase';
import {
  SEED_CATEGORIES,
  SEED_MENU_ITEMS,
  SEED_TABLES,
  createSeedCashierSession,
} from '@/db/seedData';

export interface SeedReport {
  /** Rows actually written by this call (0 when the store was already populated). */
  readonly categoriesWritten: number;
  readonly menuItemsWritten: number;
  readonly tablesWritten: number;
  readonly session: CashierSessionRecord;
  readonly alreadySeeded: boolean;
  /** Stores that were found empty and refilled by this call. */
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
 * records are preserved verbatim and reported as `alreadySeeded`.
 *
 * The repair is per store rather than all-or-nothing. A terminal that is killed
 * mid-boot, loses power or hits a quota error part way through the seed ends up
 * with some stores written and the others not, and gating the whole seed on
 * "all three are empty" left such a register booting forever with a zero-item
 * catalog and no way to trade. Each empty store is refilled on its own, so an
 * interrupted seed heals on the next boot while a populated store keeps every
 * runtime edit it has accumulated.
 */
export async function seedDatabase(posDb: POSDatabase): Promise<SeedReport> {
  const inventory = await readSeedInventory(posDb);

  const categoriesMissing = inventory.categories === 0;
  const menuItemsMissing = inventory.menuItems === 0;
  const tablesMissing = inventory.tables === 0;

  const incompleteStores: string[] = [];

  if (categoriesMissing) {
    await posDb.categories.bulkPut(SEED_CATEGORIES.map((row) => ({ ...row })));
    incompleteStores.push('categories');
  }
  if (menuItemsMissing) {
    await posDb.menuItems.bulkPut(SEED_MENU_ITEMS.map((row) => structuredClone(row)));
    incompleteStores.push('menuItems');
  }
  if (tablesMissing) {
    await posDb.diningTables.bulkPut(SEED_TABLES.map((row) => ({ ...row })));
    incompleteStores.push('tables');
  }

  const session = await ensureCashierSession(posDb);

  return {
    categoriesWritten: categoriesMissing ? SEED_CATEGORIES.length : 0,
    menuItemsWritten: menuItemsMissing ? SEED_MENU_ITEMS.length : 0,
    tablesWritten: tablesMissing ? SEED_TABLES.length : 0,
    session,
    alreadySeeded: incompleteStores.length === 0,
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
