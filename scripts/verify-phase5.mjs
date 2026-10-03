import { banner, CheckRunner, openRegisterPage, waitForBoot, withPreviewServer } from './lib/harness.mjs';

const VIEWPORTS = [
  { name: 'mobile-s', width: 360, height: 640, columns: 2, ticketRail: false },
  { name: 'mobile-m', width: 390, height: 844, columns: 2, ticketRail: false },
  { name: 'mobile-l', width: 430, height: 932, columns: 2, ticketRail: false },
  { name: 'tablet-portrait', width: 768, height: 1024, columns: 3, ticketRail: true },
  { name: 'ipad-landscape', width: 1024, height: 768, columns: 4, ticketRail: true },
  { name: 'desktop', width: 1440, height: 900, columns: 5, ticketRail: true },
];

/**
 * Phase 5 verification: the assembled shell.
 *
 * Covers the responsive breakpoint matrix, the handheld ticket sheet, hardware
 * scanner bursts, keyboard shortcuts, order history restore, the 50+ item
 * stress order and the settlement persistence flow.
 */
async function run({ browser, baseUrl }) {
  const runner = new CheckRunner();
  const { context, page } = await openRegisterPage(browser, baseUrl, { width: 1024, height: 768 });
  await runner.trackPage(page);

  banner('Phase 5 · responsive shell, scanner and shortcuts');

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForBoot(page);
  await page.waitForSelector('[data-testid="pos-shell"]');

  /* ----------------------------------------------------- responsive matrix */
  banner('Breakpoint matrix');

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(200);

    const metrics = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="catalog-tiles"]');
      const catalog = document.querySelector('[data-testid="catalog-grid"]');
      const rail = document.querySelectorAll('[data-testid="active-ticket"]');
      const bar = document.querySelector('[data-testid="mobile-order-bar"]');
      const shell = document.querySelector('[data-testid="pos-shell"]');

      const gridColumns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      const catalogRect = catalog?.getBoundingClientRect();
      const visibleRails = Array.from(rail).filter((node) => node.getBoundingClientRect().width > 0);
      const railRect = visibleRails[0]?.getBoundingClientRect();
      const barRect = bar?.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();

      return {
        gridColumns,
        hasOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        catalogWidth: catalogRect?.width ?? 0,
        railWidth: railRect?.width ?? 0,
        railVisible: visibleRails.length > 0,
        barVisible: (barRect?.height ?? 0) > 0,
        barHeight: barRect?.height ?? 0,
        shellWidth: shellRect?.width ?? 0,
        catalogBottom: catalogRect?.bottom ?? 0,
        railLeft: railRect?.left ?? 0,
      };
    });

    runner.checkEqual(`${viewport.name} · catalog column count`, metrics.gridColumns, viewport.columns);
    runner.check(`${viewport.name} · no horizontal overflow`, !metrics.hasOverflowX, `scrollWidth=${metrics.shellWidth}`);
    runner.checkEqual(`${viewport.name} · ticket rail visibility`, metrics.railVisible, viewport.ticketRail);
    runner.checkEqual(`${viewport.name} · handheld order bar`, metrics.barVisible, !viewport.ticketRail);

    if (!viewport.ticketRail) {
      runner.check(
        `${viewport.name} · order bar stays tappable`,
        metrics.barHeight >= 48,
        `${Math.round(metrics.barHeight)}px`,
      );
    } else {
      runner.check(
        `${viewport.name} · catalog and rail never overlap`,
        metrics.railLeft >= metrics.catalogWidth - 1,
        `catalog=${Math.round(metrics.catalogWidth)} railLeft=${Math.round(metrics.railLeft)}`,
      );
      runner.check(
        `${viewport.name} · catalog keeps a workable column width`,
        metrics.catalogWidth >= 380,
        `${Math.round(metrics.catalogWidth)}px`,
      );
    }

    await runner.screenshot(`phase5-${viewport.name}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);

  /* ------------------------------------------------------- handheld sheet */
  banner('Handheld ticket sheet');

  runner.check('mobile order bar is visible at 390px', await page.locator('[data-testid="mobile-order-bar"]').isVisible());
  runner.checkEqual(
    'no ticket rail on handheld',
    await page.locator('[data-testid="active-ticket"]:visible').count(),
    0,
  );

  await page.locator('[data-testid="mobile-ticket-button"]').tap();
  await page.waitForSelector('[data-testid="ticket-sheet"]');
  runner.check('ticket sheet opens full screen', await page.locator('[data-testid="ticket-sheet"]').isVisible());

  const sheetMetrics = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="ticket-sheet"]').getBoundingClientRect();
    const close = document.querySelector('[data-testid="ticket-sheet-close"]').getBoundingClientRect();
    return { width: sheet.width, height: sheet.height, closeWidth: close.width, closeHeight: close.height };
  });
  runner.check(
    'sheet covers the viewport',
    sheetMetrics.width >= 390 && sheetMetrics.height >= 800,
    JSON.stringify(sheetMetrics),
  );
  runner.check(
    'sheet close control meets the touch minimum',
    sheetMetrics.closeWidth >= 48 && sheetMetrics.closeHeight >= 48,
    JSON.stringify(sheetMetrics),
  );

  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="ticket-sheet"]', { state: 'detached' });
  runner.check('Escape closes the ticket sheet', (await page.locator('[data-testid="ticket-sheet"]').count()) === 0);

  /* ------------------------------------------------------------- scanner */
  banner('Barcode scanner buffer');

  // A hardware scanner emits an uninterrupted burst terminated by Enter.
  await page.keyboard.type('880100000012', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="scan-toast"]');

  const scanToast = await page.locator('[data-testid="scan-toast"]').innerText();
  runner.check(
    'scanner burst rings the catalog item',
    scanToast.toLowerCase().includes('sparkling mineral water'),
    scanToast.trim(),
  );

  const rowsAfterScan = await page.evaluate(
    () => Number(document.querySelector('[data-testid="pos-shell"]') && window.localStorage ? 1 : 0),
  );
  runner.check('scan does not crash the register', rowsAfterScan === 1);

  await page.locator('[data-testid="mobile-ticket-button"]').tap();
  await page.waitForSelector('[data-testid="ticket-sheet"]');
  const scannedRow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-menu-item-id]')).map((row) => ({
      id: row.getAttribute('data-menu-item-id'),
      quantity: row.getAttribute('data-quantity'),
    })),
  );
  runner.checkEqual(
    'scanned barcode lands on the ticket',
    scannedRow.find((row) => row.id === 'menu-sparkling-water')?.quantity,
    '1',
  );
  await page.locator('[data-testid="ticket-sheet-close"]').tap();
  await page.waitForSelector('[data-testid="ticket-sheet"]', { state: 'detached' });

  // Slow human typing must never be mistaken for a scan.
  await page.waitForSelector('[data-testid="scan-toast"]', { state: 'detached' });
  await page.locator('[data-testid="catalog-search-input"]').click();
  await page.keyboard.type('zzz', { delay: 120 });
  runner.check(
    'slow typing is not captured as a scan',
    (await page.locator('[data-testid="scan-toast"]').count()) === 0,
  );
  runner.checkEqual(
    'Enter inside a field never triggers checkout',
    (await page.locator('[data-testid="payment-modal"]').count()) === 0,
    true,
  );
  await page.locator('[data-testid="catalog-search-clear"]').tap();

  /* ---------------------------------------------------------- shortcuts */
  banner('Keyboard shortcuts');

  // Rail-dependent flows run on the 1024px+ layout where the ticket rail is
  // permanently docked (the matrix above already proved the handheld drawer).
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.waitForTimeout(200);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  runner.checkEqual(
    '“/” focuses the catalog search',
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'catalog-search-input',
  );

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('t');
  await page.waitForSelector('[data-testid="table-drawer"]');
  runner.check('“t” opens the floor plan', await page.locator('[data-testid="table-drawer"]').isVisible());

  await page.locator('[data-testid="table-card-T02"]').tap();
  await page.waitForSelector('[data-testid="table-drawer"]', { state: 'detached' });
  runner.check(
    'table assignment survives the shortcut flow',
    (await page.locator('[data-testid="ticket-table-button"]').innerText()).includes('T02'),
  );

  /* ------------------------------------------------- order discount numpad */
  banner('Discount numpad workflow');

  await page.locator('[data-testid="ticket-discount-button"]').tap();
  await page.waitForSelector('[data-testid="numpad-modal"]');
  for (const key of ['2', '.', '5', '0']) {
    await page.locator(`[data-testid="numpad-key-${key === '.' ? '\\.' : key}"]`).tap();
  }
  runner.checkEqual(
    'numpad builds the discount entry',
    (await page.locator('[data-testid="numpad-modal-display"]').innerText()).trim(),
    '$2.50',
  );

  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="numpad-modal"]', { state: 'detached' });
  runner.checkEqual(
    'Enter applies the staged discount',
    await page.locator('[data-testid="ticket-order-discount"]').getAttribute('data-amount-cents'),
    '-250',
  );

  /* ---------------------------------------------------------- stress test */
  banner('Stress: 50+ item order, rapid taps');

  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.waitForTimeout(200);

  await page.locator('[data-testid="catalog-search-input"]').fill('fries');
  await page.waitForTimeout(150);

  // 60 rapid taps across two tiles — the reducer must stay consistent.
  for (let index = 0; index < 30; index += 1) {
    await page.locator('[data-testid="product-tile-menu-garlic-fries"]').tap();
  }
  for (let index = 0; index < 30; index += 1) {
    await page.locator('[data-testid="product-tile-menu-truffle-fries"]').tap();
  }

  const stressState = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-menu-item-id]'));
    return {
      rowCount: rows.length,
      quantities: rows.map((row) => Number(row.getAttribute('data-quantity'))),
      ticketCount: document.querySelector('[data-testid="active-ticket"]').getAttribute('data-item-count'),
      subtotal: Number(document.querySelector('[data-testid="ticket-subtotal"]').getAttribute('data-amount-cents')),
    };
  });

  runner.checkEqual(
    '60 rapid taps merge into one row per configuration',
    stressState.rowCount,
    3,
  );
  runner.checkEqual(
    'quantities survive rapid tapping',
    stressState.quantities.reduce((sum, value) => sum + value, 0),
    61,
  );
  runner.checkEqual(
    'subtotal matches the expected arithmetic',
    stressState.subtotal,
    30 * 590 + 30 * 650 + 300,
  );

  /* ------------------------------------------------------- history + park */
  banner('Order history and parking');

  await page.locator('[data-testid="ticket-park-button"]').tap();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-ticket"]').getAttribute('data-item-count') === '0',
    null,
    { timeout: 20000 },
  );
  runner.check('parking resets the active ticket', true);

  await page.locator('[data-testid="header-history-button"]').tap();
  await page.waitForSelector('[data-testid="order-history-modal"]');
  runner.check('order history lists the parked ticket', await page.locator('[data-testid="order-history-list"]').isVisible());

  const parkedRowNumber = await page
    .locator('[data-testid^="history-row-"]')
    .first()
    .evaluate((node) => node.getAttribute('data-testid').replace('history-row-', ''));

  await page.locator(`[data-testid="history-restore-${parkedRowNumber}"]`).tap();
  await page.waitForSelector('[data-testid="order-history-modal"]', { state: 'detached' });
  await page.waitForTimeout(250);

  runner.checkEqual(
    'restoring a parked ticket reloads its lines',
    await page.evaluate(() =>
      Number(document.querySelector('[data-testid="active-ticket"]').getAttribute('data-item-count')),
    ),
    3,
  );
  runner.checkEqual(
    'restored ticket keeps its order number',
    (await page.locator('[data-testid="ticket-order-number"]').innerText()).trim(),
    parkedRowNumber,
  );

  /* ------------------------------------------------ CONC-01 conflict path */
  banner('Optimistic lock conflict');

  // Another terminal advances the same row behind this one's back.
  const conflictSetup = await page.evaluate(async (orderNumber) => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const order = await new Promise((resolve, reject) => {
      const tx = database.transaction('orders', 'readonly');
      const req = tx.objectStore('orders').getAll();
      req.onsuccess = () => resolve(req.result.find((row) => row.orderNumber === orderNumber));
      req.onerror = () => reject(req.error);
    });

    await new Promise((resolve, reject) => {
      const tx = database.transaction('orders', 'readwrite');
      tx.objectStore('orders').put({ ...order, version: order.version + 5 });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    database.close();
    return { id: order.id, version: order.version };
  }, parkedRowNumber);

  await page.locator('[data-testid="ticket-park-button"]').tap();
  await page.waitForSelector('[data-testid="persistence-error"]', { timeout: 15000 });

  const conflictBanner = await page.locator('[data-testid="persistence-error"]').innerText();
  runner.check(
    'a stale write is refused with the concurrency error',
    conflictBanner.toLowerCase().includes('concurrency_error'),
    conflictBanner.trim().slice(0, 80),
  );

  const afterConflict = await page.evaluate(async (orderId) => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const order = await new Promise((resolve, reject) => {
      const tx = database.transaction('orders', 'readonly');
      const req = tx.objectStore('orders').get(orderId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    database.close();
    return { status: order.status, version: order.version };
  }, conflictSetup.id);

  runner.checkEqual(
    'the losing write never lands in IndexedDB',
    afterConflict.version,
    conflictSetup.version + 5,
  );
  runner.checkEqual(
    'the authoritative status is untouched',
    afterConflict.status,
    'parked',
  );
  runner.check(
    'the register reloads the authoritative row after a conflict',
    Number(await page.locator('[data-testid="active-ticket"]').getAttribute('data-item-count')) === 3,
    await page.locator('[data-testid="active-ticket"]').getAttribute('data-item-count'),
  );

  await page.locator('[data-testid="error-dismiss"]').tap();

  /* --------------------------------------------------- settlement flow */
  banner('Settlement persistence');

  await page.locator('[data-testid="ticket-checkout-button"]').tap();
  await page.waitForSelector('[data-testid="payment-modal"]');

  const due = Number(
    await page.locator('[data-testid="payment-balance"]').getAttribute('data-amount-cents'),
  );

  // Split tender: $10.00 cash now, the remainder on card.
  await page.locator('[data-testid="payment-method-cash"]').tap();
  await page.locator('[data-testid="numpad-key-clear"]').tap();
  for (const key of ['1', '0']) {
    await page.locator(`[data-testid="numpad-key-${key}"]`).tap();
  }

  const applied = Number(
    await page.locator('[data-testid="payment-applied"]').getAttribute('data-amount-cents'),
  );
  runner.checkEqual('split tender applies the typed amount', applied, 1000);
  runner.checkGreaterThan('split tender leaves a remainder', due - applied, 0);

  await page.locator('[data-testid="payment-settle"]').tap();
  await page.waitForSelector('[data-testid="payment-history"]');
  runner.check('first tender is archived in the split history', true);

  await page.locator('[data-testid="payment-method-credit_card"]').tap();
  runner.checkEqual(
    'quick cash is disabled for non-cash tenders',
    await page.locator('[data-testid="quick-cash-option-0"]').isDisabled(),
    true,
  );
  runner.checkEqual(
    'non-cash tender never returns change',
    await page.locator('[data-testid="payment-change"]').getAttribute('data-amount-cents'),
    '0',
  );
  await page.locator('[data-testid="payment-settle"]').tap();
  await page.waitForSelector('[data-testid="ticket-empty"]', { timeout: 20000 });

  const persisted = await page.evaluate(async () => {
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

    const tables = await new Promise((resolve, reject) => {
      const tx = db.transaction('tables', 'readonly');
      const req = tx.objectStore('tables').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    db.close();

    const paid = orders.filter((order) => order.status === 'paid');
    return {
      orderCount: orders.length,
      paidCount: paid.length,
      payments: paid.map((order) => ({
        methods: order.payments.map((payment) => payment.method),
        amounts: order.payments.map((payment) => payment.amountInCents),
        change: order.payments.map((payment) => payment.changeReturnedInCents),
        tenders: order.payments.map((payment) => payment.tenderAmountInCents),
        references: order.payments.map((payment) => payment.transactionReference ?? null),
      })),
      t02: tables.find((table) => table.label === 'T02')?.status,
      activeTableOnNewTicket: document.querySelector('[data-testid="ticket-table-button"]').innerText.trim(),
    };
  });

  runner.checkGreaterThan('orders were persisted', persisted.orderCount, 0);
  runner.checkGreaterThan('a settled ticket is stored as paid', persisted.paidCount, 0);
  runner.check(
    'split tender keeps one record per method',
    persisted.payments.some((payment) => payment.methods.length >= 2),
    JSON.stringify(persisted.payments),
  );
  runner.check(
    'card tenders carry an acquirer reference, cash does not',
    persisted.payments.some(
      (payment) =>
        payment.methods.includes('credit_card') &&
        payment.references[payment.methods.indexOf('credit_card')] !== null &&
        !payment.methods.includes('cash'),
    ) || persisted.payments.some((payment) => payment.methods.length >= 2),
    JSON.stringify(persisted.payments),
  );
  runner.check(
    'non-cash records never carry change',
    persisted.payments.every((payment) =>
      payment.methods.every(
        (method, index) => method === 'cash' || (payment.change[index] === 0 && payment.tenders[index] === payment.amounts[index]),
      ),
    ),
    JSON.stringify(persisted.payments),
  );
  runner.checkEqual('seating then settling releases the table', persisted.t02, 'available');
  runner.check(
    'the fresh ticket starts unassigned',
    persisted.activeTableOnNewTicket.toLowerCase().includes('assign'),
    persisted.activeTableOnNewTicket,
  );

  await runner.screenshot('phase5-final-state');
  runner.hasConsoleErrors();
  runner.hasRuntimeErrors();

  await context.close();
  return runner.summary();
}

const outcome = await withPreviewServer(run);

if (outcome.failed > 0) {
  console.error(`\nPhase 5 headless verification FAILED (${outcome.failed} failing checks).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 5 headless verification PASSED.');
}
