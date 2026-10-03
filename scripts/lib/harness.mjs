import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, '..', '..');
export const artifactDir = path.join(projectRoot, '.verify');

/**
 * Headless Chrome verification harness.
 *
 * Every check runs against the production bundle served by `vite preview`, in
 * a throwaway browser profile. The developer's personal browser is never
 * touched: Playwright launches its own isolated context on every run.
 */

export class CheckRunner {
  #results = [];
  #page = null;
  #consoleErrors = [];
  #pageErrors = [];

  async trackPage(page) {
    this.#page = page;
    page.on('console', (message) => {
      if (message.type() === 'error') this.#consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => this.#pageErrors.push(error.message));
  }

  check(name, passed, detail = '') {
    this.#results.push({ name, passed: Boolean(passed), detail });
    const mark = passed ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
    return Boolean(passed);
  }

  checkEqual(name, actual, expected) {
    return this.check(
      name,
      Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected),
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }

  checkMatch(name, value, pattern) {
    return this.check(name, pattern.test(String(value)), `${JSON.stringify(value)} !~ ${pattern}`);
  }

  checkGreaterThan(name, actual, minimum) {
    return this.check(name, Number(actual) > Number(minimum), `${actual} > ${minimum}`);
  }

  get page() {
    if (!this.#page) throw new Error('Verification page has not been tracked yet.');
    return this.#page;
  }

  consoleErrors() {
    return [...this.#consoleErrors];
  }

  pageErrors() {
    return [...this.#pageErrors];
  }

  hasRuntimeErrors() {
    return this.check(
      'no uncaught runtime errors',
      this.#pageErrors.length === 0,
      this.#pageErrors.join(' | ') || 'clean',
    );
  }

  hasConsoleErrors() {
    return this.check(
      'no console errors',
      this.#consoleErrors.length === 0,
      this.#consoleErrors.join(' | ') || 'clean',
    );
  }

  async screenshot(name) {
    await mkdir(artifactDir, { recursive: true });
    const filePath = path.join(artifactDir, `${name}.png`);
    await this.page.screenshot({ path: filePath, fullPage: false });
    console.log(`  [SHOT] ${path.relative(projectRoot, filePath)}`);
    return filePath;
  }

  summary() {
    const failed = this.#results.filter((result) => !result.passed);
    const passedCount = this.#results.length - failed.length;

    console.log(`\n  ${passedCount}/${this.#results.length} checks passed.`);

    if (failed.length > 0) {
      console.log('  Failed checks:');
      for (const failure of failed) console.log(`   - ${failure.name} (${failure.detail})`);
    }

    return { total: this.#results.length, failed: failed.length, results: this.#results };
  }
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Preview server did not become ready at ${url}`);
}

/**
 * Boots `vite preview` on an isolated port, runs `body` against it, and always
 * tears the server (and the headless browser) back down.
 */
export async function withPreviewServer(body, port = 4319) {
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const server = spawn(
    process.execPath,
    [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const baseUrl = `http://127.0.0.1:${port}`;
  let serverOutput = '';
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });

  let browser;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({ headless: true });

    return await body({ browser, baseUrl, serverOutput: () => serverOutput });
  } catch (error) {
    console.error(`Preview server log:\n${serverOutput || '(empty)'}`);
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

/** Opens an isolated page sized for the given viewport. */
export async function openRegisterPage(browser, baseUrl, viewport = { width: 1366, height: 1024 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false,
  });
  const page = await context.newPage();

  // Isolate the IndexedDB profile so runs never inherit a previous state.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const databases = await indexedDB.databases?.();
    for (const database of databases ?? []) {
      if (database.name) indexedDB.deleteDatabase(database.name);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  return { context, page };
}

export function banner(title) {
  console.log(`\n=== ${title} ===`);
}