import type { CashierSessionRecord, PaymentMethod } from '@/types/pos';
import type { POSDatabase } from '@/db/posDatabase';
import {
  SEED_CATEGORIES,
  SEED_MENU_ITEMS,
  SEED_TABLES,
  createSeedCashierSession,
} from '@/db/seedData';

export interface SeedReport {
  readonly categoriesWritten: number;
  readonly menuItemsWritten: number;
  readonly tablesWritten: number;
  readonly session: CashierSessionRecord;
  readonly alreadySeeded: boolean;
}

/**
 * Idempotently installs the starter catalog, floor plan and opening shift.
 *
 * Rows already present keep their live values (`put` on a stable primary key is
 * an in-place upsert), so a re-seed never duplicates or drops cashier work.
 */
export async function seedDatabase(posDb: POSDatabase): Promise<SeedReport> {
  const existingCategoryCount = await posDb.categories.count();
  const existingMenuItemCount = await posDb.menuItems.count();
  const existingTableCount = await posDb.diningTables.count();

  await posDb.categories.bulkPut(SEED_CATEGORIES.map((row) => ({ ...row })));
  await posDb.menuItems.bulkPut(SEED_MENU_ITEMS.map((row) => structuredClone(row)));
  await posDb.diningTables.bulkPut(SEED_TABLES.map((row) => ({ ...row })));

  const session = await ensureCashierSession(posDb);
  const alreadySeeded =
    existingCategoryCount >= SEED_CATEGORIES.length &&
    existingMenuItemCount >= SEED_MENU_ITEMS.length &&
    existingTableCount >= SEED_TABLES.length;

  return {
    categoriesWritten: SEED_CATEGORIES.length,
    menuItemsWritten: SEED_MENU_ITEMS.length,
    tablesWritten: SEED_TABLES.length,
    session,
    alreadySeeded,
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

/**
 * Accumulates a settled payment into the running shift drawer totals.
 *
 * Called inside the same transaction that finalizes the order so the drawer
 * never drifts away from the settled tickets.
 */
export async function applyPaymentToSessionTotals(
  posDb: POSDatabase,
  sessionId: string,
  method: PaymentMethod,
  amountInCents: number,
): Promise<void> {
  const session = await posDb.sessions.get(sessionId);
  if (!session) return;

  const amount = Math.max(0, amountInCents);

  switch (method) {
    case 'cash':
      await posDb.sessions.put({
        ...session,
        totalCashReceivedInCents: session.totalCashReceivedInCents + amount,
      });
      break;
    case 'credit_card':
    case 'debit_card':
      await posDb.sessions.put({
        ...session,
        totalCardReceivedInCents: session.totalCardReceivedInCents + amount,
      });
      break;
    case 'gift_card':
      await posDb.sessions.put({
        ...session,
        totalGiftCardReceivedInCents: session.totalGiftCardReceivedInCents + amount,
      });
      break;
    case 'digital_wallet':
      await posDb.sessions.put({
        ...session,
        totalDigitalWalletReceivedInCents: session.totalDigitalWalletReceivedInCents + amount,
      });
      break;
    default:
      break;
  }
}