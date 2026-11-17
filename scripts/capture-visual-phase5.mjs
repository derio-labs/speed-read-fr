// Phase 5 visual evidence (called by capture-visual.mjs --phase 5): the floating overlay over the faded
// page (light article, dark styled page, narrow window), the dock beside a page with fixed elements,
// both with the built Chrome extension in the full Chromium; and the speech settings on the core demo
// with an injected speechSynthesis holding one local and one network voice.
import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtension, extensionDir } from '../packages/browser-extension/build.mjs';
import { buildDemo } from './build-demo.mjs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|chrome-extension:\/\/|data:|blob:|about:)/;

/** Fake voices for the speech settings shot (no real voice exists in a headless browser). */
function fakeSpeech() {
  const voices = [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'local-samantha', localService: true, default: true },
    { name: 'Daniel', lang: 'en-GB', voiceURI: 'local-daniel', localService: true, default: false },
    { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'net-google-uk', localService: false, default: false },
  ];
  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  const synth = { getVoices: () => voices, speak() {}, cancel() {}, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
}

export async function capturePhase5(outDir) {
  await buildExtension({ test: true });
  await buildDemo();
  const EXTENSION = extensionDir(true);
  const server = await startServer(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
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

    async function open(file, settings = {}, viewport = { width: 1280, height: 800 }) {
      for (const p of context.pages()) await p.close();
      await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      page.on('pageerror', (e) => {
        throw e;
      });
      await page.goto(`${origin}/tests/fixtures/${file}`);
      await page.waitForLoadState('load');
      return page;
    }

    async function openReader(page) {
      const url = page.url();
      await worker.evaluate(async (u) => {
        const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
        await globalThis.__speedReadTest.openReader(tab.id, 'auto');
      }, url);
      await page.locator('[data-speed-read-host] .sr-reader').waitFor();
    }

    async function shot(page, name) {
      const file = path.join(outDir, name);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: file });
      written.push(path.relative(root, file));
    }

    /** Turn the dial by slow wheel notches over the faded page, then let the page follow settle. */
    async function scrub(page, notches) {
      await page.mouse.move(40, 300);
      for (let i = 0; i < notches; i++) {
        await page.mouse.wheel(0, 130);
        await page.waitForTimeout(420);
      }
      await page.waitForTimeout(1400);
    }

    // Floating cards over the light article, mid-document, paused on a chunk.
    let page = await open('article.html');
    await openReader(page);
    await page.keyboard.press('n');
    await page.keyboard.press('Space');
    await scrub(page, 5);
    await shot(page, 'floating-overlay-light.png');

    // The same over the dark styled page.
    page = await open('styled.html');
    await openReader(page);
    await scrub(page, 6);
    await shot(page, 'floating-overlay-dark.png');

    // Narrow window at the code stop: the exhibit card above the stage, as tall as its content.
    page = await open('article.html', {}, { width: 700, height: 960 });
    await openReader(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press('n');
    const display = page.locator('[data-speed-read-host] .sr-display');
    for (let i = 0; i < 30 && (await display.getAttribute('data-kind')) !== 'stop'; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1400);
    await shot(page, 'floating-narrow-exhibit-push.png');

    // Docked beside a page with a header fixed across the top and a button fixed at the right edge.
    page = await open('fixed.html', { display: 'dock', wpm: 200 });
    await openReader(page);
    await page.keyboard.press('Space');
    await page.locator('[data-speed-read-host] .sr-card-chapter').waitFor();
    await shot(page, 'docked-side-panel-fixed-elements.png');

    // Speech settings on the core demo: local and network voices, a network voice picked.
    for (const p of context.pages()) await p.close();
    page = await context.newPage();
    await page.addInitScript(fakeSpeech);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/tests/demo/index.html`);
    await page.locator('.sr-reader').waitFor();
    await page.locator('.sr-settings-button').click();
    await page.locator('.sr-settings [name="tts-voice"]').selectOption('net-google-uk');
    await page.locator('.sr-settings [name="tts"]').check();
    await page.locator('.sr-settings .sr-tts-notes').scrollIntoViewIfNeeded();
    await page.locator('.sr-settings .sr-settings-foot').scrollIntoViewIfNeeded();
    // The voice list itself, opened as a listbox is not capturable: show the options as a size-4 list.
    await page.locator('.sr-settings [name="tts-voice"]').evaluate((el) => el.setAttribute('size', '4'));
    await shot(page, 'speech-settings-voices.png');
  } finally {
    await context.close();
    server.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
  if (offsite.length) throw new Error(`requests that left localhost: ${offsite.join(', ')}`);
  return written;
}
