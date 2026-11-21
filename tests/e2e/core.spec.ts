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

test('the demo mounts the bottom-stage reader with ?bottomStage', async ({ page }) => {
  await page.goto(`${DEMO}?bottomStage`);
  await expect(page.locator('.sr-reader')).toBeFocused();
  await expect(page.locator('.sr-reader')).toHaveAttribute('data-bottom-stage', /.*/);
  await expect(page.locator('.sr-reader')).toHaveAttribute('data-layout', 'floating');
  await page.goto(`${DEMO}?bottomStage&layout=panel`);
  await expect(page.locator('.sr-reader')).toHaveAttribute('data-layout', 'panel');
});

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
  await openDemo(page, { wpm: 600 });
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

test('the exhibit pane sits right of the stage when wide; narrow, the outline is a bar and drawer', async ({ page }) => {
  await openDemo(page);
  const stage = page.locator('.sr-stage');
  const pane = page.locator('.sr-exhibits');
  const s = (await stage.boundingBox())!;
  const p = (await pane.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(s.x + s.width - 1);

  await page.setViewportSize({ width: 700, height: 900 });
  // Narrow and nothing revealed yet: the exhibit card is hidden (R28).
  await expect(pane).toBeHidden();
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

const SHOTS = '.visual/snake-shots';

/** A flow-mode reader on the bottom-stage demo (the layout every host ships), in a 1440 px viewport. */
async function openFlow(page: Page, layout: 'floating' | 'panel', saved: Record<string, unknown> = {}) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORE_KEY, JSON.stringify({ readingMode: 'flow', wpm: 120, ...saved })] as const);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${DEMO}?bottomStage&layout=${layout}`);
  await expect(page.locator('.sr-reader')).toBeFocused();
}

/** Start reading past the first chapter card. */
async function startFlow(page: Page) {
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-card-chapter')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-ribbon')).toBeVisible();
}

/** What the ribbon shows now: per-row visible word index ranges, the lit word, and the target geometry. */
async function ribbonSample(page: Page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.sr-ribbon-row')];
    const visible = rows.map((row) => {
      const box = row.getBoundingClientRect();
      const words = [...row.querySelectorAll<HTMLElement>('.sr-w')];
      const seen = words.flatMap((w, i) => {
        const r = w.getBoundingClientRect();
        return r.right > box.left + 0.5 && r.left < box.right - 0.5 ? [i] : [];
      });
      return { lo: seen[0] ?? -1, hi: seen[seen.length - 1] ?? -1, box: { x: box.x, y: box.y, width: box.width, height: box.height }, count: seen.length };
    });
    const mid = document.querySelector<HTMLElement>('.sr-flow-mid');
    const word = mid?.closest<HTMLElement>('.sr-w') ?? null;
    const middleWords = [...document.querySelectorAll('.sr-ribbon-row[data-position="middle"] .sr-w')];
    const m = mid?.getBoundingClientRect();
    const w = word?.getBoundingClientRect();
    const target = document.querySelector('.sr-flow-target')!.getBoundingClientRect();
    const braces = [...document.querySelectorAll('.sr-flow-brace')].map((b) => b.getBoundingClientRect());
    const midRow = visible[1].box;
    return {
      visible,
      index: word ? middleWords.indexOf(word) : -1,
      text: word?.textContent ?? '',
      midCentre: m ? m.x + m.width / 2 : NaN,
      rowCentre: midRow.x + midRow.width / 2,
      word: w ? { x: w.x, width: w.width, top: w.y, bottom: w.y + w.height } : null,
      target: { x: target.x, width: target.width, top: target.y, bottom: target.y + target.height },
      braces: braces.map((b) => ({ top: b.y, bottom: b.y + b.height, x: b.x, width: b.width })),
      mid: { weight: mid ? getComputedStyle(mid).fontWeight : '', parentWeight: word ? getComputedStyle(word).fontWeight : '', color: mid ? getComputedStyle(mid).color : '' },
      stage: document.querySelector('.sr-stage')!.getBoundingClientRect().width,
    };
  });
}

/** Wait for the ribbon's glide to finish before measuring it. */
const settleGlide = (page: Page) => page.waitForTimeout(220);

async function pauseFlow(page: Page) {
  await page.keyboard.press('Space');
  await expect(state(page)).toHaveText('Paused');
  await settleGlide(page);
}

for (const layout of ['floating', 'panel'] as const) {
  test.describe(`snake flow, bottom stage, ${layout} layout`, () => {
    test('three rows of consecutive text, the middle letter on the target, braces as wide as the word + 8px', async ({ page }) => {
      // Far enough into the text that the top row is full; then back, a word at a time.
      await openFlow(page, layout, { wpm: 600 });
      await startFlow(page);
      await expect.poll(async () => (await ribbonSample(page)).index, { timeout: 20_000 }).toBeGreaterThan(58);
      await pauseFlow(page);
      // Park on word 54 whatever the poll caught: the top and bottom rows are both inside the run's ~80 words there.
      const parked = (await ribbonSample(page)).index;
      await page.evaluate((delta) => (window as unknown as { __reader: { player: { scrub(n: number): number } } }).__reader.player.scrub(delta), 54 - parked);
      await settleGlide(page);
      await page.screenshot({ path: `${SHOTS}/${layout}-flow-paused.png` });
      for (let i = 0; i < 6; i++) {
        const sample = await ribbonSample(page);
        const [top, middle, bottom] = sample.visible;
        // The run holds about 80 words, so the bottom row is short near its end: every row still shows text.
        for (const row of sample.visible) expect(row.count, 'words visible per row').toBeGreaterThanOrEqual(3);
        expect(middle.count).toBeGreaterThan(10);
        // Consecutive text: a word cut by a row edge shows in both rows, otherwise the next row starts at the next word.
        expect(middle.lo - top.hi, 'top row runs into the middle row').toBeGreaterThanOrEqual(0);
        expect(middle.lo - top.hi).toBeLessThanOrEqual(1);
        expect(bottom.lo - middle.hi, 'middle row runs into the bottom row').toBeGreaterThanOrEqual(0);
        expect(bottom.lo - middle.hi).toBeLessThanOrEqual(1);
        expect(sample.index).toBeGreaterThanOrEqual(middle.lo);
        expect(sample.index).toBeLessThanOrEqual(middle.hi);
        // The rows stack: top above middle above bottom.
        expect(top.box.y).toBeLessThan(middle.box.y);
        expect(middle.box.y).toBeLessThan(bottom.box.y);
        // The middle letter's centre is the target's fixed point, the middle of the row.
        expect(Math.abs(sample.midCentre - sample.rowCentre), `middle letter of "${sample.text}"`).toBeLessThan(1);
        // The braces span the word, plus 4px each side, and stay outside its line box.
        expect(Math.abs(sample.target.width - (sample.word!.width + 8))).toBeLessThan(1);
        expect(Math.abs(sample.target.x - (sample.word!.x - 4))).toBeLessThan(1);
        expect(sample.braces).toHaveLength(2);
        expect(sample.braces[0].bottom).toBeLessThanOrEqual(sample.word!.top + 1);
        expect(sample.braces[1].top).toBeGreaterThanOrEqual(sample.word!.bottom - 1);
        // Red and not bold.
        expect(sample.mid.weight).toBe(sample.mid.parentWeight);
        expect(sample.mid.color).not.toBe(await page.locator('.sr-ribbon-row[data-position="middle"]').evaluate((e) => getComputedStyle(e).color));
        await page.locator('.sr-stage').hover();
        await page.mouse.wheel(0, -120);
        await settleGlide(page);
        await page.waitForTimeout(400);
      }
      // A narrower window: the ribbon follows the stage's width and keeps three rows.
      await page.setViewportSize({ width: 900, height: 900 });
      await settleGlide(page);
      const narrow = await ribbonSample(page);
      expect(narrow.visible.every((row) => row.count > 0)).toBe(true);
      expect(Math.abs(narrow.midCentre - narrow.rowCentre)).toBeLessThan(1);
      await page.screenshot({ path: `${SHOTS}/${layout}-flow-narrow.png` });
    });

    test('the flow window is wider than 1000px in a 1440px viewport, and chunk mode keeps its width', async ({ page }) => {
      await openFlow(page, layout);
      await startFlow(page);
      const flow = await ribbonSample(page);
      expect(flow.stage).toBeGreaterThan(1000);
      expect(flow.stage).toBeLessThanOrEqual(layout === 'floating' ? 1200 : 1440);
      await page.screenshot({ path: `${SHOTS}/${layout}-flow-wide.png` });
      await page.keyboard.press(',');
      await page.locator('.sr-settings [name="readingMode"]').selectOption('chunk');
      await page.keyboard.press('Escape');
      await expect(page.locator('.sr-ribbon')).toHaveCount(0);
      expect(await page.locator('.sr-stage').evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(421);
    });

    if (layout === 'panel')
      test('with the contents sidebar open the flow stage starts at its right edge and the target is centred in what is left', async ({ page }) => {
        await openFlow(page, layout);
        await startFlow(page);
        await expect.poll(async () => (await ribbonSample(page)).index, { timeout: 20_000 }).toBeGreaterThan(5);
        await pauseFlow(page);
        const g = await page.evaluate(() => {
          const outline = document.querySelector('.sr-outline')!.getBoundingClientRect();
          const row = document.querySelector('.sr-ribbon-row[data-position="middle"]')!.getBoundingClientRect();
          const mid = document.querySelector('.sr-flow-mid')!.getBoundingClientRect();
          return { outlineRight: outline.right, outlineWidth: outline.width, rowLeft: row.left, rowRight: row.right, midCentre: mid.x + mid.width / 2, win: innerWidth };
        });
        expect(g.outlineWidth).toBeGreaterThan(100);
        expect(g.rowLeft).toBeGreaterThanOrEqual(g.outlineRight - 1);
        // The row begins just past the sidebar (the stage's own padding) and the letter is at the row's centre.
        expect(g.rowLeft - g.outlineRight).toBeLessThan(16);
        expect(Math.abs(g.midCentre - (g.rowLeft + g.rowRight) / 2)).toBeLessThan(1);
        expect(Math.abs(g.midCentre - (g.outlineRight + g.win) / 2)).toBeLessThan(10);
        await page.screenshot({ path: `${SHOTS}/panel-flow-outline-open.png` });
      });

    test('the wheel moves the ribbon back and forward word by word, and playback resumes from the reached word', async ({ page }) => {
      await openFlow(page, layout);
      await startFlow(page);
      await expect.poll(async () => (await ribbonSample(page)).index, { timeout: 20_000 }).toBeGreaterThan(5);
      await pauseFlow(page);
      const at = (await ribbonSample(page)).index;
      await page.locator('.sr-stage').hover();
      for (const [delta, expected] of [[-120, at - 1], [-120, at - 2], [120, at - 1], [120, at]] as const) {
        await page.mouse.wheel(0, delta);
        await expect.poll(async () => (await ribbonSample(page)).index).toBe(expected);
        await page.waitForTimeout(500);
      }
      await settleGlide(page);
      const sample = await ribbonSample(page);
      expect(Math.abs(sample.midCentre - sample.rowCentre)).toBeLessThan(1);
      await page.keyboard.press('Space');
      await expect(state(page)).toHaveText('Playing');
      await expect.poll(async () => (await ribbonSample(page)).index, { timeout: 10_000 }).toBeGreaterThan(at);
    });

    test('a chapter card and a code stop interrupt the ribbon and it resumes after them', async ({ page }) => {
      test.setTimeout(90_000);
      await openFlow(page, layout, { wpm: 600 });
      await startFlow(page);
      await page.keyboard.press('n');
      await expect(page.locator('.sr-card-chapter')).toBeVisible();
      await expect(page.locator('.sr-ribbon')).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/${layout}-chapter-card.png` });
      await page.keyboard.press('Space');
      await expect(page.locator('.sr-ribbon')).toBeVisible();
      await expect(page.locator('.sr-card-chapter')).toHaveCount(0);
      await page.keyboard.press('n');
      await page.keyboard.press('n');
      await expect(page.locator('.sr-card-chapter')).toContainText('Code, tables and math');
      await page.keyboard.press('Space');
      await expect(page.locator('.sr-ribbon')).toBeVisible();
      await expect(page.locator('.sr-card-stop')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.sr-ribbon')).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/${layout}-code-stop.png` });
      await page.keyboard.press('Space');
      await expect(page.locator('.sr-ribbon')).toBeVisible();
      await expect(page.locator('.sr-card-stop')).toHaveCount(0);
    });
  });
}

test('the three-row flow setting persists and flow keeps its settings through a reload', async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press(',');
  await expect(page.locator('.sr-settings [name="readingMode"]')).toHaveValue('chunk');
  await page.locator('.sr-settings [name="readingMode"]').selectOption('flow');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(display(page)).toHaveAttribute('data-kind', 'flow');
  await expect(page.locator('.sr-ribbon-row')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('.sr-reader')).toBeFocused();
  await page.keyboard.press(',');
  await expect(page.locator('.sr-settings [name="readingMode"]')).toHaveValue('flow');
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
    // Truncated with an ellipsis, by more than a rounding pixel (the heading is far wider than the bar).
    const clipped = await text.evaluate((el) => ({ over: el.scrollWidth - el.clientWidth, ellipsis: getComputedStyle(el).textOverflow }));
    expect(clipped.ellipsis).toBe('ellipsis');
    expect(clipped.over).toBeGreaterThan(1);
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

test.describe('position dial (R27)', () => {
  const index = (page: Page) => page.evaluate(() => (window as unknown as { __reader: { player: { index: number } } }).__reader.player.index);

  /** Move the mouse over the stage card's chunk display (the wheel acts there). */
  async function overStage(page: Page) {
    const box = (await page.locator('.sr-display').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }

  test('real wheel input moves the position forwards and backwards', async ({ page }) => {
    await openDemo(page);
    await overStage(page);
    await page.mouse.wheel(0, 130);
    await expect.poll(() => index(page)).toBe(1);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 130);
    await expect.poll(() => index(page)).toBe(2);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, -130);
    await expect.poll(() => index(page)).toBe(1);
    await expect(page.locator('.sr-dial')).toHaveAttribute('role', 'slider');
  });

  test('a fast burst travels further per notch than slow notches', async ({ page }) => {
    await openDemo(page);
    await overStage(page);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(800);
    const slow = await index(page);
    await page.reload();
    await expect(page.locator('.sr-reader')).toBeFocused();
    await overStage(page);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
    await page.waitForTimeout(1000);
    const fast = await index(page);
    expect(slow).toBeGreaterThanOrEqual(3);
    expect(fast).toBeGreaterThan(slow * 2);
  });

  test('dragging the strip left moves forward, and playback resumes after scrubbing', async ({ page }) => {
    await openDemo(page, { wpm: 200 });
    await page.keyboard.press('Space'); // chapter card
    await page.keyboard.press('Space'); // playing
    await expect(state(page)).toHaveText('Playing');
    const strip = (await page.locator('.sr-dial').boundingBox())!;
    const y = strip.y + strip.height / 2;
    const before = await index(page);
    await page.mouse.move(strip.x + strip.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(strip.x + strip.width * 0.7 - 80, y, { steps: 4 });
    await expect(state(page)).toHaveText('Paused');
    await page.mouse.up();
    expect(await index(page)).toBeGreaterThan(before);
    await expect(state(page)).toHaveText('Playing', { timeout: 3000 });
  });
});

/** Move to the code stop of the fixture: N to its section, then sentence moves until the stop shows. */
async function toCodeStop(page: Page) {
  for (let i = 0; i < 4; i++) await page.keyboard.press('n');
  await expect(page.locator('.sr-card-chapter .sr-card-title')).toHaveText('Code, tables and math');
  for (let i = 0; i < 30 && (await display(page).getAttribute('data-kind')) !== 'stop'; i++) await page.keyboard.press('ArrowRight');
  await expect(display(page)).toHaveAttribute('data-kind', 'stop');
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

for (const layout of ['panel', 'floating'] as const) {
  test(`narrow (${layout}): the exhibit card sits above the stage, as tall as it needs, and the stage moves down and back`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto(`${DEMO}?layout=${layout}`);
    await expect(page.locator('.sr-reader')).toBeFocused();
    const moving = layout === 'floating' ? '.sr-main' : '.sr-stage';
    const pane = page.locator('.sr-exhibits');
    await expect(pane).toBeHidden();
    const resting = (await box(page, moving)).y;
    const reader = await box(page, '.sr-reader');

    await toCodeStop(page);
    await expect(pane).toBeVisible();
    await expect.poll(async () => (await box(page, moving)).y, { message: 'the stage moves down' }).toBeGreaterThan(resting + 20);
    // Let the 400 ms ease finish, then measure.
    await page.waitForTimeout(600);
    const card = await box(page, '.sr-exhibits');
    const stage = await box(page, moving);
    expect(card.y).toBeGreaterThanOrEqual(reader.y);
    expect(card.y + card.height).toBeLessThanOrEqual(stage.y);
    expect(stage.y).toBeGreaterThanOrEqual(card.y + card.height + 12 - 1);
    expect(stage.y + stage.height).toBeLessThanOrEqual(reader.y + reader.height + 1);
    // As tall as its content, or as tall as the room allows.
    const fit = await page.locator('.sr-exhibit-list').evaluate((list) => {
      const max = parseFloat(getComputedStyle(list.closest('.sr-reader')!).getPropertyValue('--sr-exhibit-max'));
      const cardHeight = (list.closest('.sr-exhibits') as HTMLElement).getBoundingClientRect().height;
      // Room left below the last exhibit inside the list: none when the card is only as tall as its content.
      const last = list.lastElementChild!;
      const slack = list.getBoundingClientRect().bottom - (last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom) + parseFloat(getComputedStyle(list).paddingBottom));
      return { max, cardHeight, slack, overflows: list.scrollHeight > list.clientHeight + 1, atMax: Math.abs(cardHeight - max) <= 1 };
    });
    expect(fit.max, 'the room the card may take').toBeGreaterThan(0);
    expect(fit.cardHeight).toBeLessThanOrEqual(fit.max + 1);
    // Each branch on its own: content taller than the room scrolls in a card at the maximum; content
    // that fits gets a card exactly as tall as it.
    if (fit.overflows) expect(fit.atMax, 'an overflowing card is at the maximum').toBe(true);
    else expect(Math.abs(fit.slack), 'a card whose content fits is as tall as that content').toBeLessThanOrEqual(2);

    // A section with nothing revealed yet: the card goes and the stage glides back.
    await page.keyboard.press('n');
    await expect(pane).toBeHidden();
    // At rest the panel stage is under the toolbar; the floating stage card is centred at 56 % (its height varies by card).
    const offRest = async () => {
      const b = await box(page, moving);
      return layout === 'panel' ? Math.abs(b.y - resting) : Math.abs(b.y + b.height / 2 - (reader.y + reader.height * 0.56));
    };
    await expect.poll(offRest).toBeLessThanOrEqual(1);
  });
}

for (const layout of ['panel', 'floating'] as const) {
  for (const reduced of [false, true]) {
    test(`narrow (${layout}${reduced ? ', reduced motion' : ''}): the stage ${reduced ? 'jumps' : 'glides'} back when the card empties and down when it fills (R28)`, async ({ page }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 700, height: 900 });
      await page.goto(`${DEMO}?layout=${layout}`);
      await expect(page.locator('.sr-reader')).toBeFocused();
      const moving = layout === 'floating' ? '.sr-main' : '.sr-stage';
      await toCodeStop(page);
      await expect(page.locator('.sr-exhibits')).toBeVisible();
      // Let the push settle, then move a section on (the card empties) and back (it fills again),
      // sampling the stage's top on every animation frame from the move on.
      await page.waitForTimeout(700);
      const sample = (delta: 1 | -1) =>
        page.evaluate(
          async ([sel, d]) => {
            const top = () => document.querySelector(sel as string)!.getBoundingClientRect().top;
            const from = top();
            (window as unknown as { __reader: { player: { section(n: number): void } } }).__reader.player.section(d as number);
            const tops: number[] = [];
            const start = performance.now();
            while (performance.now() - start < 700) {
              await new Promise((r) => requestAnimationFrame(r));
              tops.push(top());
            }
            return { from, to: tops[tops.length - 1], tops };
          },
          [moving, delta] as const,
        );
      const back = await sample(1);
      expect(back.to, 'the stage moved back up').toBeLessThan(back.from - 20);
      const down = await sample(-1);
      expect(down.to, 'the stage moved down again').toBeGreaterThan(down.from + 20);
      for (const [name, run] of [['return', back], ['push', down]] as const) {
        expect(run.tops.length, `frames sampled during the ${name}`).toBeGreaterThan(5);
        const lo = Math.min(run.from, run.to) + 0.5;
        const hi = Math.max(run.from, run.to) - 0.5;
        const between = run.tops.filter((t) => t > lo && t < hi);
        if (reduced) expect(between, `no intermediate position during the ${name} with reduced motion`).toEqual([]);
        else expect(between.length, `an intermediate position during the ${name}`).toBeGreaterThan(0);
      }
    });
  }
}

test.describe('floating layout', () => {
  test('a transparent root with three separate cards; the outline collapses to the bar under 1180 px', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${DEMO}?layout=floating`);
    await expect(page.locator('.sr-reader')).toBeFocused();
    const bg = await page.locator('.sr-reader').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)');
    const outline = await box(page, '.sr-outline');
    const main = await box(page, '.sr-main');
    const pane = await box(page, '.sr-exhibits');
    expect(outline.x + outline.width).toBeLessThan(main.x);
    expect(main.x + main.width).toBeLessThan(pane.x);
    expect(main.width).toBeLessThanOrEqual(600);
    // The band above the stage is free: the stage sits below the middle.
    expect(main.y + main.height / 2).toBeGreaterThan(450);
    for (const sel of ['.sr-outline', '.sr-main', '.sr-exhibits']) {
      const style = await page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(style).not.toBe('rgba(0, 0, 0, 0)');
    }
    await expect(page.locator('.sr-main .sr-outline-toggle')).toBeHidden();

    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(page.locator('.sr-outline')).toBeHidden();
    await expect(page.locator('.sr-main .sr-outline-toggle')).toBeVisible();
    const m = await box(page, '.sr-main');
    const p = await box(page, '.sr-exhibits');
    expect(m.x + m.width).toBeLessThanOrEqual(p.x);
  });

  test('an expanded exhibit is wider than the stage and within 92 % of the reader', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${DEMO}?layout=floating`);
    await expect(page.locator('.sr-reader')).toBeFocused();
    await toCodeStop(page);
    await page.keyboard.press('e');
    const expanded = await box(page, '.sr-expanded');
    const main = await box(page, '.sr-main');
    const reader = await box(page, '.sr-reader');
    expect(expanded.width).toBeGreaterThan(main.width);
    expect(expanded.width).toBeLessThanOrEqual(reader.width * 0.92 + 1);
    expect(expanded.height).toBeLessThanOrEqual(reader.height * 0.88 + 1);
  });
});

test.describe('text-to-speech with an injected speechSynthesis (R22)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const voices = [
        { name: 'Local Voice', lang: 'en-US', voiceURI: 'local-1', localService: true, default: true },
        { name: 'Cloud Voice', lang: 'en-GB', voiceURI: 'cloud-1', localService: false, default: false },
      ];
      const spoken: { text: string; voice: { name: string } | null; onboundary?: (e: { charIndex: number; name: string }) => void; onend?: () => void }[] = [];
      (window as unknown as Record<string, unknown>).__spoken = spoken;
      class FakeUtterance {
        text: string;
        rate = 1;
        lang = '';
        voice = null;
        onboundary = null;
        onend = null;
        onerror = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      const synth = {
        getVoices: () => voices,
        speak: (u: (typeof spoken)[number]) => spoken.push(u),
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    });
  });

  test('voices are labelled local or network, a network voice is warned about, and chunks follow the boundaries', async ({ page }) => {
    await openDemo(page, { chunkWords: 1 });
    await page.locator('.sr-settings-button').click();
    const select = page.locator('.sr-settings [name="tts-voice"]');
    await expect(select.locator('option')).toContainText(['Automatic: Local Voice', 'Local Voice (en-US) · local', 'Cloud Voice (en-GB) · network']);
    const notes = page.locator('.sr-settings .sr-tts-note');
    await expect(notes).toContainText(['Offline speech uses voices installed on this device']);
    await select.selectOption('cloud-1');
    await expect(notes).toContainText(['This voice needs a network connection', 'Offline speech uses voices installed on this device']);
    await select.selectOption('local-1');
    await expect(notes).not.toContainText(['This voice needs a network connection']);
    await page.locator('.sr-settings [name="tts"]').check();
    await page.locator('.sr-settings-done').click();
    await page.keyboard.press('Space'); // chapter card
    await page.keyboard.press('Space'); // speaks the first sentence
    const spoken = () => page.evaluate(() => (window as unknown as { __spoken: { text: string }[] }).__spoken.map((u) => u.text));
    await expect.poll(spoken).toHaveLength(1);
    const first = (await spoken())[0];
    const words = first.split(' ');
    await expect(chunk(page)).toHaveText(words[0]);
    // A boundary at the third word shows the third word.
    const at = words[0].length + 1 + words[1].length + 1;
    await page.evaluate((charIndex) => {
      const list = (window as unknown as { __spoken: { onboundary(e: { charIndex: number; name: string }): void }[] }).__spoken;
      list[list.length - 1].onboundary({ charIndex, name: 'word' });
    }, at);
    await expect(chunk(page)).toHaveText(words[2]);
    await page.evaluate(() => {
      const list = (window as unknown as { __spoken: { onend(): void }[] }).__spoken;
      list[list.length - 1].onend();
    });
    await expect.poll(spoken).toHaveLength(2);
  });
});

test.describe('narrow floating review fixes (p5a)', () => {
  test('at 744x600 the stage hugs its content and the 24-line code card gets the room (p5a-r6)', async ({ page }) => {
    await page.setViewportSize({ width: 744, height: 600 });
    await page.goto(`${DEMO}?layout=floating`);
    await expect(page.locator('.sr-reader')).toBeFocused();
    await toCodeStop(page);
    await page.waitForTimeout(700);
    const card = await box(page, '.sr-exhibits');
    expect(card.height).toBeGreaterThanOrEqual(280);
    const band = await page.evaluate(() => {
      const row = document.querySelector('.sr-dial-row')!.getBoundingClientRect();
      const above = [...document.querySelectorAll('.sr-stage > :not(.sr-dial-row)')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0);
      return row.top - Math.max(...above.map((r) => r.bottom));
    });
    expect(band).toBeLessThanOrEqual(24);
  });

  test('the exhibit card and the stage move together without overlapping (p5a-r7)', async ({ page }) => {
    await page.setViewportSize({ width: 744, height: 900 });
    await page.goto(`${DEMO}?layout=floating`);
    await expect(page.locator('.sr-reader')).toBeFocused();
    await toCodeStop(page);
    await page.waitForTimeout(700);
    const sample = (delta: 1 | -1) =>
      page.evaluate(async (d) => {
        (window as unknown as { __reader: { player: { section(n: number): void } } }).__reader.player.section(d);
        const out: { card: number; stage: number; visible: boolean }[] = [];
        const start = performance.now();
        while (performance.now() - start < 520) {
          await new Promise((r) => requestAnimationFrame(r));
          const pane = document.querySelector('.sr-exhibits')!;
          out.push({
            card: pane.getBoundingClientRect().bottom,
            stage: document.querySelector('.sr-main')!.getBoundingClientRect().top,
            visible: getComputedStyle(pane).visibility === 'visible',
          });
        }
        return out;
      }, delta);
    for (const frames of [await sample(1), await sample(-1)]) {
      const during = frames.filter((f) => f.visible);
      expect(during.length).toBeGreaterThan(1);
      for (const f of during) expect(f.card).toBeLessThanOrEqual(f.stage + 0.5);
    }
  });
});

test('at 400 px a 60-character voice name still shows whether the chosen voice is local or network (p5b-r4)', async ({ page }) => {
  await page.addInitScript(() => {
    const voices = [
      { name: 'Local Voice', lang: 'en-US', voiceURI: 'local-1', localService: true, default: true },
      { name: 'An Extremely Long Network Voice Name For Testing Truncation!', lang: 'en-GB', voiceURI: 'cloud-1', localService: false, default: false },
    ];
    const synth = { getVoices: () => voices, speak() {}, cancel() {}, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(public text: string) {} }, configurable: true });
  });
  await page.setViewportSize({ width: 400, height: 800 });
  await openDemo(page);
  await page.locator('.sr-settings-button').click();
  const select = page.locator('.sr-settings [name="tts-voice"]');
  await expect(select.locator('optgroup')).toHaveCount(2);
  await select.selectOption('cloud-1');
  const badge = page.locator('.sr-settings .sr-voice-badge');
  await badge.scrollIntoViewIfNeeded();
  await expect(badge).toHaveText('network');
  const b = (await badge.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(400);
  expect(b.width).toBeGreaterThan(30);
});

const PHASE2_SHOTS = '.visual/phase2-shots';

/** The long-inline-code demo on the bottom stage, in a 1440 px viewport. */
async function openInline(page: Page, layout: 'floating' | 'panel', saved: Record<string, unknown>) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORE_KEY, JSON.stringify({ wpm: 600, ...saved })] as const);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${DEMO}?bottomStage&layout=${layout}&doc=inline`);
  await expect(page.locator('.sr-reader')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('.sr-card-chapter')).toBeVisible();
  await page.keyboard.press('Space');
}

for (const layout of ['floating', 'panel'] as const) {
  test(`a long inline code atom is a chip on the target with its stop prompt beside the ribbon and its exhibit card (${layout})`, async ({ page }) => {
    await openInline(page, layout, { readingMode: 'flow' });
    const details = page.locator('.sr-stage-details');
    await expect(details.locator('.sr-card-stop')).toBeVisible();
    await expect(page.locator('.sr-status-state')).toHaveText('Waiting');
    // The ribbon stays on screen, with the chip on the target (its middle letter lit).
    await expect(page.locator('.sr-display')).toHaveAttribute('data-kind', 'flow');
    await expect(page.locator('.sr-ribbon')).toBeVisible();
    await settleGlide(page);
    const lit = await page.evaluate(() => {
      const mid = document.querySelector<HTMLElement>('.sr-flow-mid')!;
      const word = mid.closest('.sr-w')!;
      const row = document.querySelector('.sr-ribbon-row[data-position="middle"]')!.getBoundingClientRect();
      const m = mid.getBoundingClientRect();
      return { word: word.textContent, off: Math.abs(m.left + m.width / 2 - (row.left + row.width / 2)) };
    });
    expect(lit.word).toBe('⟨code 1⟩');
    expect(lit.off).toBeLessThan(1);
    expect(await hitRibbon(page)).toEqual({ rows: [true, true, true], mid: true });
    await expect(details).toContainText('Space to continue');
    await expect(details.locator('.sr-card-title')).toHaveText('Code 1');
    // The prompt is really on screen beside the ribbon: whatever is at its centre belongs to it, not the open sidebar.
    const hits = await page.evaluate(() => {
      const hit = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return !!at && !!at.closest(selector);
      };
      return { outline: !!document.querySelector('.sr-outline')!.getBoundingClientRect().width, prompt: hit('.sr-stage-details .sr-card-stop'), exhibit: hit('.sr-exhibit[data-key="b0i1"]') };
    });
    expect(hits.prompt, 'stop prompt hit-tests inside its card').toBe(true);
    expect(hits.exhibit, 'exhibit card hit-tests inside itself').toBe(true);
    // Its exhibit card lists the full text.
    const card = page.locator('.sr-exhibits .sr-exhibit[data-key="b0i1"]');
    await expect(card).toBeVisible();
    await expect(card.locator('pre > code')).toHaveText('npm_config_userconfig_override_path');
    await page.screenshot({ path: `${PHASE2_SHOTS}/${layout}-inline-code-stop.png` });
    // Space resumes the ribbon, the prompt goes away and the exhibit stays listed.
    await page.keyboard.press('Space');
    await expect(details).toBeHidden();
    await expect(page.locator('.sr-ribbon')).toBeVisible();
    await expect(card).toBeVisible();
  });
}

test('E on an inline stop expands the full text of the code', async ({ page }) => {
  await openInline(page, 'panel', { readingMode: 'flow' });
  await expect(page.locator('.sr-card-stop')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('.sr-expanded pre > code')).toHaveText('npm_config_userconfig_override_path');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sr-expanded')).toHaveCount(0);
});

test.describe('chunk limits in the bottom-stage layouts', () => {
  test('a 6-word chunk at the fit length shows whole in panel layout; the settings keep the stored 40', async ({ page }) => {
    await openInline(page, 'panel', { readingMode: 'chunk', chunkWords: 6, chunkChars: 40, wpm: 100 });
    // Stored limits survive; the effective characters limit is what fits the 420px stage, measured on prose.
    const fit = await page.evaluate(() => {
      const probe = document.querySelector<HTMLElement>('.sr-fit-probe')!;
      const display = document.querySelector<HTMLElement>('.sr-display')!.getBoundingClientRect().width;
      const reader = (window as unknown as { __reader: { player: { settings: { chunkWords: number; chunkChars: number } } } }).__reader;
      return { fit: Math.floor(display / (probe.getBoundingClientRect().width / (probe.textContent ?? '').length)), words: reader.player.settings.chunkWords, chars: reader.player.settings.chunkChars };
    });
    expect(fit.fit).toBeGreaterThanOrEqual(33);
    expect(fit.words).toBe(6);
    expect(fit.chars).toBe(Math.min(40, Math.max(5, fit.fit)));
    // Step the dial to the 6-word, 35-character chunk "Seven quiet rivers bend under stone.".
    await page.keyboard.press('Space');
    await expect(page.locator('.sr-status-state')).toHaveText('Paused');
    const found = await page.evaluate(() => {
      const player = (window as unknown as { __reader: { player: { scrub(n: number): number } } }).__reader.player;
      for (let i = 0; i < 300; i++) {
        if (/^Seven quiet rivers/.test(document.querySelector('.sr-display .sr-chunk')?.textContent?.trim() ?? '')) return true;
        player.scrub(1);
      }
      return false;
    });
    expect(found).toBe(true);
    const shown = await page.evaluate(() => {
      const chunk = document.querySelector<HTMLElement>('.sr-display .sr-chunk')!;
      const display = document.querySelector<HTMLElement>('.sr-display')!.getBoundingClientRect();
      const parts = [...chunk.querySelectorAll<HTMLElement>('.sr-before, .sr-after')];
      return {
        text: chunk.textContent,
        clipped: parts.some((p) => p.scrollWidth > p.clientWidth + 1),
        ellipsis: parts.some((p) => getComputedStyle(p).textOverflow === 'ellipsis' && p.scrollWidth > p.clientWidth),
        inside: chunk.getBoundingClientRect().left >= display.left - 1 && chunk.getBoundingClientRect().right <= display.right + 1,
      };
    });
    expect(shown.text!.trim().split(/\s+/)).toHaveLength(6);
    expect(shown.text!.trim().length).toBeGreaterThanOrEqual(30);
    expect(shown.clipped).toBe(false);
    expect(shown.ellipsis).toBe(false);
    expect(shown.inside).toBe(true);
    await page.screenshot({ path: `${PHASE2_SHOTS}/panel-six-word-chunk.png` });
    // The settings panel offers up to 10 words and what fits as the characters maximum, and keeps the stored 40.
    await page.keyboard.press(',');
    await expect(page.locator('.sr-settings [name="chunkWords"]')).toHaveAttribute('max', '10');
    await expect(page.locator('.sr-settings [name="chunkChars"]')).toHaveAttribute('max', String(Math.min(80, Math.max(5, fit.fit))));
    await expect(page.locator('.sr-settings [name="chunkChars"]')).toHaveValue('40');
  });

  test('an over-wide chunk wraps inside the stage with no ellipsis and nothing cut off', async ({ page }) => {
    await openInline(page, 'panel', { readingMode: 'chunk', chunkWords: 1, chunkChars: 80, wpm: 100 });
    await page.keyboard.press('Space');
    await expect(page.locator('.sr-status-state')).toHaveText('Paused');
    // Step through the dial's movement to the wide token.
    const found = await page.evaluate(() => {
      const player = (window as unknown as { __reader: { player: { scrub(n: number): number } } }).__reader.player;
      for (let i = 0; i < 300; i++) {
        if (/^aaaa_bbbb/.test(document.querySelector('.sr-display .sr-chunk')?.textContent ?? '')) return true;
        player.scrub(1);
      }
      return false;
    });
    expect(found).toBe(true);
    await expect(page.locator('.sr-display')).toHaveAttribute('data-wrap', 'true');
    const wrapped = await page.evaluate(() => {
      const chunk = document.querySelector<HTMLElement>('.sr-display .sr-chunk')!;
      const display = document.querySelector<HTMLElement>('.sr-display')!.getBoundingClientRect();
      const box = chunk.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(chunk);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const parts = [...chunk.querySelectorAll<HTMLElement>('.sr-before, .sr-after')];
      return {
        text: chunk.textContent,
        lines,
        align: getComputedStyle(chunk).textAlign,
        ellipsis: parts.some((p) => getComputedStyle(p).textOverflow === 'ellipsis'),
        inside: box.left >= display.left - 1 && box.right <= display.right + 1 && box.top >= display.top - 1 && box.bottom <= display.bottom + 1,
      };
    });
    expect(wrapped.text).toContain('tttt');
    expect(wrapped.lines).toBeGreaterThanOrEqual(2);
    expect(wrapped.align).toBe('center');
    expect(wrapped.ellipsis).toBe(false);
    expect(wrapped.inside).toBe(true);
    await page.screenshot({ path: `${PHASE2_SHOTS}/panel-wrapped-chunk.png` });
  });
});

/** elementFromPoint at the centre of each ribbon row and of the lit letter: what the user would hit there. */
async function hitRibbon(page: Page) {
  return page.evaluate(() => {
    const centre = (el: Element) => {
      const b = el.getBoundingClientRect();
      return [b.left + b.width / 2, b.top + b.height / 2] as const;
    };
    const rows = (['top', 'middle', 'bottom'] as const).map((p) => {
      const row = document.querySelector(`.sr-ribbon-row[data-position="${p}"]`)!;
      const [x, y] = centre(row);
      return document.elementFromPoint(x, y)?.closest('.sr-ribbon-row')?.getAttribute('data-position') === p;
    });
    const [mx, my] = centre(document.querySelector('.sr-flow-mid')!);
    return { rows, mid: !!document.elementFromPoint(mx, my)?.closest('.sr-flow-mid') };
  });
}

for (const layout of ['floating', 'panel'] as const) {
  test.describe(`snake flow checks, ${layout} layout`, () => {
    test('every row and the lit letter are what the user hits at their centres, with the sidebar open', async ({ page }) => {
      await openFlow(page, layout, { wpm: 600 });
      await startFlow(page);
      await expect.poll(async () => (await ribbonSample(page)).index, { timeout: 20_000 }).toBeGreaterThan(30);
      await pauseFlow(page);
      expect(await hitRibbon(page)).toEqual({ rows: [true, true, true], mid: true });
    });

    test('the glide runs for 67 ms at 300 wpm and is off after a jump and under reduced motion', async ({ page }) => {
      await openFlow(page, layout, { wpm: 300 });
      await startFlow(page);
      const duration = () => page.locator('.sr-ribbon-row[data-position="middle"] .sr-ribbon-line').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
      await expect.poll(duration, { timeout: 5000 }).toBeCloseTo(0.0667, 2);
      // About 20 ms after a step the line is mid-transition: a transition is running and has not finished.
      const mid = await page.evaluate(
        () =>
          new Promise<{ running: boolean; progress: number }>((resolve) => {
            const ribbon = document.querySelector('.sr-ribbon')!;
            const line = () => document.querySelector('.sr-ribbon-row[data-position="middle"] .sr-ribbon-line')!;
            const first = ribbon.getAttribute('style');
            const watch = new MutationObserver(() => {
              if (ribbon.getAttribute('style') === first) return;
              watch.disconnect();
              setTimeout(() => {
                const a = line().getAnimations().find((x) => (x as CSSTransition).transitionProperty === 'transform');
                resolve({ running: !!a, progress: Number(a?.effect?.getComputedTiming().progress ?? 1) });
              }, 20);
            });
            watch.observe(ribbon, { attributes: true, attributeFilter: ['style'] });
          }),
      );
      expect(mid.running, 'a transform transition is running 20 ms after a step').toBe(true);
      expect(mid.progress).toBeGreaterThan(0);
      expect(mid.progress).toBeLessThan(1);
      // A jump to another section rebuilds the ribbon: it appears without a glide.
      await page.keyboard.press('Space');
      await expect(state(page)).toHaveText('Paused');
      await page.evaluate(() => (window as unknown as { __reader: { player: { section(n: number): void } } }).__reader.player.section(1));
      await expect(page.locator('.sr-card-chapter')).toBeVisible();
      await page.keyboard.press('Space');
      await expect(page.locator('.sr-ribbon')).toBeVisible();
      expect(await page.locator('.sr-ribbon').evaluate((el) => el.style.getPropertyValue('--sr-glide'))).toBe('0ms');
    });

    test('reduced motion turns the glide off', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openFlow(page, layout, { wpm: 300 });
      await startFlow(page);
      await page.waitForTimeout(700);
      expect(await page.locator('.sr-ribbon-row[data-position="middle"] .sr-ribbon-line').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBe(0);
    });

    test('a word cut by a row seam shows its full width across the two rows, to the pixel', async ({ page }) => {
      await openFlow(page, layout, { wpm: 600 });
      await startFlow(page);
      await expect.poll(async () => (await ribbonSample(page)).index, { timeout: 20_000 }).toBeGreaterThan(58);
      await pauseFlow(page);
      for (let i = 0; i < 4; i++) {
        const gaps = await page.evaluate(() => {
          const rows = (['top', 'middle', 'bottom'] as const).map((p) => document.querySelector<HTMLElement>(`.sr-ribbon-row[data-position="${p}"]`)!);
          const boxes = rows.map((r) => r.getBoundingClientRect());
          const visible = (w: Element, k: number) => {
            const r = w.getBoundingClientRect();
            return Math.max(0, Math.min(r.right, boxes[k].right) - Math.max(r.left, boxes[k].left));
          };
          const out: { seam: string; sum: number; width: number }[] = [];
          rows[1].querySelectorAll('.sr-w').forEach((_, n) => {
            const words = rows.map((r) => r.querySelectorAll('.sr-w')[n]);
            const width = words[0].getBoundingClientRect().width;
            const v = words.map((w, k) => visible(w, k));
            if (v[0] > 0.5 && v[1] > 0.5) out.push({ seam: 'top-middle', sum: v[0] + v[1], width });
            if (v[1] > 0.5 && v[2] > 0.5) out.push({ seam: 'middle-bottom', sum: v[1] + v[2], width });
          });
          return out;
        });
        for (const g of gaps) expect(Math.abs(g.sum - g.width), `${g.seam} seam`).toBeLessThanOrEqual(1);
        await page.locator('.sr-stage').hover();
        await page.mouse.wheel(0, -120);
        await settleGlide(page);
        await page.waitForTimeout(400);
      }
    });
  });
}

test.describe('the chunk fit on the bottom stage', () => {
  for (const layout of ['floating', 'panel'] as const) {
    test(`a prose chunk of exactly fit characters is shown whole and at near full size (${layout})`, async ({ page }) => {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORE_KEY, JSON.stringify({ readingMode: 'chunk', chunkWords: 10, chunkChars: 80, wpm: 100 })] as const);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${DEMO}?bottomStage&layout=${layout}`);
      await expect(page.locator('.sr-reader')).toBeFocused();
      const fit = await page.evaluate(() => (window as unknown as { __reader: { player: { settings: { chunkChars: number } } } }).__reader.player.settings.chunkChars);
      expect(fit).toBeGreaterThanOrEqual(30);
      expect(fit).toBeLessThan(80);
      // Re-read a document whose one chunk is exactly `fit` characters of ordinary lowercase prose.
      await page.evaluate((n) => {
        const w = window as unknown as { __reader: { player: { close(): void } } };
        w.__reader.player.close();
        document.getElementById('content')!.innerHTML = `<p>${'the quick brown fox jumps over a lazy dog'.slice(0, n)}</p>`;
        (document.getElementById('open') as HTMLButtonElement).click();
      }, fit);
      await expect(page.locator('.sr-reader')).toBeFocused();
      await page.keyboard.press('Space');
      await page.keyboard.press('Space');
      const shown = await page.evaluate(() => {
        const chunk = document.querySelector<HTMLElement>('.sr-display .sr-chunk')!;
        const display = document.querySelector<HTMLElement>('.sr-display')!;
        const probe = document.querySelector<HTMLElement>('.sr-fit-probe')!;
        const parts = [...chunk.querySelectorAll<HTMLElement>('.sr-before, .sr-after')];
        return {
          length: chunk.textContent!.trim().length,
          scale: Number(chunk.style.getPropertyValue('--sr-scale') || 1),
          font: parseFloat(getComputedStyle(chunk).fontSize),
          probeFont: parseFloat(getComputedStyle(probe).fontSize),
          wrapped: display.dataset.wrap,
          clipped: parts.some((p) => p.scrollWidth > p.clientWidth + 1),
        };
      });
      expect(shown.length).toBe(fit);
      expect(shown.wrapped).toBeUndefined();
      expect(shown.clipped).toBe(false);
      // Fit counts the stage's full width; the chunk keeps 12px margins, so it may give up a few percent, no more.
      expect(shown.scale).toBeGreaterThanOrEqual(0.9);
      expect(shown.font).toBeGreaterThanOrEqual(shown.probeFont * 0.9);
    });
  }
});
