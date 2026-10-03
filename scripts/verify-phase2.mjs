import { banner, CheckRunner, openRegisterPage, withPreviewServer } from './lib/harness.mjs';

/**
 * Phase 2 verification: Tailwind v4 theme tokens and the atomic primitive layer.
 *
 * Runs against `?showcase=primitives`, which mounts every primitive with stable
 * `data-testid` hooks so touch geometry, formatting and overlay behaviour can
 * be asserted in a real headless Chromium.
 */
async function run({ browser, baseUrl }) {
  const runner = new CheckRunner();
  const { context, page } = await openRegisterPage(browser, baseUrl, { width: 1024, height: 768 });
  await runner.trackPage(page);

  banner('Phase 2 · design tokens and atomic primitives');

  await page.goto(`${baseUrl}/?showcase=primitives`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="showcase-button-primary"]');

  /* ------------------------------------------------------------ tokens */
  const themeTokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const readHex = (variableName) => {
      const probe = document.createElement('div');
      probe.style.color = `var(${variableName})`;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };

    return {
      primary: readHex('--color-primary'),
      tender: readHex('--color-tender'),
      danger: readHex('--color-danger'),
      canvas: styles.getPropertyValue('--color-canvas').trim(),
      touchSpacing: styles.getPropertyValue('--spacing-touch').trim(),
    };
  });

  runner.check('theme exposes emerald primary token', themeTokens.primary === 'rgb(16, 185, 129)', themeTokens.primary);
  runner.check('theme exposes amber tender token', themeTokens.tender === 'rgb(245, 158, 11)', themeTokens.tender);
  runner.check('theme exposes rose danger token', themeTokens.danger === 'rgb(244, 63, 94)', themeTokens.danger);
  runner.check('theme exposes zinc canvas token', themeTokens.canvas.length > 0, themeTokens.canvas);
  runner.checkEqual('theme exposes 48px touch spacing token', themeTokens.touchSpacing, '3rem');

  /* -------------------------------------------------------- TouchButton */
  const touchTargets = await page.evaluate(() => {
    const ids = [
      'showcase-button-primary',
      'showcase-button-tender',
      'showcase-button-danger',
      'showcase-button-loading',
      'showcase-button-modal',
    ];

    return ids.map((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) return { id, found: false };
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        id,
        found: true,
        height: rect.height,
        width: rect.width,
        activeScale: styles.transitionDuration,
      };
    });
  });

  for (const target of touchTargets) {
    runner.check(
      `TouchButton ${target.id} meets 48px touch target`,
      target.found && target.height >= 48 && target.width >= 48,
      `${Math.round(target.width)}x${Math.round(target.height)}`,
    );
  }

  const primaryActiveRule = await page.evaluate(() => {
    const matches = [];

    const walk = (ruleList) => {
      for (const rule of Array.from(ruleList)) {
        // Leaf utility rules first: an empty nested list is still truthy.
        if (rule.selectorText && rule.style && (rule.style.scale || rule.style.transform)) {
          const scaleValue = rule.style.scale || rule.style.transform;
          if (rule.selectorText.includes(':active') && scaleValue.includes('scale')) {
            matches.push(`${rule.selectorText} => ${scaleValue}`);
          }
        }
        if (rule.cssRules && rule.cssRules.length > 0) {
          walk(rule.cssRules);
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        // Cross-origin stylesheets are not readable; irrelevant for this bundle.
      }
    }

    return matches[0] ?? null;
  });
  runner.check('active:scale-95 utility compiled into stylesheet', Boolean(primaryActiveRule), primaryActiveRule ?? 'missing');

  // Press-and-hold the button and read the live active state: this proves the
  // tactile feedback is real at runtime, not just present in the stylesheet.
  const pressTarget = page.locator('[data-testid="showcase-button-tender"]');
  const box = await pressTarget.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const idleState = await pressTarget.evaluate((node) => ({
    active: node.matches(':active'),
    scaleX: getComputedStyle(node).getPropertyValue('--tw-scale-x').trim(),
  }));
  await page.mouse.down();
  const pressedState = await pressTarget.evaluate((node) => ({
    active: node.matches(':active'),
    scaleX: getComputedStyle(node).getPropertyValue('--tw-scale-x').trim(),
  }));
  await page.mouse.up();

  runner.check(
    'press feedback scales the control down (no hover dependency)',
    idleState.active === false &&
      idleState.scaleX !== '95%' &&
      pressedState.active === true &&
      pressedState.scaleX === '95%',
    `idle=${JSON.stringify(idleState)} pressed=${JSON.stringify(pressedState)}`,
  );

  await page.locator('[data-testid="showcase-button-tender"]').tap();
  runner.checkEqual(
    'TouchButton fires its press handler',
    (await page.locator('[data-testid="showcase-last-press"]').innerText()).trim(),
    'last press: tender',
  );

  await page.locator('[data-testid="showcase-button-danger"]').tap();
  runner.checkEqual(
    'stateful primitive re-renders after press',
    (await page.locator('[data-testid="showcase-last-press"]').innerText()).trim(),
    'last press: danger',
  );

  /* -------------------------------------------------------- PriceDisplay */
  const priceMetrics = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="showcase-price-md"]');
    if (!element) return null;
    const styles = getComputedStyle(element);
    return {
      text: element.textContent?.trim(),
      fontVariantNumeric: styles.fontVariantNumeric,
      fontFamily: styles.fontFamily,
      amountCents: element.getAttribute('data-amount-cents'),
    };
  });

  runner.checkEqual('PriceDisplay formats 1450 cents as $14.50', priceMetrics?.text, '$14.50');
  runner.checkEqual(
    'PriceDisplay uses tabular numerals',
    priceMetrics?.fontVariantNumeric.includes('tabular-nums'),
    true,
  );
  runner.check('PriceDisplay renders in monospace', priceMetrics?.fontFamily.includes('mono'), priceMetrics?.fontFamily);
  runner.checkEqual('PriceDisplay exposes raw cents for assertions', priceMetrics?.amountCents, '1450');

  /* -------------------------------------------------------------- Badge */
  const badgeTone = await page
    .locator('[data-testid="showcase-badge"]')
    .evaluate((node) => node.getAttribute('data-tone'));
  runner.checkEqual('Badge exposes its tone', badgeTone, 'primary');

  const prepTimer = await page
    .locator('[data-testid="preparation-timer"]')
    .first()
    .evaluate((node) => ({
      minutes: node.getAttribute('data-minutes'),
      text: node.textContent?.trim(),
    }));
  runner.checkEqual('PreparationTimer reports prep minutes', prepTimer.minutes, '9');
  runner.check('PreparationTimer renders a human label', prepTimer.text?.includes('9 min'), prepTimer.text);

  const statusDots = await page.locator('[data-status]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-status')),
  );
  runner.check(
    'StatusDot renders table + connectivity states',
    ['available', 'occupied', 'reserved', 'payment_pending', 'online'].every((status) =>
      statusDots.includes(status),
    ),
    statusDots.join(','),
  );

  /* -------------------------------------------------------- SearchInput */
  const searchInput = page.locator('[data-testid="catalog-search-input"]');
  await searchInput.fill('');
  await searchInput.type('truffle');
  runner.checkEqual(
    'SearchInput emits keystrokes',
    (await page.locator('[data-testid="showcase-search-value"]').innerText()).trim(),
    'value: "truffle"',
  );
  runner.check(
    'SearchInput clear button appears when there is a query',
    await page.locator('[data-testid="catalog-search-clear"]').isVisible(),
  );

  await page.locator('[data-testid="catalog-search-clear"]').tap();
  runner.checkEqual(
    'SearchInput clear button empties the field',
    await searchInput.inputValue(),
    '',
  );
  runner.check(
    'SearchInput hides the clear button when empty',
    (await page.locator('[data-testid="catalog-search-clear"]').count()) === 0,
  );

  /* ---------------------------------------------------------- ModalShell */
  runner.check('modal is closed initially', (await page.locator('[data-testid="showcase-modal"]').count()) === 0);

  await page.locator('[data-testid="showcase-launch-modal"]').tap();
  await page.waitForSelector('[data-testid="showcase-modal"]');

  const modalMetrics = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="showcase-modal"]');
    const closeButton = document.querySelector('[data-testid="showcase-modal-close"]');
    if (!dialog || !closeButton) return null;
    const rect = dialog.getBoundingClientRect();
    const closeRect = closeButton.getBoundingClientRect();
    return {
      role: dialog.getAttribute('role'),
      ariaModal: dialog.getAttribute('aria-modal'),
      labelledBy: dialog.getAttribute('aria-labelledby'),
      width: rect.width,
      closeTarget: { width: closeRect.width, height: closeRect.height },
      bodyOverflow: document.body.style.overflow,
      focusedInside: dialog.contains(document.activeElement),
    };
  });

  runner.checkEqual('ModalShell exposes dialog role', modalMetrics?.role, 'dialog');
  runner.checkEqual('ModalShell is aria-modal', modalMetrics?.ariaModal, 'true');
  runner.check('ModalShell links an accessible title', Boolean(modalMetrics?.labelledBy), modalMetrics?.labelledBy);
  runner.check('ModalShell panel fits the 1024px viewport', (modalMetrics?.width ?? 0) <= 1024, `${modalMetrics?.width}`);
  runner.check(
    'ModalShell close button meets 48px touch target',
    modalMetrics?.closeTarget.width >= 48 && modalMetrics?.closeTarget.height >= 48,
    `${modalMetrics?.closeTarget.width}x${modalMetrics?.closeTarget.height}`,
  );
  runner.checkEqual('ModalShell locks body scroll', modalMetrics?.bodyOverflow, 'hidden');
  runner.check('ModalShell moves focus inside the dialog', modalMetrics?.focusedInside === true);

  await runner.screenshot('phase2-primitives-modal');

  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="showcase-modal"]', { state: 'detached' });
  runner.check('Escape closes the modal', (await page.locator('[data-testid="showcase-modal"]').count()) === 0);

  await page.locator('[data-testid="showcase-button-modal"]').tap();
  await page.waitForSelector('[data-testid="showcase-modal"]');
  await page.locator('[data-testid="showcase-modal-backdrop"]').tap({ position: { x: 5, y: 5 } });
  await page.waitForSelector('[data-testid="showcase-modal"]', { state: 'detached' });
  runner.check('backdrop tap dismisses the modal', (await page.locator('[data-testid="showcase-modal"]').count()) === 0);

  await page.locator('[data-testid="showcase-launch-modal"]').tap();
  await page.waitForSelector('[data-testid="showcase-modal"]');
  await page.locator('[data-testid="showcase-modal-confirm"]').tap();
  await page.waitForSelector('[data-testid="showcase-modal"]', { state: 'detached' });
  runner.check('footer action dismisses the modal', (await page.locator('[data-testid="showcase-modal"]').count()) === 0);

  runner.hasConsoleErrors();
  runner.hasRuntimeErrors();

  await context.close();
  return runner.summary();
}

const outcome = await withPreviewServer(run);

if (outcome.failed > 0) {
  console.error(`\nPhase 2 headless verification FAILED (${outcome.failed} failing checks).`);
  process.exitCode = 1;
} else {
  console.log('\nPhase 2 headless verification PASSED.');
}