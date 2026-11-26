// The built Chrome extension (the test variant in dist-test/chrome, which adds the openReader hook and
// an open shadow root; the packaged build in dist/chrome is loaded where a test says so), loaded unpacked into the full Chromium (the headless shell cannot load
// extensions), on our own pages served from localhost. Playwright cannot press the toolbar button,
// a context-menu item or a `commands` shortcut, so the tests call the one handler they all route to
// (`openReader`) from the service worker; hover, keys and pointer input are real input.
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installMiddleBox } from './mid';

// The extension API inside `worker.evaluate` (the service worker's global).
declare const chrome: any; // eslint-disable-line @typescript-eslint/no-explicit-any

const EXTENSION = path.resolve('packages/browser-extension/dist-test/chrome');
const PACKAGED = path.resolve('packages/browser-extension/dist/chrome');
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|chrome-extension:\/\/|data:|blob:|about:)/;
const ARTICLE = '/tests/fixtures/article.html';
const STYLED = '/tests/fixtures/styled.html';
const HOSTILE = '/tests/fixtures/hostile.html';
const NAMED = '/tests/fixtures/named.html';
const REMOTE = '/tests/fixtures/remote.html';
const FIXED = '/tests/fixtures/fixed.html';
const READER_DOCK = '/tests/fixtures/reader-dock.html';
/** Served by the test itself (a Playwright route); allowed only on page load, see the remote test. */
const REMOTE_ORIGIN = 'https://remote.example/';
const REMOTE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#3d405b"/></svg>';

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let worker: Worker;
let userDataDir: string;
const baseURL = 'http://127.0.0.1:4317';
const offsite: string[] = [];
const remoteRequests: string[] = [];

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'speed-read-ext-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  context.on('request', (request) => {
    if (request.url().startsWith(REMOTE_ORIGIN)) remoteRequests.push(request.url());
    else if (!LOCAL.test(request.url())) offsite.push(request.url());
  });
  await context.route(`${REMOTE_ORIGIN}**`, (route) => {
    const svg = route.request().url().endsWith('.svg');
    return route.fulfill({
      status: 200,
      headers: { 'content-type': svg ? 'image/svg+xml' : 'text/css', 'cache-control': 'max-age=3600' },
      body: svg ? REMOTE_SVG : 'figure { border: 2px solid #3d405b; }',
    });
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

/**
 * Most tests here read chunk by chunk, which is no longer the default: each starts from storage that holds the
 * user's own choice of chunk mode (the one-time flow-default migration has already run for it). The tests of the
 * default and of the migration clear it first.
 */
test.beforeEach(async () => {
  await worker.evaluate(() => chrome.storage.local.clear());
  await saveSettings({});
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
const currentChunk = (page: Page) => page.locator('[data-speed-read-host] .sr-chunk');
const outlineRows = (page: Page) => page.locator('[data-speed-read-host] .sr-outline-row');

async function saveSettings(settings: Record<string, unknown>) {
  // Settings a test saves are the user's own choices (chunk mode unless it says otherwise), and the one-time
  // flow-default migration has already run for them.
  await worker.evaluate((s) => chrome.storage.local.set({ settings: { readingMode: 'chunk', ...s }, migrations: ['flow-default'] }), settings);
}

test('with nothing saved the reader opens in three-row flow (R1)', async () => {
  await worker.evaluate(() => chrome.storage.local.clear());
  const page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(host(page).locator('.sr-ribbon-row')).toHaveCount(3);
});

test('saved chunk mode from before the default moves to flow once, and a later choice of chunk is kept (R2)', async () => {
  await worker.evaluate(() => chrome.storage.local.clear());
  await worker.evaluate(() => chrome.storage.local.set({ settings: { readingMode: 'chunk', wpm: 400 } }));
  let page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(host(page).locator('.sr-ribbon-row')).toHaveCount(3);
  expect(await worker.evaluate(() => chrome.storage.local.get(['settings', 'migrations']))).toMatchObject({ settings: { readingMode: 'flow', wpm: 400 }, migrations: ['flow-default', 'word-motion-default'] });
  // The user picks chunk again (the reader saves it like this): the migration does not run again, so it is kept.
  await worker.evaluate(() => chrome.storage.local.set({ settings: { readingMode: 'chunk', wpm: 400 } }));
  page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(currentChunk(page)).toBeVisible();
});

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
  // Overlay: no scroll lock and no change to the page's own styles; Esc closes.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.getAttribute('style'))).toBeNull();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(host(page)).toHaveCount(0);
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
  await expect(currentChunk(page)).toHaveText('This page is');
});

test("'from-here' after a real context-menu event reads from that block", async () => {
  const page = await openPage(ARTICLE);
  const target = page.locator('#content > p', { hasText: 'Tables are treated the same way' });
  await target.scrollIntoViewIfNeeded();
  await target.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await openReader(page, 'from-here');
  await page.keyboard.press('Space');
  await expect(currentChunk(page)).toHaveText('Tables are treated');
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
  await expect(currentChunk(page)).toHaveText('This page is');
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
  // The reference is the same page, same text, with its hostile rules removed: the floating stage card
  // is centred and sized by what it shows (the title on the ready card), so a page with other text
  // would move the toolbar by font metrics alone and the comparison would not measure isolation.
  const plain = await openPage(HOSTILE);
  await plain.evaluate(() => document.querySelectorAll('style').forEach((s) => s.remove()));
  await openReader(plain, 'auto');
  const expected = await measure(plain);
  const title = await plain.locator('[data-speed-read-host] .sr-card-title').textContent();
  expect(title).toBeTruthy();
  const page = await openPage(HOSTILE);
  await openReader(page, 'auto');
  await expect(page.locator('[data-speed-read-host] .sr-card-title')).toHaveText(title!);
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

test('a nested list item read from Alt+click starts at that item with its own counter', async () => {
  const page = await openPage(ARTICLE);
  const item = page.locator('#content li li', { hasText: 'Speed read from here starts' });
  await item.scrollIntoViewIfNeeded();
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 34, box.y + box.height / 2);
  await expect(item).toHaveAttribute('data-speed-read-hover', '');
  await page.mouse.click(box.x + 34, box.y + box.height / 2);
  await page.keyboard.up('Alt');
  await expect(reader(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-speed-read-host] .sr-item-counter')).toHaveText(/item 2\/2/);
  await expect(currentChunk(page)).toHaveText('Speed read from');
});

test('elements named like the extension globals break nothing', async () => {
  const page = await openPage(NAMED);
  // Alt-hover and Alt+click.
  const link = page.locator('#named-link');
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  await expect(page.locator('#second')).toHaveAttribute('data-speed-read-hover', '');
  await page.mouse.click(box.x + 6, box.y + box.height / 2);
  await page.keyboard.up('Alt');
  await expect(reader(page)).toBeFocused();
  expect(page.url()).toBe(baseURL + NAMED);
  await page.keyboard.press('Space');
  await expect(currentChunk(page)).toHaveText('The second paragraph');
  await page.keyboard.press('Escape');
  // From here, after a real context-menu event.
  await page.locator('#second').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await openReader(page, 'from-here');
  await page.keyboard.press('Space');
  await expect(currentChunk(page)).toHaveText('The second paragraph');
  await page.keyboard.press('Escape');
  // The toolbar path.
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await expect(currentChunk(page)).toHaveText('The first paragraph');
});

test('page scripts cannot drive the reader: synthetic keys change nothing in storage', async () => {
  const page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await page.evaluate(() => {
    const host = document.querySelector('[data-speed-read-host]')!;
    const root = host.shadowRoot!.querySelector('.sr-reader')!;
    for (const target of [host, root]) {
      for (let i = 0; i < 5; i++) target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
    }
  });
  await expect(page.locator('[data-speed-read-host] .sr-status-wpm')).toHaveText('300 WPM');
  // Storage is what the test started with (the chunk-mode baseline): nothing was written.
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toEqual({ readingMode: 'chunk' });
});

test('a page script cannot outline a block or open the reader by dispatching Alt-hover events (l-security-r2)', async () => {
  const page = await openPage(ARTICLE);
  // Synthetic Alt move, key and press on the second paragraph, dispatched by the page.
  const prevented = await page.evaluate(() => {
    const p = document.querySelectorAll('#content > p')[1] as HTMLElement;
    const r = p.getBoundingClientRect();
    const at = { clientX: r.left + 10, clientY: r.top + 5, bubbles: true, cancelable: true, composed: true, altKey: true };
    p.dispatchEvent(new MouseEvent('mousemove', at));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true }));
    const outlined = document.querySelectorAll('[data-speed-read-hover]').length;
    const pressed = ['mousedown', 'mouseup', 'click'].map((type) => !p.dispatchEvent(new MouseEvent(type, at)));
    return { outlined, pressed };
  });
  expect(prevented).toEqual({ outlined: 0, pressed: [false, false, false] });
  await expect(page.locator('[data-speed-read-hover]')).toHaveCount(0);
  // A real Alt+press still works, and the reader that opens reads the block the user pressed (the
  // first paragraph), not the one the page picked: a positive event before asserting nothing else opened.
  const first = page.locator('#content > p').first();
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 8);
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 24, box.y + 8);
  await expect(first).toHaveAttribute('data-speed-read-hover', '');
  await page.mouse.click(box.x + 24, box.y + 8);
  await page.keyboard.up('Alt');
  await expect(reader(page)).toBeFocused();
  await expect(host(page)).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(currentChunk(page)).toHaveText('So you can');
});

test('Tab moves through the settings panel control by control with the real keyboard, and wraps (l-tests-r1)', async () => {
  const page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await page.keyboard.press(',');
  await expect(page.locator('[data-speed-read-host] .sr-settings')).toBeVisible();
  /** The panel's Tab stops in order, and the index of the focused one (focus as seen inside the shadow root). */
  const where = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-speed-read-host]')!.shadowRoot!;
      const panel = root.querySelector('.sr-settings')!;
      const stops = [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !(el as HTMLButtonElement).disabled && !el.closest('[hidden]') && el.getClientRects().length > 0,
      );
      return { count: stops.length, at: stops.indexOf(root.activeElement as HTMLElement) };
    });
  const start = await where();
  expect(start.count).toBeGreaterThan(3);
  expect(start.at).toBe(0);
  await page.keyboard.press('Tab');
  expect((await where()).at).toBe(1);
  await page.keyboard.press('Tab');
  expect((await where()).at).toBe(2);
  for (let i = 2; i < start.count - 1; i++) await page.keyboard.press('Tab');
  expect((await where()).at).toBe(start.count - 1);
  await page.keyboard.press('Tab');
  expect((await where()).at).toBe(0);
  await page.keyboard.press('Shift+Tab');
  expect((await where()).at).toBe(start.count - 1);
});

test('the packaged build has a closed shadow root and no test hook', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'speed-read-packaged-'));
  const packaged = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${PACKAGED}`, `--load-extension=${PACKAGED}`],
  });
  try {
    packaged.on('request', (request) => {
      if (!LOCAL.test(request.url())) offsite.push(request.url());
    });
    const sw = packaged.serviceWorkers()[0] ?? (await packaged.waitForEvent('serviceworker'));
    expect(await sw.evaluate(() => typeof (globalThis as Record<string, unknown>).__speedReadTest)).toBe('undefined');
    const page = await packaged.newPage();
    await page.goto(baseURL + ARTICLE);
    const first = page.locator('#content > p').first();
    const box = (await first.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 8);
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + 24, box.y + 8);
    await expect(first).toHaveAttribute('data-speed-read-hover', '');
    await page.mouse.click(box.x + 24, box.y + 8);
    await page.keyboard.up('Alt');
    await expect(page.locator('[data-speed-read-host]')).toHaveCount(1);
    const reach = await page.evaluate(() => {
      const host = document.querySelector('[data-speed-read-host]')!;
      for (let i = 0; i < 5; i++) host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
      return host.shadowRoot;
    });
    expect(reach).toBeNull();
    const storedWpm = () => sw.evaluate(async () => ((await chrome.storage.local.get('settings')).settings as { wpm?: number } | undefined)?.wpm);
    // Positive control (l-tests-r2): a real ArrowUp raises the stored speed by one step, so the five
    // synthetic ones before it were ignored, not merely slow to land.
    await page.keyboard.press('ArrowUp');
    await expect.poll(storedWpm).toBe(325);
    // A real Space plays and the chunks advance: the overlay's page follow scrolls the page to the
    // first paragraph, then, once reading reaches the second, by about the distance between them.
    const gap = await page.evaluate(() => {
      const [a, b] = [...document.querySelectorAll('#content > p')].map((p) => p.getBoundingClientRect().top);
      return b - a;
    });
    expect(gap).toBeGreaterThan(40);
    const settled = async () => {
      let last = -1;
      await expect
        .poll(async () => {
          const now = await page.evaluate(() => scrollY);
          const same = now === last;
          last = now;
          return same;
        })
        .toBe(true);
      return last;
    };
    const before = await settled();
    await page.keyboard.press('Space');
    // The first chunk: the page follows the first paragraph to the top of the free band.
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 20);
    const atFirst = await settled();
    // Later chunks: reading moves on to the second paragraph, and the page follows it.
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 30_000 }).toBeGreaterThan(atFirst + gap * 0.8);
    await page.keyboard.press('Space');
    // The settings survive a reload: the reader opened again starts at 325 WPM, so ArrowUp stores 350.
    await page.reload();
    const again = page.locator('#content > p').first();
    const againBox = (await again.boundingBox())!;
    await page.mouse.move(againBox.x + 20, againBox.y + 8);
    await page.keyboard.down('Alt');
    await page.mouse.move(againBox.x + 24, againBox.y + 8);
    await expect(again).toHaveAttribute('data-speed-read-hover', '');
    await page.mouse.click(againBox.x + 24, againBox.y + 8);
    await page.keyboard.up('Alt');
    await expect(page.locator('[data-speed-read-host]')).toHaveCount(1);
    await expect.poll(storedWpm).toBe(325);
    await page.keyboard.press('ArrowUp');
    await expect.poll(storedWpm).toBe(350);
  } finally {
    await packaged.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a link pressed in the reading view moves the position and does not navigate', async () => {
  const page = await openPage(ARTICLE);
  await openReader(page, 'auto');
  await page.keyboard.press('Tab');
  const clone = page.locator('[data-speed-read-host] > [data-sr-clone]');
  const link = clone.locator('a', { hasText: 'the demo' });
  await link.click();
  // The press has been handled once the mark moved; only then is "did not navigate" meaningful.
  await expect(clone.locator('[data-sr-current]')).toContainText('This page is the demo the tests drive.');
  expect(page.url()).toBe(baseURL + ARTICLE);
  await expect(clone.locator('[id], [name]')).toHaveCount(0);
});

test('the reading-view mark keeps a dark code block its own background', async () => {
  const page = await openPage(STYLED);
  await saveSettings({ wpm: 1000 });
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-speed-read-host] .sr-card-stop')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Tab');
  const marked = page.locator('[data-speed-read-host] > [data-sr-clone] [data-sr-current]');
  await expect(marked).toHaveCount(1);
  const [tag, background, outline] = await marked.evaluate((el) => [el.localName, getComputedStyle(el).backgroundColor, getComputedStyle(el).outlineStyle]);
  const original = await page.evaluate((t) => getComputedStyle(document.querySelector(`main.post ${t}`)!).backgroundColor, tag);
  expect(background).toBe(original);
  expect(outline).toBe('solid');
});

test('when the page removes the reader, the page is restored', async () => {
  const page = await openPage(ARTICLE);
  await saveSettings({ display: 'dock' });
  await openReader(page, 'auto');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).marginRight)).toBe('420px');
  await page.evaluate(() => document.querySelector('[data-speed-read-host]')!.remove());
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).marginRight)).toBe('0px');
  // The reader can be opened again.
  await openReader(page, 'auto');
  await expect(host(page)).toHaveCount(1);
});

for (const display of ['dock', 'overlay']) {
  test(`${display} keeps the chunk stage fixed below chapter and exhibit content`, async () => {
    const page = await openPage(READER_DOCK);
    await saveSettings({ display, chunkWords: 3, chunkChars: 20 });
    await openReader(page, 'auto');
    const locate = (selector: string) => page.locator(`[data-speed-read-host] ${selector}`);
    const stage = locate('.sr-stage');
    const initial = (await stage.boundingBox())!;
    expect(initial.y + initial.height).toBeGreaterThan(780);
    await page.keyboard.press('Space');
    const chapter = locate('.sr-card-chapter');
    await expect(chapter).toBeVisible();
    const c = (await chapter.boundingBox())!;
    expect(c.y + c.height).toBeLessThan(initial.y);
    expect(await stage.boundingBox()).toEqual(initial);
    await page.keyboard.press('ArrowRight');
    const chunk = locate('.sr-chunk');
    const axis = locate('.sr-axis');
    const font = await chunk.evaluate((el) => getComputedStyle(el).fontSize);
    const position = await axis.boundingBox();
    await expect(chunk).toHaveText('Short opening');
    await page.keyboard.press('ArrowRight');
    await expect(chunk).toHaveText('LONG_REPOSITORY_IDENTIFIER');
    await expect(chunk).toHaveCSS('white-space', 'pre');
    // A chunk wider than the stage shrinks (R11), and its code atoms scale with it rather than keeping their own size.
    expect(await chunk.locator('.sr-atom').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe(await chunk.evaluate((el) => getComputedStyle(el).fontSize));
    expect(await chunk.locator('.sr-before, .sr-after').evaluateAll((sides) => sides.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(chunk).toHaveCSS('font-size', font);
      expect(await axis.boundingBox()).toEqual(position);
      expect(await stage.boundingBox()).toEqual(initial);
    }
    await expect(locate('.sr-sentence')).not.toBeVisible();
    for (let i = 0; i < 10 && !(await locate('.sr-card-stop').isVisible()); i++) await page.keyboard.press('ArrowRight');
    await expect(locate('.sr-card-stop')).toBeVisible();
    const exhibit = (await locate('.sr-exhibits').boundingBox())!;
    expect(exhibit.width).toBeGreaterThan(display === 'overlay' ? 600 : 350);
    expect(exhibit.y + exhibit.height).toBeLessThan(initial.y);
    expect(await stage.boundingBox()).toEqual(initial);
  });
}

test('overlay follows a paragraph inside a nested scroll area below a fixed toolbar', async () => {
  const page = await openPage(READER_DOCK);
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(currentChunk(page)).toHaveText('LONG_REPOSITORY_IDENTIFIER');
  const position = () => page.evaluate(() => {
    const p = document.querySelector('#identifier')!.getBoundingClientRect();
    const bar = document.querySelector('header')!.getBoundingClientRect();
    const mark = document.querySelector('[data-speed-read-host]')!.shadowRoot!.querySelector('.sr-window')!;
    const r = mark.getBoundingClientRect();
    return { top: Math.round(p.top), mark: Math.round(r.top), header: bar.bottom, nested: document.querySelector('.preview')!.scrollTop, page: scrollY };
  });
  await expect.poll(async () => (await position()).top).toBe(136);
  expect(await position()).toMatchObject({ mark: 130, header: 128, page: 0 });
  expect((await position()).nested).toBeGreaterThan(0);
});

test("on a hostile page the normal-reading clone is not rotated, faded or narrowed by the page's div rules", async () => {
  const page = await openPage(HOSTILE);
  await openReader(page, 'auto');
  await page.keyboard.press('Tab');
  const clone = page.locator('[data-speed-read-host] > [data-sr-clone]');
  await expect(clone).toHaveCount(1);
  const look = await clone.evaluate((el) => {
    const shell = el.querySelector('div.content')!;
    const pick = (e: Element) => {
      const s = getComputedStyle(e);
      return { transform: s.transform, opacity: s.opacity, width: e.getBoundingClientRect().width, display: s.display };
    };
    return { wrapper: pick(el), shell: pick(shell), tag: el.localName };
  });
  expect(look.tag).toBe('sr-clone');
  for (const part of [look.wrapper, look.shell]) {
    expect(part.transform).toBe('none');
    expect(part.opacity).toBe('1');
    expect(part.display).toBe('block');
    expect(part.width).toBeGreaterThan(400);
  }
});

test('a remote picture shown in the reader is not fetched again', async () => {
  const page = await openPage(REMOTE);
  await expect.poll(() => remoteRequests.length).toBeGreaterThanOrEqual(2);
  await page.waitForLoadState('networkidle');
  const onLoad = remoteRequests.length;
  await saveSettings({ wpm: 1000, imageDwellSeconds: 30 });
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  const exhibit = page.locator('[data-speed-read-host] .sr-exhibits .sr-exhibit');
  await expect(exhibit).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('[data-speed-read-host] > [data-sr-clone] img').first()).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('[data-speed-read-host] .sr-expanded')).toBeVisible();
  await expect.poll(() => page.locator('[data-speed-read-host] > [data-sr-clone] img').count()).toBe(2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-speed-read-host] .sr-reading')).toBeVisible();
  // A positive event first: every copied picture of the reading view has loaded (from the cache).
  const copies = page.locator('[data-speed-read-host] > [data-sr-clone] img');
  await expect.poll(() => copies.count()).toBeGreaterThan(0);
  await expect
    .poll(() => copies.evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  expect(remoteRequests.slice(onLoad)).toEqual([]);
});

test.describe('floating overlay over the faded page (R17, R29)', () => {
  const veilWindow = (page: Page) => page.locator('[data-speed-read-host] .sr-window');
  /** The page block under the clear window: the p/li/h* whose box the window frames. */
  const framed = (page: Page) =>
    page.evaluate(() => {
      const root = document.querySelector('[data-speed-read-host]')!.shadowRoot!;
      const w = root.querySelector('.sr-window')!.getBoundingClientRect();
      const blocks = [...document.querySelectorAll('#content :is(p, li, h1, h2, h3, pre, table, figure)')];
      const hit = blocks.find((b) => {
        const r = b.getBoundingClientRect();
        return r.height > 0 && Math.abs(r.top - (w.top + 6)) <= 2 && Math.abs(r.bottom - (w.bottom - 6)) <= 2;
      });
      return hit ? { text: hit.textContent!.replace(/\s+/g, ' '), top: hit.getBoundingClientRect().top } : null;
    });

  test('the floating cards sit over a veil in the page colour with a clear window over the block being read, followed to 10 % of the viewport', async () => {
    const page = await openPage(ARTICLE);
    await openReader(page, 'auto');
    await expect(reader(page)).toHaveAttribute('data-layout', 'floating');
    await expect(page.locator('[data-speed-read-host] .sr-backdrop')).toHaveCount(0);
    const shadow = await veilWindow(page).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('rgba(255, 255, 255, 0.68)');
    // Into the second section by the wheel over the faded page (the dial), then let the page follow.
    await page.mouse.move(640, 40);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1500);
    const block = await framed(page);
    expect(block, 'the window frames a block of the page').not.toBeNull();
    const words = (await currentChunk(page).textContent())!.trim();
    expect(words, 'the current chunk contains words').not.toBe('');
    expect(block!.text).toContain(words);
    expect(Math.abs(block!.top - 800 * 0.1)).toBeLessThanOrEqual(3);
    // Playing keeps the window on the block being read.
    await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    const playing = await framed(page);
    expect(playing).not.toBeNull();
  });

  test('a wheel over the page turns the dial and never scrolls the page itself', async () => {
    const page = await openPage(ARTICLE);
    await openReader(page, 'auto');
    await page.mouse.move(640, 40);
    // At the start a turn back moves nothing, so nothing may scroll.
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.locator('[data-speed-read-host] .sr-display')).toHaveAttribute('data-kind', 'ready');
    await page.mouse.move(640, 40);
    await page.mouse.wheel(0, 130);
    await expect(page.locator('[data-speed-read-host] .sr-display')).not.toHaveAttribute('data-kind', 'ready');
  });

  test('page fade is a setting of the browser reader: it changes the veil and persists', async () => {
    const page = await openPage(ARTICLE);
    await openReader(page, 'auto');
    await page.locator('[data-speed-read-host] .sr-settings-button').click();
    const control = page.locator('[data-speed-read-host] .sr-settings [name="pageFade"]');
    await expect(control).toHaveValue('32');
    await control.fill('60');
    await expect.poll(() => veilWindow(page).evaluate((el) => getComputedStyle(el).boxShadow)).toContain('0.4)');
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.pageFade)).toBe(0.6);
  });

  test('closing removes the veil and leaves the page at the block', async () => {
    const page = await openPage(ARTICLE);
    await openReader(page, 'auto');
    await page.mouse.move(640, 40);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1200);
    const before = await framed(page);
    expect(before).not.toBeNull();
    const scrolled = await page.evaluate(() => scrollY);
    expect(scrolled).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(host(page)).toHaveCount(0);
    expect(Math.abs((await page.evaluate(() => scrollY)) - scrolled)).toBeLessThanOrEqual(1);
  });
});

test('the dock moves a header fixed across the top and a button fixed at the right edge out from under it, and restores them', async () => {
  const page = await openPage(FIXED);
  const styles = () => page.evaluate(() => ['topbar', 'help'].map((id) => (document.getElementById(id) as HTMLElement).style.cssText));
  const before = await styles();
  await saveSettings({ display: 'dock' });
  await openReader(page, 'auto');
  const bar = (await page.locator('#topbar').boundingBox())!;
  const help = (await page.locator('#help').boundingBox())!;
  expect(bar.x).toBe(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(1280 - 420 + 1);
  expect(help.x + help.width).toBeLessThanOrEqual(1280 - 420);
  expect(help.x + help.width).toBeGreaterThan(1280 - 420 - 40);
  await reader(page).focus();
  await page.keyboard.press('Escape');
  await expect(host(page)).toHaveCount(0);
  expect(await styles()).toEqual(before);
  const after = (await page.locator('#help').boundingBox())!;
  expect(after.x + after.width).toBeGreaterThan(1280 - 30);
});

test.describe('overlay review fixes (p5a)', () => {
  const windowBox = (page: Page) =>
    page.evaluate(() => {
      const r = document.querySelector('[data-speed-read-host]')!.shadowRoot!.querySelector('.sr-window')!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    });

  async function scrub(page: Page, notches: number) {
    await page.mouse.move(640, 40);
    for (let i = 0; i < notches; i++) {
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(420);
    }
    await page.waitForTimeout(1500);
  }

  for (const file of ['/tests/fixtures/smooth.html', '/tests/fixtures/snap.html']) {
    test(`the follow keeps the block in view on ${file.split('/').pop()} (p5a-r2)`, async () => {
      const page = await openPage(file);
      await openReader(page, 'auto');
      await scrub(page, 10);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
      const w = await windowBox(page);
      expect(w.height).toBeGreaterThan(12);
      expect(w.top).toBeGreaterThanOrEqual(-1);
      expect(w.bottom).toBeLessThanOrEqual(801);
      if (file.includes('smooth')) expect(Math.abs(w.top + 6 - 80)).toBeLessThanOrEqual(4);
    });
  }

  test('wheels over the settings panel and the exhibit card never scroll the page (p5a-r3)', async () => {
    const page = await openPage(STYLED);
    await saveSettings({ wpm: 1000 });
    await openReader(page, 'auto');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-speed-read-host] .sr-card-stop')).toBeVisible({ timeout: 15_000 });
    const start = await page.evaluate(() => scrollY);
    const pane = (await page.locator('[data-speed-read-host] .sr-exhibits').boundingBox())!;
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 600);
    await page.locator('[data-speed-read-host] .sr-settings-button').click();
    const panel = (await page.locator('[data-speed-read-host] .sr-settings').boundingBox())!;
    await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBe(start);
  });

  test('ctrl+wheel and a horizontal swipe are left to the browser (p5a-r4)', async () => {
    const page = await openPage(ARTICLE);
    await openReader(page, 'auto');
    await page.evaluate(() => {
      (window as unknown as { __wheels: boolean[] }).__wheels = [];
      window.addEventListener('wheel', (e) => (window as unknown as { __wheels: boolean[] }).__wheels.push(e.defaultPrevented));
    });
    await page.mouse.move(640, 40);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Control');
    await page.mouse.wheel(200, 0);
    await page.mouse.wheel(0, 130);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __wheels: boolean[] }).__wheels)).toEqual([false, false, true]);
  });

  test('in a narrow window at a code stop the block being read is not under the exhibit card (p5a-r8)', async () => {
    const page = await openPage(ARTICLE);
    await page.setViewportSize({ width: 744, height: 1000 });
    await openReader(page, 'auto');
    for (let i = 0; i < 4; i++) await page.keyboard.press('n');
    const display = page.locator('[data-speed-read-host] .sr-display');
    for (let i = 0; i < 30 && (await display.getAttribute('data-kind')) !== 'stop'; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(2000);
    const card = (await page.locator('[data-speed-read-host] .sr-exhibits').boundingBox())!;
    const w = await windowBox(page);
    expect(w.height).toBeGreaterThan(12);
    expect(w.bottom).toBeLessThanOrEqual(card.y);
    await page.setViewportSize({ width: 1280, height: 800 });
  });
});

for (const display of ['dock', 'overlay']) {
  test.describe(`${display} reader, flow and the chunk fit`, () => {
    /** Run `fn` against the reader's shadow root. */
    const inReader = <T>(page: Page, fn: (root: ShadowRoot) => T) =>
      page.evaluate(`(${fn.toString()})(document.querySelector('[data-speed-read-host]').shadowRoot)`) as Promise<T>;

    test('flow shows three rows with the lit letter on the middle row centre', async () => {
      const page = await openPage(READER_DOCK);
      await saveSettings({ display, readingMode: 'flow', flowMotion: 'word', wpm: 300 });
      await openReader(page, 'auto');
      await page.keyboard.press('Space');
      await page.keyboard.press('Space');
      await expect(host(page).locator('.sr-ribbon-row')).toHaveCount(3);
      await page.keyboard.press('Space');
      await expect(host(page).locator('.sr-status-state')).toHaveText('Paused');
      await page.waitForTimeout(250);
      await installMiddleBox(page);
      const lit = await inReader(page, (root) => {
        const row = root.querySelector('.sr-ribbon-row[data-position="middle"]')!.getBoundingClientRect();
        const mid = window.__middleBox(root.querySelector('.sr-w[data-current]')!);
        const rows = ['top', 'middle', 'bottom'].map((p) => {
          const box = root.querySelector(`.sr-ribbon-row[data-position="${p}"]`)!.getBoundingClientRect();
          return !!root.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest(`.sr-ribbon-row[data-position="${p}"]`);
        });
        const hitMid = !!root.elementFromPoint(mid.left + mid.width / 2, mid.top + mid.height / 2)?.closest('.sr-w[data-current]');
        return { off: Math.abs(mid.left + mid.width / 2 - (row.left + row.width / 2)), rows, hitMid };
      });
      expect(lit.off).toBeLessThan(1);
      expect(lit.rows).toEqual([true, true, true]);
      expect(lit.hitMid).toBe(true);
    });

    test('with 80 characters saved the effective limit is what fits, and a chunk at that length is not scaled', async () => {
      const page = await openPage(READER_DOCK);
      await saveSettings({ display, readingMode: 'chunk', chunkWords: 10, chunkChars: 80 });
      await openReader(page, 'auto');
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(currentChunk(page)).toContainText('A longer sentence');
      const shown = await inReader(page, (root) => {
        const probe = root.querySelector<HTMLElement>('.sr-fit-probe')!;
        const display = root.querySelector('.sr-display')!.getBoundingClientRect().width;
        const chunk = root.querySelector<HTMLElement>('.sr-display .sr-chunk')!;
        return {
          fit: Math.floor(display / (probe.getBoundingClientRect().width / (probe.textContent ?? '').length)),
          text: chunk.textContent!.trim(),
          scale: chunk.style.getPropertyValue('--sr-scale'),
          font: getComputedStyle(chunk).fontSize,
          probeFont: getComputedStyle(probe).fontSize,
          wrapped: root.querySelector<HTMLElement>('.sr-display')!.dataset.wrap,
        };
      });
      expect(shown.fit).toBeLessThan(80);
      expect(shown.fit).toBeGreaterThanOrEqual(30);
      expect(shown.text.length).toBeLessThanOrEqual(shown.fit);
      expect(shown.text.length).toBeGreaterThan(shown.fit - 8);
      // At the fit length a chunk only gives up the stage's 12px edge margins: near full size, never wrapped.
      expect(Number(shown.scale || 1)).toBeGreaterThanOrEqual(0.9);
      expect(Number.parseFloat(shown.font)).toBeGreaterThanOrEqual(Number.parseFloat(shown.probeFont) * 0.9);
      expect(shown.wrapped).toBeUndefined();
      await page.keyboard.press(',');
      const max = Number(await host(page).locator('.sr-settings [name="chunkChars"]').getAttribute('max'));
      expect(max).toBe(shown.fit);
    });
  });
}
