/** A mounted reader over our own HTML, with a spying clone host, a fake clock and a memory store (jsdom tests). */
import { vi } from 'vitest';
import { extract } from '../extract/extract';
import type { Doc } from '../model';
import { DEFAULT_SETTINGS, memoryStore, type Settings } from '../settings';
import { createCloneHost } from '../ui/clone-host';
import type { Host } from '../ui/host';
import { mountReader, type ReaderHandle } from '../ui/mount';
import { fakeClock, type FakeClock } from './clock';
import type { SpeechDriver } from '../tts';

export interface Harness {
  doc: Doc;
  source: HTMLElement;
  mount: HTMLElement;
  reader: HTMLElement;
  handle: ReaderHandle;
  host: Host & { [K in keyof Host]: ReturnType<typeof vi.fn> };
  /** Nodes handed out by the host and not yet released. */
  live: Set<Node>;
  store: ReturnType<typeof memoryStore> & { save: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
  clock: ReturnType<typeof fakeClock>;
  q<T extends Element = HTMLElement>(selector: string): T | null;
  qa<T extends Element = HTMLElement>(selector: string): T[];
  /** Dispatch a keydown on the focused element (the reader root by default). */
  key(key: string, init?: KeyboardEventInit, target?: Element): KeyboardEvent;
  /** Let the store's load() settle. */
  settle(): Promise<void>;
  /** Advance the clock by `ms` in 16 ms frames, running queued frame callbacks (the dial's coast). */
  runFrames(ms: number): void;
}

export interface HarnessOptions {
  settings?: Partial<Settings>;
  saved?: Partial<Settings>;
  trustedEventsOnly?: boolean;
  layout?: 'panel' | 'floating';
  /** Mount the bottom-stage layout (details panel beside the stage). */
  bottomStage?: boolean;
  /** Declare the host's page fade setting (the browser overlay). */
  pageFade?: boolean;
  /** A speech driver, or one built on the harness clock; none (unavailable) by default. */
  speech?: SpeechDriver | ((clock: FakeClock) => SpeechDriver);
}

export function mountHarness(markup: string, opts: HarnessOptions = {}): Harness {
  document.body.innerHTML = `<div id="src">${markup}</div><div id="mount"></div>`;
  const source = document.getElementById('src')!;
  const mount = document.getElementById('mount')!;
  const doc = extract(source);
  const clone = createCloneHost(source);
  const live = new Set<Node>();
  const host = {
    exhibit: vi.fn((block, use) => {
      const node = clone.exhibit(block, use);
      live.add(node);
      return node;
    }),
    document: vi.fn(() => {
      const d = clone.document();
      live.add(d.node);
      return d;
    }),
    release: vi.fn((node: Node) => {
      live.delete(node);
    }),
    onPosition: vi.fn(),
    onClose: vi.fn(),
  } as unknown as Harness['host'];
  const base = memoryStore(opts.saved ?? {});
  const store = { load: vi.fn(() => base.load()), save: vi.fn((s: Settings) => base.save(s)) } as unknown as Harness['store'];
  const clock = fakeClock();
  let frames: ((time: number) => void)[] = [];
  const frame = {
    request(fn: (time: number) => void) {
      frames.push(fn);
      return fn;
    },
    cancel(handle: unknown) {
      frames = frames.filter((f) => f !== handle);
    },
  };
  const handle = mountReader(mount, doc, {
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
    store,
    host,
    scheduler: clock,
    trustedEventsOnly: opts.trustedEventsOnly,
    layout: opts.layout,
    bottomStage: opts.bottomStage,
    hostSettings: opts.pageFade ? ['pageFade'] : undefined,
    speech: typeof opts.speech === 'function' ? opts.speech(clock) : opts.speech,
    frame,
  });
  const reader = mount.querySelector<HTMLElement>('.sr-reader')!;
  return {
    doc,
    source,
    mount,
    reader,
    handle,
    host,
    live,
    store,
    clock,
    q: (selector) => mount.querySelector(selector),
    qa: (selector) => [...mount.querySelectorAll(selector)] as never,
    key(key, init = {}, target) {
      const el = target ?? (document.activeElement as Element | null) ?? reader;
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      el.dispatchEvent(event);
      return event;
    },
    async settle() {
      await handle.ready;
    },
    runFrames(ms) {
      for (let left = ms; left > 0; left -= 16) {
        clock.advance(Math.min(16, left));
        const due = frames;
        frames = [];
        for (const fn of due) fn(clock.now());
      }
    },
  };
}

/** An article with two chapters, a sub-heading, a code block, a table and a long list. */
export const ARTICLE = `
<h1 data-line="1">Guide</h1>
<p data-line="3">The first paragraph has several words. It has two sentences.</p>
<h2 data-line="5">Setup</h2>
<p data-line="7">Install with <code>npm ci</code> first.</p>
<pre data-line="9"><code class="language-sh">npm ci
npm test</code></pre>
<h3 data-line="13">Details</h3>
<p>Short detail.</p>
<h2 data-line="15">Usage</h2>
<p>Read everything slowly and then quickly.</p>
<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>
<ul><li>first list item that is rather long indeed</li><li>second list item that is also long<ul><li>nested item in the list here</li></ul></li></ul>
`;
