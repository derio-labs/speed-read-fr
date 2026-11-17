// The built VS Code webview bundle (packages/vscode-extension/dist/webview.js) in Chromium, served
// under the CSP the extension writes, with a stub acquireVsCodeApi. There is no VS Code here: the
// real host is an operator walk (vscode-extension-in-host).
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../packages/core/src/settings';
import { openWebview, readFixture, sendRead } from '../../scripts/webview-harness.mjs';

const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/;

/** Fast playback; math and diagrams dwell briefly; code and tables skipped; no chapter stops. */
const FAST = {
  ...DEFAULT_SETTINGS,
  wpm: 1000,
  stopLevels: [],
  math: { mode: 'dwell', dwellSeconds: 1 },
  code: { mode: 'skip', dwellSeconds: 5 },
  table: { mode: 'skip', dwellSeconds: 5 },
  imageDwellSeconds: 1,
};

// Playing the whole sample at the top speed takes about 20 s.
test.describe.configure({ timeout: 60_000 });

let offsite: string[];
let errors: string[];

test.beforeEach(async ({ page }) => {
  offsite = [];
  errors = [];
  page.on('request', (request) => {
    if (!LOCAL.test(request.url())) offsite.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
});

test.afterEach(async ({ page }) => {
  expect(offsite, 'requests that left localhost').toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations), 'CSP violations').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});

const posted = (page: Page) => page.evaluate(() => (window as unknown as { __posted: { type: string; line?: number }[] }).__posted);

const serverOrigin = () => new URL(test.info().project.use.baseURL!).origin;

async function open(page: Page, settings: object = FAST) {
  await openWebview(page, serverOrigin());
  await sendRead(page, serverOrigin(), { markdown: await readFixture('sample.md'), settings });
  await expect(page.locator('.sr-reader')).toBeFocused();
}

test('the webview renders the Markdown into the reader, offline and within its CSP', async ({ page }) => {
  await open(page);
  // The rendered document (out of view) has typeset math, a laid-out diagram and the local picture.
  const rendered = page.locator('#sr-render');
  await expect(page.locator('#sr-render-frame')).toHaveCSS('visibility', 'hidden');
  await expect(rendered).toHaveCSS('visibility', 'hidden');
  await expect(rendered.locator('p .katex')).toHaveCount(2);
  await expect(rendered.locator('.katex-display')).toHaveCount(2);
  await expect(rendered.locator('.mermaid[data-mermaid="rendered"] svg')).toHaveCount(1);
  await expect(rendered.locator('img[src$="images/local.svg"]')).toHaveCount(1);
  await expect(rendered.locator('img.sr-remote-image')).toHaveAttribute('alt', 'A remote chart');
  await expect(page.locator('.sr-outline-row')).toHaveText([/Reading a structured answer/, /Lists/, /Math and a diagram/, /Code and a table/, /Pictures/]);
});

test('math and the diagram appear as exhibits with real rendered size', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Space');
  const pane = page.locator('.sr-exhibits');
  const math = pane.locator('.sr-exhibit[data-kind="math"]');
  await expect(math).toHaveCount(2, { timeout: 20_000 });
  for (const display of await math.locator('.katex-display .katex-html').all()) {
    const box = await display.boundingBox();
    expect(box!.width).toBeGreaterThan(40);
    expect(box!.height).toBeGreaterThan(15);
  }
  // KaTeX's MathML copy is visually hidden by the bundled stylesheet: no doubled text.
  const mathml = await math.first().locator('.katex-mathml').boundingBox();
  expect(mathml === null || mathml.width <= 1).toBe(true);
  const diagram = pane.locator('.sr-exhibit[data-kind="diagram"] svg').first();
  await expect(diagram).toBeVisible({ timeout: 20_000 });
  const box = await diagram.boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(20);
  await expect(pane.locator('.sr-exhibit[data-kind="diagram"]')).toContainText('KaTeX');
  // The KaTeX fonts load from the extension's media folder.
  expect(await page.evaluate(() => document.fonts.check('16px KaTeX_Main'))).toBe(true);
});

test('playing posts position messages on the source lines of the blocks read', async ({ page }) => {
  await open(page);
  const lines = await page.locator('#sr-render [data-line]').evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-line'))));
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-card-end')).toBeVisible({ timeout: 45_000 });
  const positions = (await posted(page)).filter((m) => m.type === 'position').map((m) => m.line!);
  // Zero-based lines of sample.md: headings, paragraphs, each streamed list item (the short ordered
  // list is shown whole, at its first item), both display math blocks, the diagram, the pictures.
  // The code block (43) and the table (49) are skipped by these settings.
  expect(positions).toEqual([0, 2, 5, 7, 9, 10, 11, 12, 14, 17, 19, 21, 25, 29, 39, 41, 54, 56, 58, 60]);
  expect(positions.every((line) => lines.includes(line))).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(new Set(positions).size).toBe(positions.length);
});

test('a sub-range keeps its original line numbers', async ({ page }) => {
  await openWebview(page, serverOrigin());
  await sendRead(page, serverOrigin(), { markdown: await readFixture('sample.md'), settings: FAST, startLine: 17, endLine: 40 });
  await expect(page.locator('.sr-outline-row')).toHaveText([/Math and a diagram/]);
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-card-end')).toBeVisible({ timeout: 45_000 });
  const positions = (await posted(page)).filter((m) => m.type === 'position').map((m) => m.line);
  expect(positions[0]).toBe(17);
  expect(positions.at(-1)).toBe(39);
});

test('settings changes are posted to the extension, and pushed settings apply', async ({ page }) => {
  await open(page, DEFAULT_SETTINGS);
  await page.keyboard.press(',');
  await page.locator('.sr-settings [name="chunkWords"]').fill('5');
  await expect.poll(async () => (await posted(page)).filter((m) => m.type === 'settings').at(-1)).toMatchObject({ settings: { chunkWords: 5 } });
  await page.keyboard.press('Escape');
  await page.evaluate((settings) => window.postMessage({ type: 'settings', settings }, '*'), { ...DEFAULT_SETTINGS, chunkWords: 5, wpm: 640 });
  await expect(page.locator('.sr-status')).toContainText('640');
});

test('closing the reader tells the extension', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await posted(page)).some((m) => m.type === 'close')).toBe(true);
  await expect(page.locator('.sr-reader')).toHaveCount(0);
});

test('an edited source shows a "Document changed" notice whose Re-read asks the extension to re-read', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await posted(page)).some((m) => m.type === 'position')).toBe(true);
  await page.keyboard.press('Space');
  const notice = page.locator('.sr-stale-notice');
  await expect(notice).toBeHidden();
  await page.evaluate(() => window.postMessage({ type: 'stale' }, '*'));
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toContainText('Document changed');
  // The notice does not take focus from the reader.
  await expect(page.locator('.sr-reader')).toBeFocused();
  const lastLine = (await posted(page)).filter((m) => m.type === 'position').at(-1)!.line;
  await notice.getByRole('button', { name: 'Re-read' }).click();
  await expect.poll(async () => (await posted(page)).filter((m) => m.type === 'reread')).toEqual([{ type: 'reread', line: lastLine }]);
  await sendRead(page, serverOrigin(), { markdown: await readFixture('sample.md'), settings: FAST, startLine: 17 });
  await expect(notice).toBeHidden();
});
