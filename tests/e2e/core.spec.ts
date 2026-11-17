import { expect, test, type Page } from '@playwright/test';

const DEMO = '/tests/demo/index.html';
const STORE_KEY = 'speed-read-demo:settings';
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/;

let offsite: string[] = [];

test.beforeEach(async ({ page }) => {
  offsite = [];
  page.on('request', (request) => {
    if (!LOCAL.test(request.url())) offsite.push(request.url());
  });
});

test.afterEach(() => {
  expect(offsite, 'requests that left localhost').toEqual([]);
});

/** Open the demo, optionally with saved settings, and wait for the focused reader. */
async function openDemo(page: Page, saved?: Record<string, unknown>) {
  if (saved) {
    await page.addInitScript(
      ([key, value]) => {
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem(key, value);
          sessionStorage.setItem('seeded', '1');
        }
      },
      [STORE_KEY, JSON.stringify(saved)] as const,
    );
  }
  await page.goto(DEMO);
  await expect(page.locator('.sr-reader')).toBeFocused();
}

const display = (page: Page) => page.locator('.sr-display');
const state = (page: Page) => page.locator('.sr-status-state');
const chunk = (page: Page) => page.locator('.sr-chunk');

test('Space starts, the chapter card stops, Space continues and chunks advance', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('.sr-card-ready')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('Reading structured answers quickly');
  await expect(state(page)).toHaveText('Waiting');
  await page.keyboard.press('Space');
  await expect(display(page)).toHaveAttribute('data-kind', 'chunk');
  await expect(state(page)).toHaveText('Playing');
  const first = await chunk(page).textContent();
  await expect.poll(() => chunk(page).textContent()).not.toBe(first);
  await expect(page.locator('.sr-chunk .sr-pivot')).toHaveCount(1);
});

test('the code stop shows its prompt and only then reveals the code in the pane', async ({ page }) => {
  await openDemo(page, { wpm: 1000 });
  await page.keyboard.press('Space');
  // Sections: prose, lists, short lists (H3), code.
  for (let i = 0; i < 4; i++) await page.keyboard.press('n');
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('Code, tables and math');
  await expect(page.locator('.sr-exhibits .sr-exhibit')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(display(page)).toHaveAttribute('data-kind', 'chunk');
  await expect(page.locator('.sr-exhibits .sr-exhibit')).toHaveCount(0);
  await expect(page.locator('.sr-card-stop')).toContainText('Code, 24 lines', { timeout: 15_000 });
  await expect(page.locator('.sr-card-stop')).toContainText('Space to continue, E to expand');
  const exhibit = page.locator('.sr-exhibits .sr-exhibit');
  await expect(exhibit).toHaveCount(1);
  await expect(exhibit).toHaveAttribute('aria-current', 'true');
  await expect(exhibit.locator('pre code .tok-kw').first()).toBeVisible();

  // E expands over the stage; E closes; Esc closes too and leaves the reader open.
  await page.keyboard.press('e');
  await expect(page.locator('.sr-expanded pre')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('.sr-expanded')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(page.locator('.sr-expanded')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sr-expanded')).toHaveCount(0);
  await expect(page.locator('.sr-reader')).toBeVisible();
});

test('arrows move by sentence and change the speed', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(state(page)).toHaveText('Paused');
  await expect(page.locator('.sr-sentence')).toContainText('So you can read it all');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sr-sentence')).toContainText('Long answers from a model');
  await expect(chunk(page)).toHaveText('Long answers from');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sr-sentence')).toContainText('So you can read it all');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.sr-status-wpm')).toHaveText('325 WPM');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.sr-status-wpm')).toHaveText('275 WPM');
});

test('N and P move by section', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('n');
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('How prose is paced');
  await page.keyboard.press('n');
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('Lists are read item by item');
  await page.keyboard.press('p');
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('How prose is paced');
});

test('clicking an outline row jumps to that section', async ({ page }) => {
  await openDemo(page);
  await page.locator('.sr-outline-row', { hasText: 'Pictures and diagrams' }).click();
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('Pictures and diagrams');
  await expect(page.locator('.sr-outline-row[aria-current="true"] .sr-row-title')).toHaveText('Pictures and diagrams');
  await expect(page.locator('.sr-reader')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(display(page)).toHaveAttribute('data-kind', 'chunk');
});

test('Tab shows normal reading at the current block and returns paused', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press('n');
  await page.keyboard.press('Space');
  await expect(display(page)).toHaveAttribute('data-kind', 'chunk');
  await page.keyboard.press('Tab');
  const reading = page.locator('.sr-reading');
  await expect(reading).toBeVisible();
  await expect(page.locator('.sr-stage')).toBeHidden();
  await expect(page.locator('.sr-exhibits')).toBeHidden();
  const current = page.locator('[data-sr-current]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('Prose is streamed in short chunks.');
  await expect(current).toBeInViewport();

  // A click on a block moves the position there.
  await reading.locator('p', { hasText: 'After every stop the speed ramps' }).click();
  await expect(page.locator('[data-sr-current]')).toContainText('After every stop the speed ramps');

  await page.keyboard.press('Tab');
  await expect(reading).toBeHidden();
  await expect(state(page)).toHaveText('Paused');
  await expect(page.locator('.sr-sentence')).toContainText('After every stop the speed ramps');
});

test('the exhibit pane sits right of the stage when wide and below it at 700 px', async ({ page }) => {
  await openDemo(page);
  const stage = page.locator('.sr-stage');
  const pane = page.locator('.sr-exhibits');
  let s = (await stage.boundingBox())!;
  let p = (await pane.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(s.x + s.width - 1);

  await page.setViewportSize({ width: 700, height: 900 });
  await expect.poll(async () => (await pane.boundingBox())!.y).toBeGreaterThan(s.y);
  s = (await stage.boundingBox())!;
  p = (await pane.boundingBox())!;
  expect(p.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
  await expect(page.locator('.sr-outline')).toBeHidden();
  await expect(page.locator('.sr-outline-toggle')).toBeVisible();
  await page.locator('.sr-outline-toggle').click();
  await expect(page.locator('.sr-outline')).toBeVisible();
});

test('words per chunk 1 and 8 change the chunk, and a reload keeps the saved setting', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(state(page)).toHaveText('Paused');
  await expect(chunk(page)).toHaveText('So you can');
  await page.keyboard.press(',');
  const panel = page.locator('.sr-settings');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[name="chunkWords"]')).toHaveValue('3');
  await panel.locator('[name="chunkWords"]').fill('1');
  await expect(chunk(page)).toHaveText('So');
  await panel.locator('[name="chunkWords"]').fill('8');
  // Eight words would pass the 20-character limit, so the chunk ends at five.
  await expect(chunk(page)).toHaveText('So you can read it');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('.sr-reader')).toBeFocused();

  await page.reload();
  await expect(page.locator('.sr-reader')).toBeFocused();
  await page.keyboard.press(',');
  await expect(page.locator('.sr-settings [name="chunkWords"]')).toHaveValue('8');
});

/** The element's box lies inside the stage's box (1 px tolerance). */
async function insideStage(page: Page, selector: string) {
  const stage = (await page.locator('.sr-stage').boundingBox())!;
  const box = (await page.locator(selector).boundingBox())!;
  return box.x >= stage.x - 1 && box.x + box.width <= stage.x + stage.width + 1;
}

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('a very long word and its sentence stay inside the stage', async ({ page }) => {
    await openDemo(page);
    await page.keyboard.press('n');
    await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('How prose is paced');
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(chunk(page)).toContainText('Pneumonoultramicroscopic');
    expect(await insideStage(page, '.sr-chunk')).toBe(true);
    expect(await insideStage(page, '.sr-sentence')).toBe(true);
  });

  test('the outline bar keeps its menu icon whole and ellipsizes a long heading', async ({ page }) => {
    await page.setViewportSize({ width: 280, height: 800 });
    await openDemo(page);
    const toggle = (await page.locator('.sr-outline-toggle').boundingBox())!;
    const icon = (await page.locator('.sr-outline-toggle .sr-icon').boundingBox())!;
    const text = page.locator('.sr-outline-toggle-text');
    expect(Math.round(icon.width)).toBe(20);
    const box = (await text.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(toggle.x + toggle.width);
    expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test('a nested list item stays inside the stage', async ({ page }) => {
    await openDemo(page);
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('Lists are read item by item');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.sr-item-counter')).toHaveText('item 1/2');
    await expect(page.locator('.sr-display')).toHaveAttribute('style', /--sr-depth: 1/);
    expect(await insideStage(page, '.sr-chunk')).toBe(true);
  });
});

test('a paused chunk stays inside the stage after resizing from wide to 360 px', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press('n');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await expect(chunk(page)).toContainText('Pneumonoultramicroscopic');
  expect(await insideStage(page, '.sr-chunk')).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => insideStage(page, '.sr-chunk')).toBe(true);
  expect(await insideStage(page, '.sr-sentence')).toBe(true);
});

/** WCAG contrast ratio of an element's text colour on its background colour. */
async function contrast(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const style = getComputedStyle(el);
    const [a, b] = [lum(rgb(style.color)), lum(rgb(style.backgroundColor))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the Done button text reaches 4.5:1 in the ${colorScheme} scheme, and reader buttons keep their own colours`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openDemo(page);
    await page.keyboard.press(',');
    await expect(page.locator('.sr-settings-done')).toBeVisible();
    expect(await contrast(page, '.sr-settings-done')).toBeGreaterThanOrEqual(4.5);
    const colours = await page.evaluate(() => ({
      icon: getComputedStyle(document.querySelector('.sr-icon-button')!).color,
      row: getComputedStyle(document.querySelector('.sr-outline-row:not([aria-current])')!).color,
      text: getComputedStyle(document.querySelector('.sr-reader')!).color,
    }));
    expect(colours.icon).not.toBe(colours.text);
    expect(colours.row).not.toBe(colours.text);
  });
}
