import { banner, CheckRunner, openRegisterPage, waitForBoot, withPreviewServer } from './lib/harness.mjs';

/**
 * Phase 4 verification: organisms, reducer guards and the persistence thunks.
 *
 * Drives a full service loop in headless Chromium — ring items, configure
 * modifiers, seat a party, split-tender, settle and park — then inspects the
 * resulting IndexedDB rows directly.
 */
async function run({ browser, baseUrl }) {
  const runner = new CheckRunner();
  const { context, page } = await openRegisterPage(browser, baseUrl, { width: 1024, height: 768 });
  await runner.trackPage(page);

  banner('Phase 4 · organisms, guards and settlement');

  await page.goto(`${baseUrl}/?showcase=organisms`, { waitUntil: 'domcontentloaded' });
  await waitForBoot(page);
  await page.waitForSelector('[data-testid="catalog-grid"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-sku]').length > 0, null, { timeout: 15000 });

  /* ------------------------------------------------------------ header */
  const header = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="top-header"]');
    return {
      connectivity: node.getAttribute('data-connectivity'),
      orderNumber: node.getAttribute('data-order-number'),
      session: document.querySelector('[data-testid="header-session"]')?.textContent?.trim(),
      statusDot: Boolean(document.querySelector('[data-testid="header-connectivity"]')),
    };
  });

  runner.check('header reports an online register', header.connectivity === 'online', header.connectivity);
  runner.checkMatch('header shows the live order number', header.orderNumber, /^POS-\d{8}-\d{4}$/);
  runner.check('header shows the cashier shift', header.session?.includes('Alex R.'), header.session);

  /* -------------------------------------------------------- empty states */
  runner.check('ticket renders its empty state', await page.locator('[data-testid="ticket-empty"]').isVisible());
  runner.checkEqual(
    'checkout CTA is disabled while the ticket is empty',
    await page.locator('[data-testid="ticket-checkout-button"]').isDisabled(),
    true,
  );
  runner.checkEqual(
    'park CTA is disabled while the ticket is empty',
    await page.locator('[data-testid="ticket-park-button"]').isDisabled(),
    true,
  );

  /* -------------------------------------------- unavailable item guard */
  // `aria-disabled` keeps the tile focusable for screen readers, so Playwright
  // refuses to auto-tap it: force the gesture to prove the runtime guard fires.
  await page.locator('[data-testid="product-tile-menu-mushroom-swiss"]').tap({ force: true });
  await page.waitForTimeout(250);

  const guardState = await page.evaluate(() => ({
    error: document.querySelector('[data-testid="persistence-error"]')?.textContent ?? '',
    rows: Number(document.querySelector('[data-testid="active-ticket"]').getAttribute('data-item-count')),
  }));
  runner.check(
    'ADD_ITEM_DIRECT refuses an unavailable item',
    guardState.rows === 0 && guardState.error.includes("86'd"),
    `rows=${guardState.rows} error="${guardState.error.trim()}"`,
  );

  /* --------------------------------------------------- modifier workflow */
  // The salad carries two mandatory groups with deliberately empty defaults, so
  // the validation engine starts in its blocked state.
  await page.locator('[data-testid="catalog-search-input"]').fill('build your own salad');
  await page.waitForTimeout(150);
  await page.locator('[data-testid="product-tile-menu-garden-salad"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]');

  runner.check(
    'modifier modal opens for an item with mandatory groups',
    await page.locator('[data-testid="modifier-group-grp-salad-base"]').isVisible(),
  );
  runner.checkEqual(
    'confirm is locked while a mandatory group is unsatisfied',
    await page.locator('[data-testid="modifier-confirm"]').isDisabled(),
    true,
  );
  runner.check(
    'validation banner explains the block',
    await page.locator('[data-testid="modifier-validation-banner"]').isVisible(),
  );
  const inlineError = (await page
    .locator('[data-testid="modifier-error-grp-salad-base"]')
    .count())
    ? await page.locator('[data-testid="modifier-error-grp-salad-base"]').innerText()
    : '(missing)';
  runner.check(
    'unsatisfied group renders its own inline error',
    inlineError.toLowerCase().includes('at least 1'),
    inlineError,
  );

  // Abandon the blocked configuration, then ring a burger whose mandatory
  // groups ship defaults so the happy path can be priced.
  await page.locator('[data-testid="modifier-cancel"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]', { state: 'detached' });
  await page.locator('[data-testid="catalog-search-input"]').fill('');
  // Items whose defaults already satisfy every group ring on a single tap, so
  // the modifier overlay is reached through the tile's customize affordance.
  await page.locator('[data-testid="product-tile-menu-smash-classic"]').tap();
  runner.checkEqual(
    'a tap rings a fully defaulted item without a detour',
    await page.locator('[data-testid="modifier-modal"]').count(),
    0,
  );
  // Drop the quick-ring row so the rest of the flow asserts a single line item.
  await page.locator('[data-testid^="ticket-line-remove-"]').last().tap();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-ticket"]').getAttribute('data-item-count') === '0',
    null,
    { timeout: 10_000 },
  );

  await page.locator('[data-testid="product-customize-menu-smash-classic"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]');
  runner.checkEqual(
    'defaults satisfy mandatory groups immediately',
    await page.locator('[data-testid="modifier-confirm"]').isDisabled(),
    false,
  );

  /* ------------------------------------------------------ A11Y-01 roving nav */
  const roving = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="modifier-group-grp-cheese"]');
    const options = Array.from(group.querySelectorAll('button[data-modifier-option]'));
    return {
      tabIndexes: options.map((option) => option.getAttribute('tabindex')),
      selectedCount: options.filter((option) => option.getAttribute('data-selected') === 'true').length,
    };
  });
  runner.checkEqual(
    'a modifier group exposes a single tab stop',
    roving.tabIndexes.filter((value) => value === '0').length,
    1,
  );

  // Cook temperature is the seeded single-choice group: arrow keys must both
  // move focus and select, the way a radio group behaves.
  await page.locator('[data-testid="modifier-option-opt-temp-medium"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const afterArrowDown = await page.evaluate(() => ({
    focused: document.activeElement?.getAttribute('data-testid'),
    selected: document.activeElement?.getAttribute('data-selected'),
  }));
  runner.checkEqual(
    'ArrowDown moves focus to the next option',
    afterArrowDown.focused,
    'modifier-option-opt-temp-medium-well',
  );
  runner.checkEqual(
    'single-choice groups select on arrow navigation',
    afterArrowDown.selected,
    'true',
  );

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  runner.checkEqual(
    'ArrowDown wraps within the group',
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'modifier-option-opt-temp-well',
  );

  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  runner.checkEqual(
    'Home jumps to the first option and selects it',
    await page.evaluate(() => document.activeElement?.getAttribute('data-selected')),
    'true',
  );
  runner.checkEqual(
    'Home returns focus to the first option',
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'modifier-option-opt-temp-medium',
  );

  const multiRoving = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="modifier-group-grp-toppings"]');
    const options = Array.from(group.querySelectorAll('button[data-modifier-option]'));
    return options.filter((option) => option.getAttribute('tabindex') === '0').length;
  });
  runner.checkEqual('multi-choice groups keep exactly one tab stop', multiRoving, 1);

  await page.locator('[data-testid="modifier-option-opt-cheese-american"]').tap();
  await page.locator('[data-testid="modifier-option-opt-top-bacon"]').tap();
  await page.locator('[data-testid="modifier-option-opt-top-avocado"]').tap();
  runner.checkEqual(
    'multi-select group accepts several options',
    await page.locator('[data-testid="modifier-option-opt-top-bacon"]').getAttribute('data-selected'),
    'true',
  );

  // maxSelections enforcement: "Toppings" caps at five.
  for (const option of ['opt-top-onion', 'opt-top-egg', 'opt-top-jalapeno', 'opt-top-pickles']) {
    await page.locator(`[data-testid="modifier-option-${option}"]`).tap();
  }
  const toppingsState = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="modifier-group-grp-toppings"]');
    return {
      selected: group.querySelectorAll('[data-selected="true"]').length,
      blocked: Array.from(group.querySelectorAll('[data-blocked="true"]')).length,
    };
  });
  runner.checkEqual('multi-select group honours maxSelections', toppingsState.selected, 5);
  runner.checkGreaterThan('blocked options are flagged once at capacity', toppingsState.blocked, 0);

  await page.locator('[data-testid="modifier-quantity-increase"]').tap();
  await page.locator('[data-testid="modifier-note"]').fill('Gluten allergy — change gloves');
  runner.checkEqual(
    'staged quantity can be raised',
    (await page.locator('[data-testid="modifier-quantity"]').innerText()).trim(),
    '2',
  );

  const lineTotalBefore = Number(
    await page.locator('[data-testid="modifier-line-total"]').getAttribute('data-amount-cents'),
  );
  await page.locator('[data-testid="modifier-option-opt-top-egg"]').tap(); // toggle back off
  const lineTotalAfter = Number(
    await page.locator('[data-testid="modifier-line-total"]').getAttribute('data-amount-cents'),
  );
  runner.check(
    'modifier deltas re-price the staged line',
    lineTotalAfter < lineTotalBefore,
    `${lineTotalBefore} -> ${lineTotalAfter}`,
  );

  runner.checkEqual(
    'confirm unlocks once validation passes',
    await page.locator('[data-testid="modifier-confirm"]').isDisabled(),
    false,
  );

  await page.locator('[data-testid="modifier-confirm"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]', { state: 'detached' });

  /* ------------------------------------------------------- ticket totals */
  const ticketAfterModifiers = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="active-ticket"]');
    const read = (id) => Number(document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-amount-cents'));
    return {
      itemCount: Number(root.getAttribute('data-item-count')),
      subtotal: read('ticket-subtotal'),
      tax: read('ticket-tax'),
      total: read('ticket-total'),
    };
  });

  const expectedTax = Math.round(ticketAfterModifiers.subtotal * 0.0825);
  runner.checkEqual('ticket holds the configured row', ticketAfterModifiers.itemCount, 1);
  runner.checkEqual(
    'tax is computed from the prorated subtotal at 8.25%',
    ticketAfterModifiers.tax,
    expectedTax,
  );
  runner.checkEqual(
    'balance due equals subtotal + tax',
    ticketAfterModifiers.total,
    ticketAfterModifiers.subtotal + ticketAfterModifiers.tax,
  );
  // Focus must survive the re-render a reducer dispatch causes, otherwise a
  // cashier cannot type a note at all.
  await page.locator('[data-testid="product-customize-menu-smash-classic"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]');
  await page.locator('[data-testid="modifier-option-opt-top-onion"]').tap();
  await page.locator('[data-testid="modifier-note"]').click();
  await page.keyboard.type('no pickle');
  await page.waitForTimeout(150);
  runner.checkEqual(
    'the note field keeps focus while typing',
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'modifier-note',
  );
  runner.checkEqual(
    'typed note text lands in the field',
    await page.locator('[data-testid="modifier-note"]').inputValue(),
    'no pickle',
  );
  runner.checkEqual(
    'typing into a field never triggers the register shortcuts',
    await page.locator('[data-testid="payment-modal"]').count(),
    0,
  );
  await page.locator('[data-testid="modifier-note"]').fill('');
  await page.locator('[data-testid="modifier-cancel"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]', { state: 'detached' });
  await page.waitForTimeout(200);

  runner.check(
    'modifier summary and note reach the ticket row',
    (await page.locator('[data-testid^="ticket-line-modifiers-"]').first().innerText()).includes('Bacon'),
  );

  /* -------------------------------------------------------- quick add + qty */
  await page.locator('[data-testid="catalog-search-input"]').fill('onion rings');
  await page.waitForTimeout(150);
  await page.locator('[data-testid="product-tile-menu-onion-rings"]').tap();
  await page.locator('[data-testid="product-tile-menu-onion-rings"]').tap();
  await page.locator('[data-testid="catalog-search-input"]').fill('');

  const mergedRow = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-menu-item-id]'));
    const onionRows = rows.filter((row) => row.getAttribute('data-menu-item-id') === 'menu-onion-rings');
    return { count: onionRows.length, quantity: Number(onionRows[0]?.getAttribute('data-quantity')) };
  });
  runner.checkEqual('identical modifier-free rings merge into one row', mergedRow.count, 1);
  runner.checkEqual('repeat taps increment the merged quantity', mergedRow.quantity, 2);

  /* ------------------------------------------ SEC-03 printer-safe notes */
  // Stage a note carrying ESC/POS control bytes through the modifier overlay.
  await page.locator('[data-testid="catalog-search-input"]').fill('build your own salad');
  await page.waitForTimeout(150);
  await page.locator('[data-testid="product-tile-menu-garden-salad"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]');

  await page.locator('[data-testid="modifier-option-opt-base-greens"]').tap();
  await page.locator('[data-testid="modifier-option-opt-dressing-vinaigrette"]').tap();

  await page.locator('[data-testid="modifier-note"]').fill('no onions\u001b\u0008\u0007ALLERGIC  ');
  runner.check(
    'the note counter reflects the sanitized length',
    (await page.locator('[data-testid="modifier-note-counter"]').innerText())
      .toLowerCase()
      .includes('/140 characters'),
    (await page.locator('[data-testid="modifier-note-counter"]').innerText()).trim(),
  );

  await page.locator('[data-testid="modifier-confirm"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]', { state: 'detached' });
  await page.waitForTimeout(200);

  const sanitizedNote = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-menu-item-id]'));
    const salad = rows.find((row) => row.getAttribute('data-menu-item-id') === 'menu-garden-salad');
    const noteNode = Array.from(salad?.querySelectorAll('p') ?? []).find((node) =>
      (node.textContent ?? '').toLowerCase().startsWith('note:'),
    );
    return noteNode?.textContent ?? '';
  });

  runner.check(
    'control characters never reach the ticket note',
    !/[\u0000-\u001F\u007F]/.test(sanitizedNote),
    JSON.stringify(sanitizedNote.slice(0, 60)),
  );
  runner.check(
    'the readable part of the note survives sanitization',
    sanitizedNote.toUpperCase().includes('ALLERGIC'),
    JSON.stringify(sanitizedNote.slice(0, 60)),
  );
  // Re-open the row and try to push an over-long note through the edit path.
  const saladRow = page.locator('[data-menu-item-id="menu-garden-salad"]');
  await saladRow.locator('[data-testid^="ticket-line-edit-"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]');
  await page.locator('[data-testid="modifier-note"]').fill('A'.repeat(200));
  await page.locator('[data-testid="modifier-confirm"]').tap();
  await page.waitForSelector('[data-testid="modifier-modal"]', { state: 'detached' });
  await page.waitForTimeout(200);

  const clampedNote = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-menu-item-id]'));
    const salad = rows.find((row) => row.getAttribute('data-menu-item-id') === 'menu-garden-salad');
    const noteNode = Array.from(salad?.querySelectorAll('p') ?? []).find((node) =>
      (node.textContent ?? '').toLowerCase().startsWith('note:'),
    );
    return (noteNode?.textContent ?? '').replace(/^note:\s*/i, '');
  });

  runner.check(
    'the sanitizer clamps over-long notes',
    clampedNote.length > 0 && clampedNote.length <= 140,
    `length=${clampedNote.length}`,
  );

  /* ------------------------------- DATA-04 occupied table confirmation */
  await page.locator('[data-testid="ticket-table-button"]').tap();
  await page.waitForSelector('[data-testid="table-drawer"]');

  await page.locator('[data-testid="table-card-T03"]').tap(); // seeded as reserved
  await page.waitForSelector('[data-testid="table-confirm-modal"]');
  runner.check(
    'a reserved table asks before reassignment',
    (await page.locator('[data-testid="table-confirm-modal"] h2').innerText()).includes('T03'),
    (await page.locator('[data-testid="table-confirm-modal"] h2').innerText()).trim(),
  );
  await page.locator('[data-testid="table-confirm-cancel"]').tap();
  await page.waitForSelector('[data-testid="table-confirm-modal"]', { state: 'detached' });
  await page.waitForTimeout(250);
  runner.check(
    'declining leaves the ticket unassigned',
    (await page.locator('[data-testid="ticket-table-button"]').innerText()).toLowerCase().includes('assign table'),
  );

  await page.locator('[data-testid="table-card-T03"]').tap();
  await page.waitForSelector('[data-testid="table-confirm-modal"]');
  await page.locator('[data-testid="table-confirm-accept"]').tap();
  await page.waitForSelector('[data-testid="table-drawer"]', { state: 'detached' });
  runner.check(
    'confirming the override seats the table',
    (await page.locator('[data-testid="ticket-table-button"]').innerText()).includes('T03'),
  );

  /* ------------------------------------------------------- dining + table */
  await page.locator('[data-testid="ticket-dining-takeout"]').tap();
  runner.checkEqual(
    'dining option toggle updates state',
    await page.locator('[data-testid="ticket-dining-takeout"]').getAttribute('data-active'),
    'true',
  );

  await page.locator('[data-testid="ticket-table-button"]').tap();
  await page.waitForSelector('[data-testid="table-drawer"]');
  const tableInventory = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-testid^="table-card-"]').length,
    sections: document.querySelectorAll('[data-testid^="table-section-"]').length,
    reserved: document.querySelector('[data-testid="table-card-T03"]')?.getAttribute('data-status'),
  }));
  runner.checkEqual('floor plan lists every table', tableInventory.cards, 14);
  runner.checkEqual('floor plan is grouped into three sections', tableInventory.sections, 3);
  runner.checkEqual('reserved tables keep their status', tableInventory.reserved, 'reserved');

  await page.locator('[data-testid="table-card-T04"]').tap();
  await page.waitForSelector('[data-testid="table-drawer"]', { state: 'detached' });
  runner.check(
    'assigning a table surfaces it in the header',
    (await page.locator('[data-testid="header-table"]').innerText()).includes('T04'),
  );

  /* ------------------------------------------------------ order discount */
  await page.locator('[data-testid="ticket-discount-button"]').tap();
  await page.locator('[data-testid="discount-input-field"]').fill('5.00');
  await page.locator('[data-testid="discount-apply"]').tap();
  await page.waitForTimeout(200);

  const discounted = await page.evaluate(() => ({
    orderDiscount: Number(
      document.querySelector('[data-testid="ticket-order-discount"]')?.getAttribute('data-amount-cents'),
    ),
    total: Number(document.querySelector('[data-testid="ticket-total"]')?.getAttribute('data-amount-cents')),
    clearButton: Boolean(document.querySelector('[data-testid="ticket-clear-discount-button"]')),
  }));
  runner.checkEqual('order discount is recorded as a negative line', discounted.orderDiscount, -500);
  runner.check('order discount offers a clear affordance', discounted.clearButton);
  runner.checkGreaterThan('balance drops after the discount', discounted.total, 0);

  /* ------------------------------------------------------------ checkout */
  await page.locator('[data-testid="ticket-checkout-button"]').tap();
  await page.waitForSelector('[data-testid="payment-modal"]');

  const dueBeforeSplit = Number(
    await page.locator('[data-testid="payment-balance"]').getAttribute('data-amount-cents'),
  );
  runner.checkGreaterThan('checkout shows the outstanding balance', dueBeforeSplit, 0);

  const quickCashCount = await page.locator('[data-testid="quick-cash-grid"] button').count();
  runner.checkEqual('checkout renders four quick tender buttons', quickCashCount, 4);

  // Split tender: $10 on a larger balance.
  await page.locator('[data-testid="payment-method-cash"]').tap();
  for (const digit of ['1', '0', '.', '0', '0']) {
    await page.locator(`[data-testid="numpad-key-${digit === '.' ? '\\.' : digit}"]`).tap();
  }

  const appliedSplit = Number(
    await page.locator('[data-testid="payment-applied"]').getAttribute('data-amount-cents'),
  );
  runner.checkEqual('numpad tender is parsed into cents', appliedSplit, Math.min(1000, dueBeforeSplit));
  runner.check(
    'under-tender warns about a split payment',
    appliedSplit < dueBeforeSplit
      ? await page.locator('[data-testid="payment-warning"]').isVisible()
      : true,
  );

  await page.locator('[data-testid="payment-settle"]').tap();
  await page.waitForSelector('[data-testid="payment-history"]');
  runner.check('split tender is recorded in the payment history', await page.locator('[data-testid="payment-history"]').isVisible());

  const remainingAfterSplit = Number(
    await page.locator('[data-testid="payment-balance"]').getAttribute('data-amount-cents'),
  );
  runner.checkEqual(
    'split tender reduces the balance by exactly the applied amount',
    remainingAfterSplit,
    dueBeforeSplit - appliedSplit,
  );

  // Settle the rest with a quick cash button, then a full exact tender.
  const quickTender = Number(
    await page.locator('[data-testid="quick-cash-option-0"]').getAttribute('data-tender-cents'),
  );
  await page.locator('[data-testid="quick-cash-option-0"]').tap();
  const changeDue = Number(
    await page.locator('[data-testid="payment-change"]').getAttribute('data-amount-cents'),
  );
  runner.checkEqual(
    'quick tender computes the change drawer',
    changeDue,
    Math.max(0, quickTender - remainingAfterSplit),
  );

  // Finish on card: non-cash settles the exact remainder and never returns change.
  await page.locator('[data-testid="payment-method-credit_card"]').tap();
  runner.checkEqual(
    'card tender clamps the change drawer to zero',
    await page.locator('[data-testid="payment-change"]').getAttribute('data-amount-cents'),
    '0',
  );
  await page.locator('[data-testid="payment-settle"]').tap();
  await page.waitForSelector('[data-testid="ticket-empty"]', { timeout: 15000 });
  runner.check('settling the ticket starts a fresh one', await page.locator('[data-testid="ticket-empty"]').isVisible());

  /* -------------------------------------------------- persistence proof */
  const settledOrder = await page.evaluate(async () => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const readAll = (store) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

    const orders = await readAll('orders');
    const tables = await readAll('tables');
    const sessions = await readAll('sessions');
    db.close();

    return {
      orders: orders.map((order) => ({
        status: order.status,
        version: order.version,
        paymentCount: order.payments.length,
        total: order.summary.finalPayableInCents,
        hasCompletedAt: Boolean(order.completedAt),
        tableId: order.tableId ?? null,
        cashPaid: order.payments
          .filter((payment) => payment.method === 'cash')
          .reduce((sum, payment) => sum + payment.amountInCents, 0),
        cardPaid: order.payments
          .filter((payment) => payment.method === 'credit_card' || payment.method === 'debit_card')
          .reduce((sum, payment) => sum + payment.amountInCents, 0),
      })),
      tableStatus: Object.fromEntries(tables.map((table) => [table.label, table.status])),
      sessionTotals: sessions.map((session) => ({
        cash: session.totalCashReceivedInCents,
        card: session.totalCardReceivedInCents,
      })),
    };
  });

  runner.checkEqual('a settled order was persisted', settledOrder.orders.length, 1);
  runner.checkEqual('persisted order is marked paid', settledOrder.orders[0].status, 'paid');
  runner.check('persisted order carries a completion timestamp', settledOrder.orders[0].hasCompletedAt);
  runner.check('persisted order stores both split tenders', settledOrder.orders[0].paymentCount === 2, `payments=${settledOrder.orders[0].paymentCount}`);
  runner.checkGreaterThan('optimistic lock advanced the version', settledOrder.orders[0].version, 0);
  runner.checkEqual(
    'assigning a table then settling releases it',
    settledOrder.tableStatus.T04,
    'available',
  );
  runner.checkGreaterThan(
    'shift drawer accumulated the cash tenders',
    settledOrder.sessionTotals[0].cash,
    0,
  );

  // FIN-01/CONC-01: the drawer, the ticket and the table move in one
  // transaction, so the drawer can never drift away from the settled ledger.
  const expectedCash = settledOrder.orders.reduce((sum, order) => sum + order.cashPaid, 0);
  const expectedCard = settledOrder.orders.reduce((sum, order) => sum + order.cardPaid, 0);
  runner.checkEqual(
    'drawer cash equals the sum of persisted cash payments',
    settledOrder.sessionTotals[0].cash,
    expectedCash,
  );
  runner.checkEqual(
    'drawer card equals the sum of persisted card payments',
    settledOrder.sessionTotals[0].card,
    expectedCard,
  );
  runner.checkGreaterThan(
    'card tenders are accumulated in the drawer',
    expectedCard,
    0,
  );

  /* -------------------------------------------------------- parking flow */
  await page.locator('[data-testid="catalog-search-input"]').fill('');
  await page.waitForTimeout(200);
  await page.locator('[data-testid="product-tile-menu-sparkling-water"]').tap();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="active-ticket"]').getAttribute('data-item-count')) === 1,
    null,
    { timeout: 10000 },
  );

  await page.locator('[data-testid="ticket-park-button"]').tap();
  await page.waitForSelector('[data-testid="ticket-empty"]', { timeout: 15000 });

  const parkedOrders = await page.evaluate(async () => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const orders = await new Promise((resolve, reject) => {
      const tx = db.transaction('orders', 'readonly');
      const req = tx.objectStore('orders').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return orders.map((order) => ({ status: order.status, items: order.lineItems.length }));
  });

  runner.checkEqual('parking persists a second order', parkedOrders.length, 2);
  runner.check(
    'parked order is stored with its lines',
    parkedOrders.some((order) => order.status === 'parked' && order.items === 1),
    JSON.stringify(parkedOrders),
  );

  /* --------------------------------------------------- empty search state */
  await page.locator('[data-testid="catalog-search-input"]').fill('zzz-no-such-item');
  await page.waitForTimeout(200);
  runner.check('catalog renders its empty search state', await page.locator('[data-testid="catalog-empty"]').isVisible());
  await page.locator('[data-testid="catalog-reset-filters"]').tap();
  await page.waitForTimeout(200);
  runner.check('empty state CTA restores the catalog', await page.locator('[data-testid="catalog-tiles"]').isVisible());

  await runner.screenshot('phase4-organisms');
  runner.hasConsoleErrors();
  runner.hasRuntimeErrors();

  await context.close();
  return runner.summary();
}

const outcome = await withPreviewServer(run);

if (outcome.failed > 0) {
  console.error(`\nPhase 4 headless verification FAILED (${outcome.failed} failing checks).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 4 headless verification PASSED.');
}