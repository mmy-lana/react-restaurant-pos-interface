import { banner, CheckRunner, openRegisterPage, withPreviewServer } from './lib/harness.mjs';

/**
 * Phase 1 verification: domain model, offline storage, seeding and the boot gate.
 */
async function run({ browser, baseUrl }) {
  const runner = new CheckRunner();
  const { context, page } = await openRegisterPage(browser, baseUrl);
  await runner.trackPage(page);

  banner('Phase 1 · boot, seed and persistence core');

  // The boot console stays reachable as a reference screen once the register
  // shell is mounted.
  await page.goto(`${baseUrl}/?showcase=boot`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="boot-ready"]', { timeout: 20_000 });

  const dataset = await page.locator('[data-testid="boot-ready"]').evaluate((node) => ({
    orderNumber: node.getAttribute('data-order-number'),
    menuCount: node.getAttribute('data-menu-count'),
    tableCount: node.getAttribute('data-table-count'),
    categoryCount: node.getAttribute('data-category-count'),
  }));

  runner.checkMatch('order number matches POS-YYYYMMDD-XXXX', dataset.orderNumber, /^POS-\d{8}-\d{4}$/);
  runner.checkEqual('seeded categories', dataset.categoryCount, '5');
  runner.checkEqual('seeded menu items', dataset.menuCount, '20');
  runner.checkEqual('seeded floor tables', dataset.tableCount, '14');

  const bootText = await page.locator('[data-testid="boot-ready"]').innerText();
  runner.check('boot console reports POS Core Online', bootText.includes('POS CORE ONLINE'), 'title');
  runner.check('boot console reports cashier shift', bootText.includes('Alex R.'), 'session');
  runner.check('boot console reports opening float', bootText.includes('$200.00'), 'float');

  const indexedDbState = await page.evaluate(async () => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const readCount = (storeName) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request2 = tx.objectStore(storeName).count();
        request2.onsuccess = () => resolve(request2.result);
        request2.onerror = () => reject(request2.error);
      });

    const counts = {
      menuItems: await readCount('menuItems'),
      categories: await readCount('categories'),
      tables: await readCount('tables'),
      sessions: await readCount('sessions'),
      orders: await readCount('orders'),
    };

    db.close();
    return counts;
  });

  runner.checkEqual('IndexedDB menuItems rows', indexedDbState.menuItems, 20);
  runner.checkEqual('IndexedDB categories rows', indexedDbState.categories, 5);
  runner.checkEqual('IndexedDB tables rows', indexedDbState.tables, 14);
  runner.checkEqual('IndexedDB cashier session rows', indexedDbState.sessions, 1);
  runner.checkEqual('IndexedDB orders start empty', indexedDbState.orders, 0);

  const sortedOrderNumberProbe = await page.evaluate(async () => {
    const first = document.querySelector('[data-testid="boot-ready"]')?.getAttribute('data-order-number');
    const reload = new Promise((resolve) => setTimeout(resolve, 50));
    await reload;
    return first;
  });
  runner.check('order number rendered on boot', Boolean(sortedOrderNumberProbe), sortedOrderNumberProbe);

  await runner.screenshot('phase1-boot-console');

  runner.hasConsoleErrors();
  runner.hasRuntimeErrors();

  await context.close();
  return runner.summary();
}

const outcome = await withPreviewServer(run);

if (outcome.failed > 0) {
  console.error(`\nPhase 1 headless verification FAILED (${outcome.failed} failing checks).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 1 headless verification PASSED.');
}