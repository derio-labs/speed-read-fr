// The built VS Code webview bundle (packages/vscode-extension/dist/webview.js) in Chromium, served
// under the CSP the extension writes, with a stub acquireVsCodeApi. There is no VS Code here: the
// real host is an operator walk (vscode-extension-in-host).
import { expect, test, type Page } from '@playwright/test';
import { installMiddleBox } from './mid';
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

test('the webview Settings panel has a Focus span field and no Reader (overlay / side panel) field (R7)', async ({ page }) => {
  await open(page);
  await page.keyboard.press(',');
  await expect(page.locator('.sr-settings')).toBeVisible();
  await expect(page.locator('.sr-settings [name="focusChars"]')).toBeVisible();
  await expect(page.locator('.sr-settings [name="display"]')).toHaveCount(0);
});

test('flow mode in the webview reads a three-row ribbon across the panel with the middle letter on the target', async ({ page }) => {
  await open(page, { ...FAST, readingMode: 'flow', wpm: 300 });
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-ribbon-row')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('.sr-w[data-current]')).toHaveCount(1);
  await expect(page.locator('.sr-flow-mid')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-status-state')).toHaveText('Paused');
  await page.waitForTimeout(250);
  await installMiddleBox(page);
  const g = await page.evaluate(() => {
    const row = document.querySelector('.sr-ribbon-row[data-position="middle"]')!.getBoundingClientRect();
    const mid = window.__middleBox(document.querySelector('.sr-w[data-current]')!);
    return { dx: Math.abs(mid.x + mid.width / 2 - (row.x + row.width / 2)), stage: document.querySelector('.sr-stage')!.getBoundingClientRect().width, window: innerWidth };
  });
  expect(g.dx).toBeLessThan(1);
  expect(g.stage).toBeGreaterThan(420);
  expect(await page.locator('.sr-flow-axis').count()).toBe(0);
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
  // The bottom-stage reader caps chunks at 3 words.
  await page.locator('.sr-settings [name="chunkWords"]').fill('2');
  await expect.poll(async () => (await posted(page)).filter((m) => m.type === 'settings').at(-1)).toMatchObject({ settings: { chunkWords: 2 } });
  await page.keyboard.press('Escape');
  await page.evaluate((settings) => window.postMessage({ type: 'settings', settings }, '*'), { ...DEFAULT_SETTINGS, chunkWords: 2, wpm: 640 });
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

test('a read that fails shows an inline error in the panel and reports it to the extension (l-errors-r6)', async ({ page }) => {
  await open(page);
  // A malformed read: the render throws.
  await page.evaluate((settings) => window.postMessage({ type: 'read', markdown: 42, startLine: 0, settings, format: 'markdown' }, '*'), FAST);
  const error = page.locator('.sr-render-error');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toContainText('Speed Read could not render this document');
  await expect(page.locator('.sr-reader')).toHaveCount(0);
  await expect.poll(async () => (await posted(page)).filter((m) => m.type === 'error')).toHaveLength(1);
  // The next good read replaces the error.
  await sendRead(page, serverOrigin(), { markdown: await readFixture('sample.md'), settings: FAST });
  await expect(error).toHaveCount(0);
});

test('a diagram that fails to render stays code under a one-line caption (l-errors-r11)', async ({ page }) => {
  await openWebview(page, serverOrigin());
  await sendRead(page, serverOrigin(), { markdown: ['# Broken', '', '```mermaid', 'flowchart LR', 'A -->', '```', ''].join('\n'), settings: FAST });
  const caption = page.locator('#sr-render p.sr-diagram-error');
  await expect(caption).toHaveCount(1);
  await expect(caption).toHaveText(/^Diagram failed to render: \S/);
  expect(await caption.textContent()).not.toContain('\n');
  await expect(page.locator('#sr-render [data-mermaid="failed"] pre code')).toHaveCount(1);
});

test('the extension\'s save-status and notice messages show in the panel; a repeated read id is ignored', async ({ page }) => {
  await openWebview(page, serverOrigin());
  const read = { type: 'read', markdown: await readFixture('sample.md'), startLine: 0, settings: FAST, format: 'markdown', baseUri: `${serverOrigin()}/tests/fixtures/`, id: 7 };
  await page.evaluate((m) => window.postMessage(m, '*'), read);
  await page.locator('.sr-reader').waitFor();
  await page.locator('.sr-reader').evaluate((el) => el.setAttribute('data-first-mount', ''));
  // The same read again (the reload fallback's second delivery) changes nothing; the note message
  // that follows it is a positive event: once it shows, the duplicate has been handled.
  await page.evaluate((m) => window.postMessage(m, '*'), read);
  await page.evaluate(() => window.postMessage({ type: 'save-status', ok: false }, '*'));
  await expect(page.locator('.sr-status [data-note="host"]')).toHaveText('Settings not saved');
  await expect(page.locator('.sr-reader[data-first-mount]')).toHaveCount(1);
  await page.evaluate(() => window.postMessage({ type: 'save-status', ok: true }, '*'));
  await expect(page.locator('.sr-status [data-note="host"]')).toHaveCount(0);
  await page.evaluate(() => window.postMessage({ type: 'notice', text: 'Source document is closed' }, '*'));
  const notice = page.locator('.sr-stale-notice');
  await expect(notice).toBeVisible();
  await expect(notice.locator('span')).toHaveText('Source document is closed');
  await expect(notice.getByRole('button', { name: 'Re-read' })).toBeHidden();
});

test("KaTeX's own SVGs (radicals, arrows) keep their height in exhibits and in normal reading", async ({ page }) => {
  await open(page);
  const svgHeights = (scope: string) =>
    page.locator(`${scope} .katex svg`).evaluateAll((svgs) => svgs.map((svg) => svg.getBoundingClientRect().height));
  // The rendered document: one radical and one arrow in the first display equation.
  expect((await svgHeights('#sr-render')).length).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-exhibits .sr-exhibit[data-kind="math"]')).toHaveCount(2, { timeout: 20_000 });
  await page.keyboard.press('Space');
  const pane = await svgHeights('.sr-exhibits');
  expect(pane.length).toBeGreaterThanOrEqual(2);
  for (const h of pane) expect(h).toBeGreaterThan(2);
  await page.keyboard.press('Tab');
  const reading = await svgHeights('.sr-reading');
  expect(reading.length).toBeGreaterThanOrEqual(2);
  for (const h of reading) expect(h).toBeGreaterThan(2);
});

test.describe('exhibits wider or taller than the pane', () => {
  // A narrow side panel: the exhibit cards span the reader (bottom-stage layout), so the pane is the
  // panel's width, and only this narrow is the first equation wider than it (370 px natural).
  test.use({ viewport: { width: 400, height: 720 } });
  /** Play wide.md to its diagram (math dwells briefly, the diagram long) and pause there. */
  async function openWide(page: Page) {
    await openWebview(page, serverOrigin());
    await sendRead(page, serverOrigin(), { markdown: await readFixture('wide.md'), settings: { ...FAST, imageDwellSeconds: 30 } });
    await page.keyboard.press('Space');
    await expect(page.locator('.sr-exhibits .sr-exhibit[data-kind="diagram"] svg')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Space');
  }
  const fit = (page: Page, index: number) =>
    page.locator('.sr-exhibits .sr-exhibit[data-kind="math"] .katex-display').nth(index).evaluate((el) => {
      const display = el as HTMLElement;
      const body = display.closest('.sr-exhibit-body') as HTMLElement;
      const html = display.querySelector('.katex-html > .katex-base:last-child') as HTMLElement;
      return {
        zoom: Number(getComputedStyle(display).zoom),
        fits: html.getBoundingClientRect().right <= body.getBoundingClientRect().right + 1,
        scrolls: display.scrollWidth > display.clientWidth + 1,
        clip: display.dataset.clip ?? '',
        mask: getComputedStyle(display).maskImage || getComputedStyle(display).webkitMaskImage,
      };
    });

  test('a wide display equation is scaled down to fit the pane', async ({ page }) => {
    await openWide(page);
    const f = await fit(page, 0);
    expect(f.zoom).toBeLessThan(1);
    expect(f.zoom).toBeGreaterThanOrEqual(0.6);
    expect(f.fits).toBe(true);
    expect(f.scrolls).toBe(false);
    expect(f.clip).toBe('');
  });

  test('a wider one stops at 0.6, scrolls, and fades the clipped side', async ({ page }) => {
    await openWide(page);
    let f = await fit(page, 1);
    expect(f.zoom).toBeCloseTo(0.6, 2);
    expect(f.scrolls).toBe(true);
    expect(f.clip).toBe('right');
    expect(f.mask).toContain('gradient');
    const display = page.locator('.sr-exhibits .sr-exhibit[data-kind="math"] .katex-display').nth(1);
    await display.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await expect.poll(async () => (await fit(page, 1)).clip).toBe('left');
  });

  test('a 20-node flowchart is not shrunk below half size: it scrolls and the header says E to expand', async ({ page }) => {
    await openWide(page);
    const exhibit = page.locator('.sr-exhibits .sr-exhibit[data-kind="diagram"]');
    const sizes = await exhibit.locator('svg').first().evaluate((svg) => {
      const box = svg.getBoundingClientRect();
      const view = (svg as SVGSVGElement).viewBox.baseVal;
      // Bottom-stage layout: the exhibit body grows and the exhibit list is what scrolls.
      const list = svg.closest('.sr-exhibit-list') as HTMLElement;
      return { scale: box.height / view.height, scrolls: list.scrollHeight > list.clientHeight + 1 };
    });
    expect(sizes.scale).toBeCloseTo(0.5, 2);
    expect(sizes.scrolls).toBe(true);
    await expect(exhibit.locator('.sr-exhibit-caption')).toContainText('E to expand');
  });

});

// At the default (wide) viewport: the diagram height cap is the wide one.
test('a diagram that fits keeps no expand hint', async ({ page }) => {
  await open(page, { ...FAST, imageDwellSeconds: 30 });
  await page.keyboard.press('Space');
  const exhibit = page.locator('.sr-exhibits .sr-exhibit[data-kind="diagram"]');
  await expect(exhibit.locator('svg')).toBeVisible({ timeout: 20_000 });
  await expect(exhibit.locator('.sr-exhibit-caption')).not.toContainText('E to expand');
});
