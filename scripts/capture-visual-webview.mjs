// Phase 4 visual evidence (called by capture-visual.mjs --phase 4): the built VS Code webview bundle
// in Chromium under the extension's CSP, reading tests/fixtures/sample.md, with VS Code's Dark Modern
// and Light Modern theme variables. Row vscode-webview-renders.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVscodeExtension } from '../packages/vscode-extension/build.mjs';
import { startServer } from './serve.mjs';
import { openWebview, readFixture, sendRead } from './webview-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/;

/** Defaults, except: no chapter stops, math passes quickly, the diagram stays long enough to pause on it. */
const SETTINGS = {
  wpm: 1000,
  chunkWords: 3,
  chunkChars: 20,
  stopLevels: [],
  code: { mode: 'stop', dwellSeconds: 5 },
  table: { mode: 'stop', dwellSeconds: 5 },
  math: { mode: 'dwell', dwellSeconds: 1 },
  imageDwellSeconds: 30,
  display: 'overlay',
  tts: { enabled: false, voiceURI: null },
};

export async function capturePhase4(outDir) {
  await buildVscodeExtension();
  const server = await startServer(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const written = [];
  const offsite = [];
  try {
    for (const shot of [
      { name: 'webview-dark.png', theme: 'dark', viewport: { width: 1100, height: 760 } },
      { name: 'webview-light.png', theme: 'light', viewport: { width: 1100, height: 760 } },
      { name: 'webview-dark-narrow.png', theme: 'dark', viewport: { width: 640, height: 900 } },
      // Exhibits wider or taller than the pane, with the notice shown after the source is edited.
      { name: 'webview-dark-wide-exhibits.png', theme: 'dark', viewport: { width: 1100, height: 760 }, fixture: 'wide.md', stale: true },
    ]) {
      const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2, colorScheme: shot.theme });
      const page = await context.newPage();
      const errors = [];
      page.on('request', (r) => {
        if (!LOCAL.test(r.url())) offsite.push(r.url());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await openWebview(page, origin, { theme: shot.theme });
      await sendRead(page, origin, { markdown: await readFixture(shot.fixture ?? 'sample.md'), settings: SETTINGS });
      await page.keyboard.press('Space');
      await page.locator('.sr-exhibits .sr-exhibit[data-kind="diagram"] svg').waitFor({ timeout: 30_000 });
      await page.keyboard.press('Space');
      await page.locator('.sr-status-state', { hasText: 'Paused' }).waitFor();
      if (shot.stale) await page.evaluate(() => window.postMessage({ type: 'stale' }, '*'));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const violations = await page.evaluate(() => window.__violations);
      if (violations.length || errors.length) throw new Error(`webview errors: ${[...violations, ...errors].join('; ')}`);
      const file = path.join(outDir, shot.name);
      await page.screenshot({ path: file });
      written.push(path.relative(root, file));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (offsite.length) throw new Error(`requests left localhost: ${offsite.join(', ')}`);
  return written;
}
