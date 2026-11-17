// Visual evidence for the reader UI rows (reader-three-zone-ui, reader-keys, reader-settings).
// Builds the demo, serves the repo on localhost, and writes one PNG per declared state or
// interaction to the git-ignored .visual/phase-2/ at deviceScaleFactor 2.
//   node scripts/capture-visual.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemo } from './build-demo.mjs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.argv[2] ?? '.visual/phase-2');
const STORE_KEY = 'speed-read-demo:settings';
const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 700, height: 960 };

await buildDemo();
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/tests/demo/index.html`;
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const written = [];

async function open({ viewport = WIDE, colorScheme = 'light', saved } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  if (saved) await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORE_KEY, JSON.stringify(saved)]);
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto(base);
  await page.locator('.sr-reader:focus').waitFor();
  return page;
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: file });
  written.push(path.relative(root, file));
}

const press = async (page, ...keys) => {
  for (const key of keys) await page.keyboard.press(key);
};

/** From the start, go to the code section and play to its stop. */
async function toCodeStop(page) {
  await press(page, 'Space', 'n', 'n', 'n', 'n');
  await page.locator('.sr-card-chapter', { hasText: 'Code, tables and math' }).waitFor();
  await press(page, 'Space');
  await page.locator('.sr-card-stop').waitFor({ timeout: 20_000 });
}

try {
  // Chapter card, then a prose chunk while playing (slow, so the shot catches it mid-play).
  let page = await open({ saved: { wpm: 100 } });
  await press(page, 'Space');
  await page.locator('.sr-card-chapter').waitFor();
  await shot(page, 'chapter-card.png');
  await press(page, 'Space');
  await page.locator('.sr-display[data-kind="chunk"]').waitFor();
  await page.waitForTimeout(700);
  await shot(page, 'playing-prose-chunk.png');
  // Normal reading at the current block (Tab), from that position.
  await press(page, 'Tab');
  await page.locator('[data-sr-current]').waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'normal-reading.png');
  await page.context().close();

  // A streamed list item with its counter.
  page = await open({ saved: { wpm: 200 } });
  await press(page, 'Space', 'n', 'n', 'Space');
  await page.locator('.sr-item-counter').waitFor({ timeout: 20_000 });
  await page.locator('.sr-item-counter', { hasText: 'item 2/4' }).waitFor({ timeout: 20_000 });
  await press(page, 'Space');
  await shot(page, 'list-item-counter.png');
  await page.context().close();

  // The code stop with its exhibit revealed, then expanded with E.
  page = await open({ saved: { wpm: 1000 } });
  await toCodeStop(page);
  await shot(page, 'code-stop-exhibit.png');
  await press(page, 'e');
  await page.locator('.sr-expanded').waitFor();
  await shot(page, 'expand-exhibit.png');
  await press(page, 'Escape');
  // Clicking an outline heading jumps there.
  await page.locator('.sr-outline-row', { hasText: 'Pictures and diagrams' }).click();
  await page.locator('.sr-card-chapter', { hasText: 'Pictures and diagrams' }).waitFor();
  await shot(page, 'outline-click-jumps.png');
  await page.context().close();

  // Narrow layout: the exhibit pane below the stage.
  page = await open({ viewport: NARROW, saved: { wpm: 1000 } });
  await toCodeStop(page);
  await shot(page, 'narrow-layout.png');
  await page.context().close();

  // Dark theme at the code stop.
  page = await open({ colorScheme: 'dark', saved: { wpm: 1000 } });
  await toCodeStop(page);
  await shot(page, 'dark-theme.png');
  await page.context().close();

  // Settings panel with defaults, then words per chunk 1 and 8 on a paused chunk.
  page = await open();
  await press(page, 'Space', 'Space', 'Space');
  await page.locator('.sr-status-state', { hasText: 'Paused' }).waitFor();
  await press(page, ',');
  await page.locator('.sr-settings').waitFor();
  await shot(page, 'settings-defaults.png');
  await page.locator('.sr-settings [name="chunkWords"]').fill('1');
  await page.locator('.sr-chunk', { hasText: /^So$/ }).waitFor();
  await shot(page, 'chunk-words-1.png');
  await page.locator('.sr-settings [name="chunkWords"]').fill('8');
  await page.locator('.sr-chunk', { hasText: 'So you can read it' }).waitFor();
  await shot(page, 'chunk-words-8.png');
  await page.context().close();
} finally {
  await browser.close();
  server.close();
}

console.log(written.join('\n'));
