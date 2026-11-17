/**
 * reader.js, injected on demand (spec section 7): resolves the container and start block,
 * extracts, and mounts the reader in a shadow root over (overlay) or beside (dock) the page.
 */
import { blockWords, DEFAULT_SETTINGS, extract, extractRange, mountReader, normalizeSettings, type Block, type Doc, type MountOptions, type ReaderHandle, type Settings, type SourceRef } from '@speed-read/core';
import { findContainer } from './adapters/index';
import { ext, type ExtApi } from './ext';
import { createBrowserHost } from './host';
import { bridgeOf, isReadMessage, ownValue, READER_KEY, type ReadMode, type ReadReply } from './shared';
import { extensionStore } from './storage';

export const DOCK_WIDTH_PX = 420;
const Z_TOP = 2147483647;
const CLOSE_MARK_MS = 1600;
const HOST_BASE = `all: initial !important; display: block !important; position: fixed !important; z-index: ${Z_TOP} !important;`;
const HOST_LAYOUT = {
  overlay: 'inset: 0 !important;',
  dock: `inset: 0 0 0 auto !important; width: ${DOCK_WIDTH_PX}px !important; box-shadow: -2px 0 16px rgba(0, 0, 0, 0.25) !important;`,
} as const;
const FRAME_STYLE = 'position: absolute; inset: 0; overflow: hidden;';
const VEIL_STYLE = 'position: absolute; inset: 0; overflow: hidden; pointer-events: none;';
/** The clear window: its outside is painted by a spread shadow far larger than any viewport. */
const WINDOW_STYLE = 'position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-radius: 6px;';
/** Room left around the block being read inside the clear window. */
const WINDOW_PAD_PX = 6;
/** Where the top of the block being read settles, as a fraction of the viewport height (spec section 13). */
export const FOLLOW_AT = 0.1;
/** Time constant of the eased page follow. */
export const FOLLOW_TAU_MS = 140;
const MAX_FRAME_MS = 50;
/** The dock's fixed-element scan (spec section 13): depth below body and elements examined. */
export const FIXED_SCAN_DEPTH = 6;
export const FIXED_SCAN_LIMIT = 3000;
/** Over these the wheel scrolls their own content instead of turning the dial. */
const OWN_SCROLL = '.sr-exhibits, .sr-outline, .sr-settings-backdrop, .sr-reading, .sr-expanded';
/** Frames in a row in which the block did not move before the follow gives up (a page end, scroll snap). */
const STUCK_FRAMES = 3;
/** The reader's push animation (400 ms) plus a margin: then the follow aims once more. */
const LAYOUT_SETTLE_MS = 480;
/** Gap between the free band's top and the block being read. */
const BAND_GAP_PX = 8;
/** Height of the block the free band must show to count as room for it. */
const BAND_MIN_PX = 48;
/** Veils for a page whose background cannot be read as one colour. */
const DARK_VEIL: [number, number, number] = [22, 24, 29];
const LIGHT_VEIL: [number, number, number] = [255, 255, 255];
/** Keys handled by the reader stay in it: they do not reach the page's own shortcuts. */
const CONTAINED_EVENTS = ['keydown', 'keyup', 'keypress'];
const READER_HOST = '[data-speed-read-host]';
/** The in-page notice shown when the reader cannot open, and how long it stays. */
export const OPEN_FAILED_TEXT = 'Speed Read could not read this page';
export const NOTICE_MS = 4000;
const NOTICE_STYLE =
  `all: initial !important; position: fixed !important; z-index: ${Z_TOP} !important; top: 16px !important; right: 16px !important; ` +
  'max-width: 360px !important; padding: 10px 14px !important; border-radius: 8px !important; background: #1f2937 !important; color: #f9fafb !important; ' +
  'font: 600 14px/1.4 system-ui, sans-serif !important; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important; pointer-events: none !important;';

export interface OpenReader {
  mode: Settings['display'];
  doc: Doc;
  container: Element;
  handle: ReaderHandle;
}

export interface Reader {
  /** The open reader, or null. */
  readonly current: OpenReader | null;
  open(mode: ReadMode): Promise<void>;
  /** Close without scrolling the page (a new open, or a re-mount, follows). */
  close(): void;
}

export interface ReaderDeps {
  api: ExtApi;
  win: Window;
  /** Where the content script's bridge is found (the shared isolated world's global). */
  scope: object;
  /** Ignore input events a page script dispatched (default true: the reader shares the page with its scripts). */
  trustedEventsOnly?: boolean;
  /** Animation frames (page follow, the dial's coast); the window's by default. */
  frame?: FrameSource;
}

type FrameSource = NonNullable<MountOptions['frame']>;

/** One frame of the eased page follow: the scroll that closes `delta` px over `dt` ms; 0 within a pixel. */
export function followStep(delta: number, dt: number): number {
  if (Math.abs(delta) < 1) return 0;
  const eased = delta * (1 - Math.exp(-dt / FOLLOW_TAU_MS));
  return Math.abs(eased) < 1 ? Math.sign(delta) : eased;
}

/** A CSS colour as r, g, b, a (0-255, alpha 0-1): drawn to a 1x1 canvas when one exists (any syntax), else parsed as rgb(a). */
export function parseColor(value: string, win: Window): [number, number, number, number] | null {
  const Canvas = (win as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
  if (Canvas) {
    try {
      const ctx = new Canvas(1, 1).getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      }
    } catch {
      // Fall through to the parser.
    }
  }
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return value === 'transparent' ? [0, 0, 0, 0] : null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, a];
}

/** Relative luminance of an sRGB colour (0-1). */
function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The page's effective background (p5a-r5): the first opaque background colour from `el` up to the
 * root. A background image or gradient met first, or no colour at all, is judged instead: a dark
 * colour scheme or light text gets a dark neutral veil, else a light one.
 */
export function pageBackground(el: Element | null, win: Window): [number, number, number] {
  for (let at = el; at; at = at.parentElement) {
    const style = win.getComputedStyle(at);
    const colour = parseColor(style.backgroundColor, win);
    if (colour && colour[3] > 0) return [colour[0], colour[1], colour[2]];
    if (style.backgroundImage && style.backgroundImage !== 'none') break;
  }
  const root = win.document.documentElement;
  const scheme = win.getComputedStyle(root).colorScheme ?? '';
  const prefersDark = typeof win.matchMedia === 'function' && win.matchMedia('(prefers-color-scheme: dark)').matches;
  const darkScheme = /\bdark\b/.test(scheme) && (!/\blight\b/.test(scheme) || prefersDark);
  const text = parseColor(win.getComputedStyle(el ?? root).color, win);
  return darkScheme || (text && luminance(text) > 0.6) ? DARK_VEIL : LIGHT_VEIL;
}

/** Save an inline property (value and priority) for an exact restore. */
type Saved = [el: HTMLElement, prop: string, value: string, priority: string];

/**
 * The dock (spec section 13, p3-r16): fixed elements whose box reaches into the dock's strip move
 * out from under it: their `right` moved in by the dock width; one that spans the viewport is pinned
 * at both sides instead, so its width is reduced by the dock width. Returns the exact restore. Elements added later are not tracked (known limit).
 */
export function shiftFixed(doc: Document, win: Window, skip: Element): () => void {
  const vw = doc.documentElement.clientWidth || win.innerWidth;
  const strip = vw - DOCK_WIDTH_PX;
  const saved: Saved[] = [];
  const set = (el: HTMLElement, prop: string, value: string) => {
    saved.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, 'important');
  };
  let examined = 0;
  let level = [...doc.body.children];
  scan: for (let depth = 1; depth <= FIXED_SCAN_DEPTH && level.length > 0; depth++) {
    const next: Element[] = [];
    for (const el of level) {
      if (examined++ >= FIXED_SCAN_LIMIT) break scan;
      if (el === skip) continue;
      next.push(...el.children);
      const style = (el as HTMLElement).style;
      if (!style || win.getComputedStyle(el).position !== 'fixed') continue;
      const box = el.getBoundingClientRect();
      if ((box.width === 0 && box.height === 0) || box.right <= strip) continue;
      const fixed = el as HTMLElement;
      const right = `${Math.round(vw - box.right) + DOCK_WIDTH_PX}px`;
      if (box.left <= 1 && box.right >= vw - 1) {
        // Spanning the viewport: pinned at both sides, so its width shrinks by the dock's (padding included).
        set(fixed, 'left', `${Math.round(box.left)}px`);
        set(fixed, 'right', right);
        set(fixed, 'width', 'auto');
      } else {
        set(fixed, 'right', right);
        set(fixed, 'left', 'auto');
      }
    }
    level = next;
  }
  return () => {
    for (const [el, prop, value, priority] of saved.reverse()) {
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
    }
  };
}

/** The blocks of `doc` from `start` on: what contains it, is it, or follows it in the page. */
export function fromBlock(doc: Doc, start: Element): Doc {
  const keep = (ref: SourceRef | undefined) => {
    const el = ref?.element;
    if (!el) return false;
    return el === start || el.contains(start) || !!(start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  };
  const sections = doc.sections.flatMap((section) => {
    const blocks = section.blocks.filter((b) => keep(b.source)).map((b) => (b.kind === 'list' ? listFrom(b, start) : b));
    const heading = section.heading && keep(section.heading.source) ? section.heading : undefined;
    if (!heading && blocks.length === 0) return [];
    return [{ ...section, heading, blocks, words: blocks.reduce((n, b) => n + blockWords(b), 0) }];
  });
  return { sections: sections.map(({ heading, ...rest }) => (heading ? { ...rest, heading } : rest)) };
}

/**
 * A list read from the item holding `start` (the innermost one, for a nested item), keeping each
 * item's own `index`/`of`, so the counter still reads e.g. "item 3/4". A start outside every item
 * (the list itself, or before it) keeps the whole list.
 */
function listFrom(list: ListBlock, start: Element): ListBlock {
  let from = -1;
  list.items.forEach((item, i) => {
    const el = item.source.element;
    if (el && (el === start || el.contains(start))) from = i;
  });
  return from <= 0 ? list : { ...list, items: list.items.slice(from) };
}

function selectedRange(win: Window): Range | null {
  const sel = win.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return null;
  return sel.getRangeAt(0);
}

type ListBlock = Extract<Block, { kind: 'list' }>;

const elementOf = (node: Node): Element | null => (node.nodeType === 1 ? (node as Element) : node.parentElement);

function defaultFrames(win: Window): FrameSource {
  if (typeof win.requestAnimationFrame === 'function') {
    return { request: (fn) => win.requestAnimationFrame(fn), cancel: (h) => win.cancelAnimationFrame(h as number) };
  }
  return { request: (fn) => win.setTimeout(() => fn(win.performance.now()), 16), cancel: (h) => win.clearTimeout(h as number) };
}

/** The nearest ancestor that scrolls vertically, else the page's scrolling element. */
function scrollerOf(el: Element, doc: Document, win: Window): Element {
  for (let at = el.parentElement; at && at !== doc.body && at !== doc.documentElement; at = at.parentElement) {
    const overflow = win.getComputedStyle(at).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') && at.scrollHeight > at.clientHeight) return at;
  }
  return doc.scrollingElement ?? doc.documentElement;
}

export function createReader({ api, win, scope, trustedEventsOnly = true, frame: frames = defaultFrames(win) }: ReaderDeps): Reader {
  const doc = win.document;
  const baseStore = extensionStore(api.storage.local);
  let current: (OpenReader & { teardown(): void; lastRef: SourceRef | null; hostElement: HTMLElement }) | null = null;

  /**
   * What to read for `mode`, resolved while the open reader (if any) stays open: its host is marked
   * `hidden` meanwhile (its inline style keeps it shown) so extraction never reads the reader's own copies.
   */
  function resolveBeside(mode: ReadMode): { doc: Doc; container: Element } | null {
    const hostElement = current?.hostElement;
    const had = hostElement?.hasAttribute('hidden') ?? true;
    if (!had) hostElement!.setAttribute('hidden', '');
    try {
      const content = resolve(mode);
      return content && !content.container.closest(READER_HOST) ? content : null;
    } finally {
      if (!had) hostElement!.removeAttribute('hidden');
    }
  }

  /** What to read for `mode`: the document and the container it comes from. */
  function resolve(mode: ReadMode): { doc: Doc; container: Element } | null {
    const hostname = win.location.hostname;
    const range = mode === 'auto' || mode === 'selection' ? selectedRange(win) : null;
    if (range) {
      const start = elementOf(range.startContainer);
      const common = elementOf(range.commonAncestorContainer);
      const found = start ? findContainer(doc, hostname, start) : null;
      const container = found && common && found.contains(common) ? found : common;
      if (container) return { doc: extractRange(range), container };
    }
    const bridge = bridgeOf(scope);
    const target = mode === 'from-here' ? bridge?.contextTarget() : mode === 'from-block' ? bridge?.hoverTarget() : null;
    if (target && target.isConnected) {
      const container = findContainer(doc, hostname, target);
      const read = container ? fromBlock(extract(container), target) : null;
      if (container && read && read.sections.length > 0) return { doc: read, container };
      // Nothing readable around it (page furniture extraction skips): the block alone, else the main content.
      const alone = extract(target);
      if (alone.sections.length > 0) return { doc: alone, container: target };
    }
    const container = findContainer(doc, hostname);
    return container ? { doc: extract(container), container } : null;
  }

  /** The dock's page margin and fixed-element shift; the overlay changes nothing on the page. */
  function makeRoom(mode: Settings['display'], hostElement: Element): () => void {
    if (mode !== 'dock') return () => {};
    const root = doc.documentElement.style;
    const value = root.getPropertyValue('margin-right');
    const priority = root.getPropertyPriority('margin-right');
    const unshift = shiftFixed(doc, win, hostElement);
    root.setProperty('margin-right', `${DOCK_WIDTH_PX}px`, 'important');
    return () => {
      unshift();
      if (value) root.setProperty('margin-right', value, priority);
      else root.removeProperty('margin-right');
    };
  }

  function markBriefly(el: Element) {
    const style = (el as HTMLElement).style;
    if (!style) return;
    const before = [style.outline, style.outlineOffset];
    // The overlay has kept the block in view; the dock may not have: scroll only when it is out of view.
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    style.outline = '3px solid #f97316';
    style.outlineOffset = '2px';
    win.setTimeout(() => {
      [style.outline, style.outlineOffset] = before;
    }, CLOSE_MARK_MS);
  }

  /**
   * The faded page (spec section 13): a veil in the page's own background colour at `1 - pageFade`
   * with a clear window over the block being read, and the eased scroll that keeps that block's top
   * at 10 % of the viewport height.
   */
  function createVeil(shadow: ShadowRoot, container: Element, pageFade: number) {
    const veil = doc.createElement('div');
    veil.className = 'sr-veil';
    veil.style.cssText = VEIL_STYLE;
    const clear = doc.createElement('div');
    clear.className = 'sr-window';
    clear.style.cssText = WINDOW_STYLE;
    veil.append(clear);
    shadow.append(veil);
    const [r, g, b] = pageBackground(container, win);
    const fade = (strength: number) => {
      const alpha = Math.round((1 - strength) * 100) / 100;
      clear.style.boxShadow = `0 0 0 200vmax rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    fade(pageFade);

    let block: Element | null = null;
    let scroller: Element | null = null;
    let following = false;
    let last: number | null = null;
    let lastTop = Number.NaN;
    let stuck = 0;
    let pending: unknown = null;
    /** One more aim after the reader's own layout has settled (the narrow push moves the free band). */
    let settle: number | null = null;
    /** Where the block's top should sit, in viewport px; 10 % of the viewport until the host says more. */
    let target: (box: DOMRect) => number = () => win.innerHeight * FOLLOW_AT;

    function place() {
      if (!block || !block.isConnected) return;
      const box = block.getBoundingClientRect();
      const vw = doc.documentElement.clientWidth || win.innerWidth;
      const vh = win.innerHeight;
      const clamp = (v: number, hi: number) => Math.min(hi + WINDOW_PAD_PX, Math.max(-WINDOW_PAD_PX, v));
      const left = clamp(box.left - WINDOW_PAD_PX, vw);
      const top = clamp(box.top - WINDOW_PAD_PX, vh);
      const right = clamp(box.right + WINDOW_PAD_PX, vw);
      const bottom = clamp(box.bottom + WINDOW_PAD_PX, vh);
      Object.assign(clear.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    }

    /** Scroll by `step` at once: an instant scroll, so a page's smooth scrolling cannot swallow it (p5a-r2). */
    function scrollBy(target: Element, step: number) {
      const top = target.scrollTop + step;
      if (typeof target.scrollTo === 'function') target.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
      else target.scrollTop = top;
    }

    /** One frame of the follow; frames are requested only while it moves (p5a-r1). */
    function tick(time: number) {
      pending = null;
      if (!following || !block?.isConnected || !scroller) {
        following = false;
        return;
      }
      const dt = last === null ? 16 : Math.min(MAX_FRAME_MS, Math.max(0, time - last));
      last = time;
      const box = block.getBoundingClientRect();
      // Arrival is judged by where the block is, never by the scroll offset read back.
      stuck = Math.abs(box.top - lastTop) < 0.5 ? stuck + 1 : 0;
      lastTop = box.top;
      const step = followStep(box.top - target(box), dt);
      if (step === 0 || stuck >= STUCK_FRAMES) {
        following = false;
        place();
        return;
      }
      scrollBy(scroller, step);
      place();
      pending = frames.request(tick);
    }

    const onMove = () => place();
    win.addEventListener('scroll', onMove, { capture: true, passive: true });
    win.addEventListener('resize', onMove);
    const Resize = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    const resize = Resize ? new Resize(onMove) : null;

    return {
      fade,
      /** The host's target for the block's top (the free band above the stage). */
      aim(fn: (box: DOMRect) => number) {
        target = fn;
      },
      follow(el: Element) {
        if (el !== block) {
          scroller = scrollerOf(el, doc, win);
          if (block) resize?.unobserve(block);
          resize?.observe(el);
        }
        block = el;
        following = true;
        stuck = 0;
        lastTop = Number.NaN;
        last = null;
        place();
        if (pending === null) pending = frames.request(tick);
        if (settle !== null) win.clearTimeout(settle);
        settle = win.setTimeout(() => {
          settle = null;
          if (!block?.isConnected || following) return;
          following = true;
          stuck = 0;
          lastTop = Number.NaN;
          last = null;
          if (pending === null) pending = frames.request(tick);
        }, LAYOUT_SETTLE_MS);
      },
      destroy() {
        if (pending !== null) frames.cancel(pending);
        pending = null;
        following = false;
        if (settle !== null) win.clearTimeout(settle);
        win.removeEventListener('scroll', onMove, { capture: true });
        win.removeEventListener('resize', onMove);
        resize?.disconnect();
        veil.remove();
      },
    };
  }

  /**
   * Where the block being read should sit (p5a-r8): just below the free band's top (below the
   * exhibit card when it sits above the stage), never above 10 % of the viewport; when the band
   * cannot show it, below the stage if there is room, else at the band's top.
   */
  function routeWheel(e: WheelEvent, handle: ReaderHandle) {
    if (e.ctrlKey || e.metaKey) return;
    const target = e.target as Element | null;
    if (!target || target.closest('.sr-stage')) return; // the stage's own dial handles it
    const own = target.closest(OWN_SCROLL);
    if (!own) return handle.wheel(e);
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // Scroll the reader's own content while it can; never hand the wheel on to the page (p5a-r3).
    if (!canScroll(target, own, e.deltaY)) e.preventDefault();
  }

  /** Whether a scroller between `target` and `own` (inclusive) can still move by `dy`. */
  function canScroll(target: Element, own: Element, dy: number): boolean {
    for (let at: Element | null = target; at; at = at.parentElement) {
      const overflow = win.getComputedStyle(at).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && at.scrollHeight > at.clientHeight + 1) {
        if (dy < 0 && at.scrollTop > 0) return true;
        if (dy > 0 && at.scrollTop + at.clientHeight < at.scrollHeight - 1) return true;
      }
      if (at === own) break;
    }
    return false;
  }

  function aimFor(handle: ReaderHandle) {
    return (box: DOMRect) => {
      const vh = win.innerHeight;
      const fallback = vh * FOLLOW_AT;
      const band = handle.freeBand();
      if (!band || !(band.bottom > band.top)) return fallback;
      const top = Math.max(fallback, band.top + BAND_GAP_PX);
      const need = Math.min(box.height, BAND_MIN_PX);
      if (top + need <= band.bottom) return top;
      if (band.below + BAND_GAP_PX + need <= vh) return band.below + BAND_GAP_PX;
      return band.top + BAND_GAP_PX;
    };
  }

  function mount(mode: Settings['display'], content: { doc: Doc; container: Element }, settings: Settings, at: SourceRef | null) {
    const hostElement = doc.createElement('div');
    hostElement.setAttribute('data-speed-read-host', '');
    hostElement.dataset.display = mode;
    hostElement.style.cssText = HOST_BASE + HOST_LAYOUT[mode];
    // Closed, so page scripts cannot reach the reader; open only in the browser-level test build.
    const shadow = hostElement.attachShadow({ mode: __SR_TEST__ ? 'open' : 'closed' });
    for (const type of CONTAINED_EVENTS) hostElement.addEventListener(type, (e) => e.stopPropagation());
    const overlay = mode === 'overlay' ? createVeil(shadow, content.container, settings.pageFade) : null;
    const frame = doc.createElement('div');
    frame.className = 'sr-frame';
    frame.style.cssText = FRAME_STYLE;
    shadow.append(frame);
    doc.body.append(hostElement);
    const unmakeRoom = makeRoom(mode, hostElement);
    try {
      mountInto(hostElement, frame, overlay, unmakeRoom, mode, content, settings, at);
    } catch (error) {
      // A reader that failed to build leaves nothing on the page.
      overlay?.destroy();
      hostElement.remove();
      unmakeRoom();
      if (current?.hostElement === hostElement) current = null;
      throw error;
    }
  }

  function mountInto(
    hostElement: HTMLElement,
    frame: HTMLElement,
    overlay: ReturnType<typeof createVeil> | null,
    unmakeRoom: () => void,
    mode: Settings['display'],
    content: { doc: Doc; container: Element },
    settings: Settings,
    at: SourceRef | null,
  ) {

    const store = {
      load: baseStore.load,
      async save(next: Settings) {
        overlay?.fade(next.pageFade);
        // A refused write (a gone extension context, the quota) still re-mounts; the reader shows the failure.
        try {
          await baseStore.save(next);
        } finally {
          if (current && current.handle === handle && next.display !== mode) win.setTimeout(() => remount(next));
        }
      },
    };
    const host = createBrowserHost(hostElement, content.container, {
      onPosition: (ref) => {
        if (current) current.lastRef = ref;
        if (ref.element) overlay?.follow(ref.element);
      },
      onClose: () => finish(),
    });
    const handle = mountReader(frame, content.doc, {
      settings,
      store,
      host,
      trustedEventsOnly,
      frame: frames,
      layout: mode === 'overlay' ? 'floating' : 'panel',
      hostSettings: ['pageFade'],
    });
    // Overlay: every wheel event on the page turns the dial, except where the reader scrolls its own
    // content; zoom (ctrl/meta) and horizontal swipes stay the browser's.
    if (overlay) {
      overlay.aim(aimFor(handle));
      frame.addEventListener('wheel', (e) => routeWheel(e, handle), { passive: false });
    }
    // A page that re-renders (an SPA) can remove the host element: restore the page as on close.
    const removal = new MutationObserver(() => {
      if (!hostElement.isConnected && current?.handle === handle) close();
    });
    removal.observe(doc.body, { childList: true });
    removal.observe(doc.documentElement, { childList: true });
    if (at) void handle.ready.then(() => handle.player.jumpToBlock(at));
    current = {
      mode,
      ...content,
      handle,
      hostElement,
      lastRef: at,
      teardown() {
        removal.disconnect();
        overlay?.destroy();
        handle.destroy();
        hostElement.remove();
        unmakeRoom();
      },
    };
  }

  function close() {
    const open = current;
    current = null;
    open?.teardown();
  }

  /** The reader closed itself: restore the page and show where reading stopped. */
  function finish() {
    const open = current;
    close();
    const el = open?.lastRef?.element;
    if (el && el.isConnected) markBriefly(el);
  }

  function remount(next: Settings) {
    const open = current;
    if (!open) return;
    const at = open.lastRef;
    close();
    mount(next.display, open, next, at);
  }

  return {
    get current() {
      return current;
    },
    async open(mode) {
      // The new content first: a page with nothing to read keeps the reader that is open.
      const content = resolveBeside(mode);
      if (!content) throw new Error('Nothing to read was found on this page');
      const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(await baseStore.load()) });
      close();
      mount(settings.display, content, settings, null);
    },
    close,
  };
}

/** Register the reader once per page: a repeated injection is a no-op (spec section 7). */
export function install(scope: object, win: Window): boolean {
  if (ownValue(scope, READER_KEY)) return false;
  const api = ext(scope);
  if (!api) return false;
  const reader = createReader({ api, win, scope });
  (scope as Record<PropertyKey, unknown>)[READER_KEY] = reader;
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isReadMessage(message)) return undefined;
    const reply = (r: ReadReply) => {
      try {
        sendResponse?.(r);
      } catch {
        // The background no longer listens: nothing to report to.
      }
    };
    reader.open(message.mode).then(
      () => reply({ ok: true }),
      (error: unknown) => {
        showNotice(win, OPEN_FAILED_TEXT);
        reply({ ok: false, error: error instanceof Error ? error.message : String(error) });
      },
    );
    // Keeps the channel open for the asynchronous reply (Chrome and Firefox).
    return true;
  });
  return true;
}

/** A small notice at the top right of the page that removes itself after `NOTICE_MS`. */
export function showNotice(win: Window, text: string): HTMLElement {
  const doc = win.document;
  doc.querySelector('[data-speed-read-notice]')?.remove();
  const el = doc.createElement('div');
  el.setAttribute('data-speed-read-notice', '');
  el.setAttribute('role', 'status');
  el.style.cssText = NOTICE_STYLE;
  el.textContent = text;
  (doc.body ?? doc.documentElement).append(el);
  win.setTimeout(() => el.remove(), NOTICE_MS);
  return el;
}

if (typeof window !== 'undefined') install(globalThis, window);
