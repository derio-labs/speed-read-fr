/**
 * reader.js, injected on demand (spec section 7): resolves the container and start block,
 * extracts, and mounts the reader in a shadow root over (overlay) or beside (dock) the page.
 */
import { blockWords, DEFAULT_SETTINGS, extract, extractRange, mountReader, normalizeSettings, type Doc, type ReaderHandle, type Settings, type SourceRef } from '@speed-read/core';
import { findContainer } from './adapters/index';
import { ext, type ExtApi } from './ext';
import { createBrowserHost } from './host';
import { bridgeOf, isReadMessage, ownValue, READER_KEY, type ReadMode } from './shared';
import { extensionStore } from './storage';

export const DOCK_WIDTH_PX = 420;
const Z_TOP = 2147483647;
const CLOSE_MARK_MS = 1600;
const HOST_BASE = `all: initial !important; display: block !important; position: fixed !important; z-index: ${Z_TOP} !important;`;
const HOST_LAYOUT = {
  overlay: 'inset: 0 !important;',
  dock: `inset: 0 0 0 auto !important; width: ${DOCK_WIDTH_PX}px !important; box-shadow: -2px 0 16px rgba(0, 0, 0, 0.25) !important;`,
} as const;
const BACKDROP_STYLE = 'position: absolute; inset: 0; background: rgba(15, 23, 42, 0.6);';
const FRAME_STYLE = {
  overlay: 'position: absolute; inset: max(16px, 4vh) max(16px, 4vw); border-radius: 12px; overflow: hidden; box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);',
  dock: 'position: absolute; inset: 0; overflow: hidden;',
} as const;
/** Keys handled by the reader stay in it: they do not reach the page's own shortcuts. */
const CONTAINED_EVENTS = ['keydown', 'keyup', 'keypress'];

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
}

/** The blocks of `doc` from `start` on: what contains it, is it, or follows it in the page. */
export function fromBlock(doc: Doc, start: Element): Doc {
  const keep = (ref: SourceRef | undefined) => {
    const el = ref?.element;
    if (!el) return false;
    return el === start || el.contains(start) || !!(start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  };
  const sections = doc.sections.flatMap((section) => {
    const blocks = section.blocks.filter((b) => keep(b.source));
    const heading = section.heading && keep(section.heading.source) ? section.heading : undefined;
    if (!heading && blocks.length === 0) return [];
    return [{ ...section, heading, blocks, words: blocks.reduce((n, b) => n + blockWords(b), 0) }];
  });
  return { sections: sections.map(({ heading, ...rest }) => (heading ? { ...rest, heading } : rest)) };
}

function selectedRange(win: Window): Range | null {
  const sel = win.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return null;
  return sel.getRangeAt(0);
}

const elementOf = (node: Node): Element | null => (node.nodeType === 1 ? (node as Element) : node.parentElement);

export function createReader({ api, win, scope }: ReaderDeps): Reader {
  const doc = win.document;
  const baseStore = extensionStore(api.storage.local);
  let current: (OpenReader & { teardown(): void; lastRef: SourceRef | null }) | null = null;

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
      if (container) return { doc: fromBlock(extract(container), target), container };
    }
    const container = findContainer(doc, hostname);
    return container ? { doc: extract(container), container } : null;
  }

  function lockPage(mode: Settings['display']): () => void {
    const root = doc.documentElement.style;
    const prop = mode === 'overlay' ? 'overflow' : 'margin-right';
    const value = root.getPropertyValue(prop);
    const priority = root.getPropertyPriority(prop);
    root.setProperty(prop, mode === 'overlay' ? 'hidden' : `${DOCK_WIDTH_PX}px`, 'important');
    return () => {
      if (value) root.setProperty(prop, value, priority);
      else root.removeProperty(prop);
    };
  }

  function markBriefly(el: Element) {
    const style = (el as HTMLElement).style;
    if (!style) return;
    const before = [style.outline, style.outlineOffset];
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
    style.outline = '3px solid #f97316';
    style.outlineOffset = '2px';
    win.setTimeout(() => {
      [style.outline, style.outlineOffset] = before;
    }, CLOSE_MARK_MS);
  }

  function mount(mode: Settings['display'], content: { doc: Doc; container: Element }, settings: Settings, at: SourceRef | null) {
    const hostElement = doc.createElement('div');
    hostElement.setAttribute('data-speed-read-host', '');
    hostElement.dataset.display = mode;
    hostElement.style.cssText = HOST_BASE + HOST_LAYOUT[mode];
    // Closed, so page scripts cannot reach the reader; open only in the browser-level test build.
    const shadow = hostElement.attachShadow({ mode: __SR_TEST__ ? 'open' : 'closed' });
    for (const type of CONTAINED_EVENTS) hostElement.addEventListener(type, (e) => e.stopPropagation());
    if (mode === 'overlay') {
      const backdrop = doc.createElement('div');
      backdrop.className = 'sr-backdrop';
      backdrop.style.cssText = BACKDROP_STYLE;
      backdrop.addEventListener('click', () => finish());
      shadow.append(backdrop);
    }
    const frame = doc.createElement('div');
    frame.className = 'sr-frame';
    frame.style.cssText = FRAME_STYLE[mode];
    shadow.append(frame);
    doc.body.append(hostElement);
    const unlock = lockPage(mode);

    const store = {
      load: baseStore.load,
      async save(next: Settings) {
        await baseStore.save(next);
        if (current && current.handle === handle && next.display !== mode) win.setTimeout(() => remount(next));
      },
    };
    const host = createBrowserHost(hostElement, content.container, {
      onPosition: (ref) => {
        if (current) current.lastRef = ref;
      },
      onClose: () => finish(),
    });
    const handle = mountReader(frame, content.doc, { settings, store, host });
    if (at) void handle.ready.then(() => handle.player.jumpToBlock(at));
    current = {
      mode,
      ...content,
      handle,
      lastRef: at,
      teardown() {
        handle.destroy();
        hostElement.remove();
        unlock();
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
      close();
      const content = resolve(mode);
      if (!content) return;
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
  api.runtime.onMessage.addListener((message) => {
    if (isReadMessage(message)) void reader.open(message.mode);
  });
  return true;
}

if (typeof window !== 'undefined') install(globalThis, window);
