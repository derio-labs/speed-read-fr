// The built Chrome extension (the test variant in dist-test/chrome, which adds the openReader hook and
// an open shadow root; the packaged build in dist/chrome is loaded where a test says so), loaded unpacked into the full Chromium (the headless shell cannot load
// extensions), on our own pages served from localhost. Playwright cannot press the toolbar button,
// a context-menu item or a `commands` shortcut, so the tests call the one handler they all route to
// (`openReader`) from the service worker; hover, keys and pointer input are real input.
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
  await expect(sentence(page)).toContainText('Speed read from here starts');
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
  await expect(sentence(page)).toContainText('The second paragraph');
  await page.keyboard.press('Escape');
  // From here, after a real context-menu event.
  await page.locator('#second').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await openReader(page, 'from-here');
  await page.keyboard.press('Space');
  await expect(sentence(page)).toContainText('The second paragraph');
  await page.keyboard.press('Escape');
  // The toolbar path.
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  await expect(sentence(page)).toContainText('The first paragraph');
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
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toBeUndefined();
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
    await page.waitForTimeout(200);
    expect(await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toBeUndefined();
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
  await page.waitForTimeout(300);
  expect(page.url()).toBe(baseURL + ARTICLE);
  await expect(clone.locator('[data-sr-current]')).toContainText('This page is the demo the tests drive.');
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

test('in the dock at 800 px the whole chapter card is in view', async () => {
  const page = await openPage(ARTICLE);
  await saveSettings({ display: 'dock' });
  await openReader(page, 'auto');
  await page.keyboard.press('Space');
  const card = page.locator('[data-speed-read-host] .sr-card-chapter');
  await expect(card).toBeVisible();
  const [c, s] = await Promise.all([card.boundingBox(), page.locator('[data-speed-read-host] .sr-stage').boundingBox()]);
  expect(c!.y).toBeGreaterThanOrEqual(s!.y);
  expect(c!.y + c!.height).toBeLessThanOrEqual(s!.y + s!.height);
  const hint = page.locator('[data-speed-read-host] .sr-card-chapter .sr-card-hint');
  const h = (await hint.boundingBox())!;
  expect(h.y + h.height).toBeLessThanOrEqual(s!.y + s!.height);
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
  await page.waitForTimeout(500);
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
    await page.mouse.move(60, 400);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1500);
    const block = await framed(page);
    expect(block, 'the window frames a block of the page').not.toBeNull();
    const words = (await sentence(page).textContent())!.trim().split(/\s+/).slice(0, 2).join(' ');
    if (words) expect(block!.text).toContain(words);
    expect(Math.abs(block!.top - 800 * 0.1)).toBeLessThanOrEqual(3);
    // Playing keeps the window on the block being read.
    await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    const playing = await framed(page);
    expect(playing).not.toBeNull();
  });

  test('a wheel over the page turns the dial and never scrolls the page itself; over the exhibit pane it does not turn the dial', async () => {
    const page = await openPage(ARTICLE);
    await openReader(page, 'auto');
    await page.mouse.move(60, 400);
    // At the start a turn back moves nothing, so nothing may scroll.
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.locator('[data-speed-read-host] .sr-display')).toHaveAttribute('data-kind', 'ready');
    const pane = (await page.locator('[data-speed-read-host] .sr-exhibits').boundingBox())!;
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await page.mouse.wheel(0, 130);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-speed-read-host] .sr-display')).toHaveAttribute('data-kind', 'ready');
    await page.mouse.move(60, 400);
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
    await page.mouse.move(60, 400);
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
