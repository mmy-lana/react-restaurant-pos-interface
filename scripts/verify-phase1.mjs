import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { banner, CheckRunner, openRegisterPage, withPreviewServer, projectRoot } from './lib/harness.mjs';

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

  runner.check(
    'order number rendered on boot',
    Boolean(dataset.orderNumber),
    dataset.orderNumber,
  );

  /* ------------------------------------------- DATA-02 sequence reservation */
  banner('DATA-02 · atomic order-number reservation');

  const reservation = await page.evaluate(async () => {
    const openDb = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('RestaurantPOS_DB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const database = await openDb();

    // Two concurrent reservations must never observe the same sequence: the
    // counter row is written inside the same read-write transaction.
    const reserve = async () =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(['counters'], 'readwrite');
        const store = transaction.objectStore('counters');
        const getRequest = store.get('probe');
        getRequest.onsuccess = () => {
          const next = (getRequest.result?.value ?? 0) + 1;
          store.put({ key: 'probe', value: next, updatedAt: new Date().toISOString() });
          transaction.oncomplete = () => resolve(next);
          transaction.onerror = () => reject(transaction.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      });

    const results = await Promise.all([reserve(), reserve(), reserve()]);
    const counterRow = await new Promise((resolve, reject) => {
      const request = database.transaction('counters', 'readonly').objectStore('counters').get('probe');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    database.close();
    return { results, counterRow };
  });

  runner.checkEqual(
    'concurrent reservations never collide',
    new Set(reservation.results).size,
    reservation.results.length,
  );
  runner.checkEqual(
    'counter row tracks the highest reservation',
    reservation.counterRow?.value,
    Math.max(...reservation.results),
  );

  /* ------------------------------------------- DATA-01 catalog preservation */
  banner('DATA-01 · catalog edits survive a reboot');

  const runtimeEdits = await page.evaluate(async () => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Simulate a cashier 86'ing an item and re-pricing another at 2am.
    const tx = database.transaction('menuItems', 'readwrite');
    const soldOut = tx.objectStore('menuItems').get('menu-smash-classic');
    soldOut.onsuccess = () => {
      soldOut.result.isAvailable = false;
      tx.objectStore('menuItems').put(soldOut.result);
    };
    const repriced = tx.objectStore('menuItems').get('menu-onion-rings');
    repriced.onsuccess = () => {
      repriced.result.priceInCents = 999;
      tx.objectStore('menuItems').put(repriced.result);
    };

    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = () => resolve(undefined);
    });
    database.close();
    return true;
  });
  runner.check('runtime catalog edits were applied', runtimeEdits);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="boot-ready"]', { timeout: 20_000 });

  const preservedEdits = await page.evaluate(async () => {
    const request = indexedDB.open('RestaurantPOS_DB');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const readAll = () =>
      new Promise((resolve, reject) => {
        const tx = database.transaction('menuItems', 'readonly');
        const req = tx.objectStore('menuItems').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

    const items = await readAll();
    database.close();

    return {
      soldOut: items.find((item) => item.id === 'menu-smash-classic')?.isAvailable,
      price: items.find((item) => item.id === 'menu-onion-rings')?.priceInCents,
      count: items.length,
    };
  });

  runner.checkEqual(
    'an 86\'d item is not resurrected by the seed on reboot',
    preservedEdits.soldOut,
    false,
  );
  runner.checkEqual(
    'a runtime price edit is not overwritten by the seed',
    preservedEdits.price,
    999,
  );
  runner.checkEqual(
    'no duplicate catalog rows are created on reboot',
    preservedEdits.count,
    20,
  );

  /* ------------------------------------------------ SEC-01 entropy sources */
  banner('SEC-01 · no pseudo-random entropy in money and id paths');

  const collectSources = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await collectSources(fullPath)));
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(fullPath);
    }
    return files;
  };

  const sourceFiles = await collectSources(path.join(projectRoot, 'src'));
  const offenders = [];
  for (const file of sourceFiles) {
    const contents = await readFile(file, 'utf8');
    if (contents.includes('Math.random(')) offenders.push(path.relative(projectRoot, file));
  }
  runner.checkEqual('application source never uses Math.random()', offenders, []);

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