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
      return { overflows: list.scrollHeight > list.clientHeight + 1, atMax: Math.abs(cardHeight - max) <= 1 };
    });
    expect(fit.overflows ? fit.atMax : true).toBe(true);

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
