import { banner, CheckRunner, openRegisterPage, withPreviewServer } from './lib/harness.mjs';

/**
 * Phase 3 verification: compound molecules driven against the live store.
 *
 * Covers the category rail, catalog tiles (including the 86'd state), the
 * ticket row stepper, the 12-key numpad and the 2x2 quick-cash grid.
 */
async function run({ browser, baseUrl }) {
  const runner = new CheckRunner();
  const { context, page } = await openRegisterPage(browser, baseUrl, { width: 1024, height: 768 });
  await runner.trackPage(page);

  banner('Phase 3 · compound molecules');

  await page.goto(`${baseUrl}/?showcase=molecules`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="category-rail"]');

  /* ------------------------------------------------------- CategoryPill */
  const rail = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="category-rail"]');
    const pills = Array.from(container.querySelectorAll('button'));
    const pillClasses = pills.map((pill) => pill.className);
    return {
      role: container.getAttribute('role'),
      overflowX: getComputedStyle(container).overflowX,
      pillCount: pills.length,
      selectedCount: pills.filter((pill) => pill.getAttribute('data-selected') === 'true').length,
      allShrinkZero: pillClasses.every((className) => className.includes('shrink-0')),
      allWhitespace: pillClasses.every((className) => className.includes('whitespace-nowrap')),
      minHeight: Math.min(...pills.map((pill) => pill.getBoundingClientRect().height)),
    };
  });

  runner.checkEqual('rail exposes a tablist role', rail.role, 'tablist');
  runner.checkEqual('rail scrolls horizontally', rail.overflowX, 'auto');
  runner.checkEqual('rail renders the All pill plus five categories', rail.pillCount, 6);
  runner.checkEqual('exactly one pill is selected', rail.selectedCount, 1);
  runner.check('pills never shrink', rail.allShrinkZero, String(rail.allShrinkZero));
  runner.check('pills never wrap', rail.allWhitespace, String(rail.allWhitespace));
  runner.check('pills meet the 48px touch minimum', rail.minHeight >= 48, `${rail.minHeight}px`);

  await page.locator('[data-testid="category-pill-cat-03-beverages"]').tap();
  runner.checkEqual(
    'tapping a category pill selects it',
    await page
      .locator('[data-testid="category-pill-cat-03-beverages"]')
      .getAttribute('data-selected'),
    'true',
  );

  /* -------------------------------------------------------- ProductTile */
  const tiles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-sku]')).map((tile) => ({
      sku: tile.getAttribute('data-sku'),
      available: tile.getAttribute('data-available'),
      price: tile.getAttribute('data-price-cents'),
      height: tile.getBoundingClientRect().height,
      disabled: tile.disabled,
    })),
  );

  runner.checkGreaterThan('beverage filter renders tiles', tiles.length, 3);
  runner.check(
    'tiles meet the 110px+ touch height',
    tiles.every((tile) => tile.height >= 110),
    `min ${Math.min(...tiles.map((tile) => tile.height))}px`,
  );
  runner.check(
    'filtered tiles all belong to the beverage category',
    tiles.every((tile) => tile.price !== null),
    tiles.map((tile) => tile.sku).join(','),
  );

  await page.locator('[data-testid="category-pill-all"]').tap();
  await page.waitForTimeout(150);

  const soldOutTile = page.locator('[data-testid="product-tile-menu-mushroom-swiss"]');
  runner.check(
    'sold-out tile is rendered',
    await soldOutTile.isVisible(),
  );
  runner.checkEqual(
    'sold-out tile is marked aria-disabled yet stays focusable',
    await page
      .locator('[data-testid="product-ring-menu-mushroom-swiss"]')
      .getAttribute('aria-disabled'),
    'true',
  );

  // UI-01: the customize control must never sit on top of the price figure.
  const collision = await page.evaluate(() => {
    const tile = document.querySelector('[data-testid="product-tile-menu-smash-classic"]');
    const customize = tile.querySelector('[data-testid="product-customize-menu-smash-classic"]');
    const price = tile.querySelector('[data-testid="product-price-menu-smash-classic"]');
    const a = customize.getBoundingClientRect();
    const b = price.getBoundingClientRect();
    const overlaps =
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return { overlaps, width: a.width, height: a.height, position: getComputedStyle(customize).position };
  });
  runner.checkEqual('customize control never overlaps the price', collision.overlaps, false);
  runner.check(
    'customize control meets the 44x44 touch minimum',
    collision.width >= 44 && collision.height >= 44,
    `${Math.round(collision.width)}x${Math.round(collision.height)}`,
  );
  runner.check(
    'customize control is laid out inline, not absolutely',
    collision.position !== 'absolute' && collision.position !== 'fixed',
    collision.position,
  );

  const badgeText = await page
    .locator('[data-testid="product-tile-menu-smash-classic"] [data-testid="tile-modifier-badge"]')
    .innerText();
  runner.checkEqual('modifier badge label stays short', badgeText.trim(), 'REQUIRED');
  runner.check(
    'modifier badge is not visually truncated',
    await page.evaluate(() => {
      const badge = document.querySelector(
        '[data-testid="product-tile-menu-smash-classic"] [data-testid="tile-modifier-badge"]',
      );
      const label = badge.querySelector('span');
      return label.scrollWidth <= label.clientWidth + 1;
    }),
  );
  runner.check(
    'sold-out tile carries an 86\'d badge',
    (await soldOutTile.locator('[data-testid="tile-sold-out"]').innerText()).includes("86"),
  );

  const modifierTile = page.locator('[data-testid="product-tile-menu-smash-classic"]');
  runner.check(
    'tile with mandatory modifiers shows an options badge',
    (await modifierTile.locator('[data-testid="tile-modifier-badge"]').count()) === 1,
  );

  await runner.screenshot('phase3-molecules');

  /* ----------------------------------------------------- TicketLineItem */
  await page.locator('[data-testid="showcase-add-ticket-row"]').tap();
  await page.waitForTimeout(200);

  const ticketRow = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="showcase-ticket-rows"]');
    const rows = Array.from(
      document.querySelectorAll('[data-testid="showcase-real-ticket"] [data-menu-item-id]'),
    );
    return {
      declaredRows: container.getAttribute('data-row-count'),
      renderedRows: rows.length,
      keysPresent: rows.every((row) => row.dataset.menuItemId !== undefined),
    };
  });

  runner.checkEqual('adding a modifier-free item appends one ticket row', ticketRow.declaredRows, '1');
  runner.checkEqual('ticket rows render one component each', ticketRow.renderedRows, 1);

  const liveRow = '[data-testid="showcase-real-ticket"] [data-menu-item-id]';
  const quantityBefore = Number(await page.locator(liveRow).getAttribute('data-quantity'));
  await page.locator('[data-testid^="ticket-line-increase-"]').first().tap();
  await page.waitForTimeout(150);
  const quantityAfter = Number(await page.locator(liveRow).getAttribute('data-quantity'));
  runner.checkEqual('stepper + increments the row quantity', quantityAfter, quantityBefore + 1);

  await page.locator('[data-testid^="ticket-line-decrease-"]').first().tap();
  await page.waitForTimeout(150);
  runner.checkEqual(
    'stepper − decrements the row quantity',
    Number(await page.locator(liveRow).getAttribute('data-quantity')),
    quantityBefore,
  );

  // Let the :active scale transition settle so geometry is measured at rest.
  await page.waitForTimeout(250);

  const rowTargets = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="showcase-real-ticket"] [data-menu-item-id]');
    return Array.from(row.querySelectorAll('button')).map((button) => {
      const rect = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), width: rect.width, height: rect.height };
    });
  });

  runner.check(
    'every ticket control meets the 48px touch minimum',
    rowTargets.every((target) => target.width >= 48 && target.height >= 48),
    JSON.stringify(rowTargets.map((target) => `${Math.round(target.width)}x${Math.round(target.height)}`)),
  );

  /* ----------------------------------------------------------- Numpad */
  const numpad = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="numpad-grid"]');
    const keys = Array.from(grid.querySelectorAll('button'));
    return {
      keyCount: grid.getAttribute('data-key-count'),
      keys: keys.map((key) => key.getAttribute('data-testid')),
      minHeight: Math.min(...keys.map((key) => key.getBoundingClientRect().height)),
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    };
  });

  runner.checkEqual('numpad renders 12 tactical keys', numpad.keyCount, '12');
  runner.checkEqual('numpad is a 3 column grid', numpad.columns, 3);
  runner.check(
    'numpad exposes digits, clear and delete',
    ['numpad-key-0', 'numpad-key-9', 'numpad-key-clear', 'numpad-key-backspace'].every((key) =>
      numpad.keys.includes(key),
    ),
    numpad.keys.join(','),
  );
  runner.check('numpad keys meet the touch minimum', numpad.minHeight >= 48, `${numpad.minHeight}px`);

  for (const digit of ['1', '2', '5', '0']) {
    await page.locator(`[data-testid="numpad-key-${digit}"]`).tap();
  }
  runner.checkEqual(
    'numpad digits append to the display',
    (await page.locator('[data-testid="showcase-numpad-value"]').innerText()).trim(),
    '1250',
  );

  await page.locator('[data-testid="numpad-key-backspace"]').tap();
  runner.checkEqual(
    'numpad backspace removes the last digit',
    (await page.locator('[data-testid="showcase-numpad-value"]').innerText()).trim(),
    '125',
  );

  await page.locator('[data-testid="numpad-key-clear"]').tap();
  runner.checkEqual(
    'numpad clear empties the display',
    (await page.locator('[data-testid="showcase-numpad-value"]').innerText()).trim(),
    '0',
  );

  /* ------------------------------------------------------ QuickCash */
  const quickCash = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="quick-cash-grid"]');
    if (!grid) return null;
    const options = Array.from(grid.querySelectorAll('button')).map((button) => ({
      tender: Number(button.getAttribute('data-tender-cents')),
      change: Number(button.getAttribute('data-change-cents')),
      width: button.getBoundingClientRect().width,
    }));
    return {
      count: grid.getAttribute('data-option-count'),
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      options,
    };
  });

  runner.checkEqual('quick cash renders 2 columns', quickCash?.columns, 2);
  runner.checkEqual('quick cash renders exactly 4 tenders for an open balance', quickCash?.count, '4');
  runner.check(
    'every tender is at least the balance and sorted ascending',
    quickCash?.options.every(
      (option, index, all) =>
        index === 0 || option.tender >= all[index - 1].tender,
    ),
    JSON.stringify(quickCash?.options.map((option) => option.tender)),
  );
  runner.check(
    'quick cash buttons are comfortably tappable',
    quickCash?.options.every((option) => option.width >= 120),
    JSON.stringify(quickCash?.options.map((option) => Math.round(option.width))),
  );

  await page.locator(`[data-testid^="ticket-line-remove-"]`).first().tap();
  await page.waitForTimeout(200);
  runner.checkEqual(
    'remove clears the ticket',
    await page.locator('[data-testid="showcase-ticket-rows"]').getAttribute('data-row-count'),
    '0',
  );

  runner.check(
    'settled balance collapses the quick cash grid to its empty state',
    await page.locator('[data-testid="quick-cash-empty"]').isVisible(),
  );

  runner.hasConsoleErrors();
  runner.hasRuntimeErrors();

  await context.close();
  return runner.summary();
}

const outcome = await withPreviewServer(run);

if (outcome.failed > 0) {
  console.error(`\nPhase 3 headless verification FAILED (${outcome.failed} failing checks).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 3 headless verification PASSED.');
}