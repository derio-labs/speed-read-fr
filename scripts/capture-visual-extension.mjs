// Phase 3 visual evidence (called by capture-visual.mjs --phase 3): the built Chrome extension
// loaded unpacked into the full Chromium, on our own fixture pages served from localhost.
import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtension, extensionDir } from '../packages/browser-extension/build.mjs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|chrome-extension:\/\/|data:|blob:|about:)/;

export async function capturePhase3(outDir) {
  // The test variant: it carries the openReader hook the capture drives the reader with.
  await buildExtension({ test: true });
  const EXTENSION = extensionDir(true);
  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}/tests/fixtures`;
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'speed-read-visual-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  const offsite = [];
  context.on('request', (r) => {
    if (!LOCAL.test(r.url())) offsite.push(r.url());
  });
  const written = [];
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

    async function open(file, settings = {}) {
      for (const p of context.pages()) await p.close();
      await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
      const page = await context.newPage();
      page.on('pageerror', (e) => {
        throw e;
      });
      await page.goto(`${base}/${file}`);
      return page;
    }

    async function openReader(page, mode = 'auto') {
      const url = page.url();
      await worker.evaluate(
        async ([u, m]) => {
          const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
          await globalThis.__speedReadTest.openReader(tab.id, m);
        },
        [url, mode],
      );
      await page.locator('[data-speed-read-host] .sr-reader').waitFor();
    }

    async function shot(page, name) {
      const file = path.join(outDir, name);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: file });
      written.push(path.relative(root, file));
    }

    // Alt held over a paragraph's link: that block is outlined, nothing else changes.
    let page = await open('article.html');
    const link = page.locator('#demo-link');
    const box = await link.boundingBox();
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.locator('[data-speed-read-hover]').waitFor();
    await shot(page, 'alt-hover-block-outlined.png');
    await page.keyboard.up('Alt');

    // Overlay over the dark styled page, stopped at the code with the page-styled exhibit.
    page = await open('styled.html', { wpm: 1000 });
    await openReader(page);
    await page.keyboard.press('Space');
    await page.locator('[data-speed-read-host] .sr-card-stop').waitFor({ timeout: 20_000 });
    await page.locator('[data-speed-read-host] > [data-sr-clone] .kw').first().waitFor();
    await shot(page, 'overlay-styled-code-exhibit.png');

    // Docked beside the article: the page keeps its width minus the panel and stays usable.
    page = await open('article.html', { display: 'dock', wpm: 200 });
    await openReader(page);
    await page.keyboard.press('Space');
    await page.locator('[data-speed-read-host] .sr-card-chapter').waitFor();
    await shot(page, 'docked-side-panel.png');
  } finally {
    await context.close();
    server.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
  if (offsite.length) throw new Error(`requests that left localhost: ${offsite.join(', ')}`);
  return written;
}
