// The built Chrome extension, loaded unpacked into the full Chromium (the headless shell cannot load
// extensions), on our own pages served from localhost. Playwright cannot press the toolbar button,
// a context-menu item or a `commands` shortcut, so the tests call the one handler they all route to
// (`openReader`) from the service worker; hover, keys and pointer input are real input.
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The extension API inside `worker.evaluate` (the service worker's global).
declare const chrome: any; // eslint-disable-line @typescript-eslint/no-explicit-any

const EXTENSION = path.resolve('packages/browser-extension/dist/chrome');
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|chrome-extension:\/\/|data:|blob:|about:)/;
const ARTICLE = '/tests/fixtures/article.html';
const STYLED = '/tests/fixtures/styled.html';
const HOSTILE = '/tests/fixtures/hostile.html';

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let worker: Worker;
let userDataDir: string;
const baseURL = 'http://127.0.0.1:4317';
const offsite: string[] = [];

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'speed-read-ext-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  context.on('request', (request) => {
    if (!LOCAL.test(request.url())) offsite.push(request.url());
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await worker.evaluate(() => chrome.storage.local.clear());
});

test.afterEach(() => {
  expect(offsite, 'requests that left localhost').toEqual([]);
});

async function openPage(url: string): Promise<Page> {
  for (const p of context.pages()) await p.close();
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto(baseURL + url);
  // The always-on content script is in place once its hover outline can be produced; wait for idle.
  await page.waitForLoadState('load');
  return page;
}

async function tabId(page: Page): Promise<number> {
  const url = page.url();
  return worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)!.id!, url);
}

async function openReader(page: Page, mode: 'auto' | 'selection' | 'from-here' | 'from-block') {
  const id = await tabId(page);
  await worker.evaluate(([tab, m]) => (globalThis as unknown as { __speedReadTest: { openReader(t: number, m: string): Promise<void> } }).__speedReadTest.openReader(tab as number, m as string), [id, mode] as const);
  await expect(reader(page)).toBeFocused();
}

const host = (page: Page) => page.locator('[data-speed-read-host]');
const reader = (page: Page) => page.locator('[data-speed-read-host] .sr-reader');
const sentence = (page: Page) => page.locator('[data-speed-read-host] .sr-sentence');
const outlineRows = (page: Page) => page.locator('[data-speed-read-host] .sr-outline-row');

async function saveSettings(settings: Record<string, unknown>) {
  await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
}

test('the reader opens on the main content only', async () => {
  const page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await expect(host(page)).toHaveCount(1);
  await expect(outlineRows(page).first()).toHaveText(/Reading structured answers quickly/);
  await expect(outlineRows(page)).not.toContainText(['Site navigation']);
  const titles = await outlineRows(page).allTextContents();
  expect(titles.join(' ')).not.toMatch(/Site navigation|Related reading/);
  // Normal reading shows the page's own content: the article, without the nav, sidebar or footer.
  await page.keyboard.press('Tab');
  const clone = page.locator('[data-speed-read-host] > [data-sr-clone]');
  await expect(clone).toHaveCount(1);
  await expect(clone).toContainText('Reading structured answers quickly');
  await expect(clone).not.toContainText('Site navigation');
  await expect(clone).not.toContainText('Related reading');
  await expect(clone).not.toContainText('Footer text');
  // Overlay: the page does not scroll while the reader is open; Esc restores it.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(host(page)).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('visible');
});

test('with a selection it reads the selection', async () => {
  const page = await openPage(ARTICLE);
  await page.evaluate(() => {
    const p = document.querySelectorAll('#content > p')[1];
    getSelection()!.selectAllChildren(p);
  });
  await openReader(page, 'auto');
  await expect(outlineRows(page)).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(sentence(page)).toContainText('This page is the demo the tests drive.');
});

test("'from-here' after a real context-menu event reads from that block", async () => {
  const page = await openPage(ARTICLE);
  const target = page.locator('#content > p', { hasText: 'Tables are treated the same way' });
  await target.scrollIntoViewIfNeeded();
  await target.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await openReader(page, 'from-here');
  await page.keyboard.press('Space');
  await expect(sentence(page)).toContainText('Tables are treated the same way');
  // From that block to the end: the later section is in the outline, the earlier ones are not.
  await expect(outlineRows(page)).toHaveText([/Pictures and diagrams/]);
});

test('Alt+hover outlines a block and Alt+click on a link in it reads from there without navigating', async () => {
  const page = await openPage(ARTICLE);
  const link = page.locator('#demo-link');
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  const paragraph = page.locator('#content > p').nth(1);
  await expect(paragraph).toHaveAttribute('data-speed-read-hover', '');
  expect(await paragraph.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  // Moving changes the outlined block.
  const first = page.locator('#content > p').first();
  const firstBox = (await first.boundingBox())!;
  await page.mouse.move(firstBox.x + 20, firstBox.y + 8);
  await expect(first).toHaveAttribute('data-speed-read-hover', '');
  await expect(paragraph).not.toHaveAttribute('data-speed-read-hover', '');
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  await expect(paragraph).toHaveAttribute('data-speed-read-hover', '');
  await page.mouse.click(box.x + 6, box.y + box.height / 2);
  await page.keyboard.up('Alt');
  await expect(reader(page)).toBeFocused();
  expect(page.url()).toBe(baseURL + ARTICLE);
  await expect(page.locator('[data-speed-read-hover]')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(sentence(page)).toContainText('This page is the demo the tests drive.');
});

test('without Alt nothing is outlined and a pointer press on a link navigates', async () => {
  const page = await openPage(ARTICLE);
  const link = page.locator('#demo-link');
  await link.hover();
  await expect(page.locator('[data-speed-read-hover]')).toHaveCount(0);
  await link.click();
  await page.waitForURL(baseURL + STYLED);
  await expect(host(page)).toHaveCount(0);
});

test("on a styled page the code exhibit keeps the page's colours and the reader keeps its own", async () => {
  const page = await openPage(STYLED);
  await saveSettings({ wpm: 1000 });
  await openReader(page, 'auto');
  const readerColour = await reader(page).evaluate((el) => getComputedStyle(el).color);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-speed-read-host] .sr-card-stop')).toBeVisible({ timeout: 15_000 });
  const clone = page.locator('[data-speed-read-host] > [data-sr-clone]');
  await expect(clone).toHaveCount(1);
  await expect(clone.locator('pre .kw').first()).toBeVisible();
  const look = (root: string) =>
    page.evaluate((r) => {
      const scope = document.querySelector(r)!;
      const pick = (sel: string, props: string[]) => {
        const s = getComputedStyle(scope.querySelector(sel)!);
        return props.map((p) => s.getPropertyValue(p));
      };
      return {
        pre: pick('pre', ['color', 'background-color', 'font-family', 'padding-left']),
        kw: pick('.kw', ['color', 'font-weight']),
        fn: pick('.fn', ['color']),
        num: pick('.num', ['color']),
        com: pick('.com', ['color', 'font-style']),
      };
    }, root);
  expect(await look('[data-speed-read-host] > [data-sr-clone]')).toEqual(await look('main.post'));
  // The clone sits on the page's dark background, in the page's text colour.
  const wrapper = await clone.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  expect(wrapper).toEqual(['rgb(15, 23, 42)', 'rgb(226, 232, 240)']);
  // The reader's own text is not the page's.
  expect(await reader(page).evaluate((el) => getComputedStyle(el).color)).toBe(readerColour);
  expect(readerColour).not.toBe('rgb(226, 232, 240)');
});

test("on a hostile page the reader's layout and fonts are unchanged", async () => {
  const measure = async (page: Page) =>
    page.evaluate(() => {
      const hostEl = document.querySelector('[data-speed-read-host]') as HTMLElement;
      const root = hostEl.shadowRoot!;
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round);
      };
      const style = (el: Element) => {
        const s = getComputedStyle(el);
        return ['font-family', 'font-size', 'letter-spacing', 'text-transform', 'color', 'line-height'].map((p) => s.getPropertyValue(p));
      };
      const hs = getComputedStyle(hostEl);
      return {
        host: [rect(hostEl), hs.opacity, hs.transform, hs.position, hs.display],
        frame: rect(root.querySelector('.sr-frame')!),
        reader: [rect(root.querySelector('.sr-reader')!), style(root.querySelector('.sr-reader')!)],
        toolbar: rect(root.querySelector('.sr-toolbar')!),
        status: style(root.querySelector('.sr-status')!),
        card: style(root.querySelector('.sr-display')!),
      };
    });
  const plain = await openPage(ARTICLE);
  await openReader(plain, 'auto');
  const expected = await measure(plain);
  const page = await openPage(HOSTILE);
  await openReader(page, 'auto');
  expect(await measure(page)).toEqual(expected);
});

test('docked mode leaves the page usable beside a 420 px panel with a matching margin', async () => {
  const page = await openPage(ARTICLE);
  await saveSettings({ display: 'dock' });
  await openReader(page, 'auto');
  const rect = await host(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.width, r.height];
  });
  expect(rect).toEqual([1280 - 420, 420, 800]);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).marginRight)).toBe('420px');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('visible');
  await page.locator('#bump').click();
  await expect(page.locator('#bump')).toHaveAttribute('data-count', '1');
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  // Close: the margin goes (scrolling to the last-read block is covered by the unit tests).
  await reader(page).focus();
  await page.keyboard.press('Escape');
  await expect(host(page)).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).marginRight)).toBe('0px');
});

test('settings survive a page reload', async () => {
  const page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  const wpm = page.locator('[data-speed-read-host] .sr-status-wpm');
  await expect(wpm).toHaveText('300 WPM');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  const changed = (await wpm.textContent())!;
  expect(changed).not.toBe('300 WPM');
  await expect.poll(() => worker.evaluate(async () => ((await chrome.storage.local.get('settings')).settings as { wpm?: number } | undefined)?.wpm)).toBe(Number.parseInt(changed, 10));
  await page.reload();
  await openReader(page, 'auto');
  await expect(wpm).toHaveText(changed);
});
