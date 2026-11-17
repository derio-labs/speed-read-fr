/**
 * content.js, always on and kept small (spec section 7, R14): Alt-hover outlines the block under
 * the pointer and turns a press on it into "read from here"; it also remembers the element under
 * the last context-menu event. It does not import the reader core. With Alt up no listener changes
 * anything.
 */
import { ext, type ExtApi } from './ext';
import { BRIDGE_KEY, bridgeOf, HOVER_MESSAGE, type ContentBridge } from './shared';

export const HOVER_ATTRIBUTE = 'data-speed-read-hover';
/** Marks the reader's host element; nothing inside it (the reader, its slotted clones) is hovered. */
export const READER_HOST_SELECTOR = '[data-speed-read-host]';
const OUTLINE = '2px solid #f97316';
const PRESS_EVENTS = ['mousedown', 'mouseup', 'click', 'auxclick'];
const BLOCK_TAGS = new Set(['P', 'LI', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'FIGURE', 'DD', 'DT', 'DETAILS']);
const INLINE_DISPLAY = /^(inline|contents|none|table-(cell|row|column))/;

/** The block an element belongs to: the nearest block-like ancestor-or-self below body. */
export function blockOf(el: Element | null, win: Window): Element | null {
  let fallback: Element | null = null;
  for (let n = el; n && n !== n.ownerDocument.body && n !== n.ownerDocument.documentElement; n = n.parentElement) {
    if (BLOCK_TAGS.has(n.tagName)) return n;
    if (!fallback && !INLINE_DISPLAY.test(win.getComputedStyle(n).display)) fallback = n;
  }
  return fallback;
}

/** The event's element target, unless it is inside the open reader. */
function pageTarget(e: Event): Element | null {
  const target = e.target instanceof Element ? e.target : null;
  return target && !target.closest(READER_HOST_SELECTOR) ? target : null;
}

/** Hand `el` out once, and only while it is in the page. */
const take = (el: Element | null): Element | null => (el?.isConnected ? el : null);

/** Install the listeners on `win` and the bridge on `scope`; returns the uninstall. */
export function installContent(scope: object, win: Window, api: ExtApi | undefined): () => void {
  const slots = scope as Record<PropertyKey, ContentBridge | undefined>;
  if (bridgeOf(scope)) return () => {};
  let outlined: HTMLElement | null = null;
  let saved: [string, string, string, string] = ['', '', '', ''];
  let underPointer: Element | null = null;
  let contextTarget: Element | null = null;
  let hoverTarget: Element | null = null;
  let pressed = false;

  function clear() {
    if (!outlined) return;
    const s = outlined.style;
    s.setProperty('outline', saved[0], saved[1]);
    s.setProperty('outline-offset', saved[2], saved[3]);
    if (!outlined.getAttribute('style')) outlined.removeAttribute('style');
    outlined.removeAttribute(HOVER_ATTRIBUTE);
    outlined = null;
  }

  function outline(el: Element | null) {
    const block = blockOf(el, win) as HTMLElement | null;
    if (block === outlined) return;
    clear();
    if (!block?.style) return;
    const s = block.style;
    saved = [s.getPropertyValue('outline'), s.getPropertyPriority('outline'), s.getPropertyValue('outline-offset'), s.getPropertyPriority('outline-offset')];
    s.setProperty('outline', OUTLINE, 'important');
    s.setProperty('outline-offset', '2px', 'important');
    block.setAttribute(HOVER_ATTRIBUTE, '');
    outlined = block;
  }

  const onMove = (e: MouseEvent) => {
    underPointer = pageTarget(e);
    if (e.altKey) outline(underPointer);
    else clear();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Alt') return;
    if (e.type === 'keydown') {
      outline(underPointer);
      return;
    }
    clear();
    if (pressed) {
      // Keeps the menu bar from taking focus after an Alt+press.
      pressed = false;
      e.preventDefault();
    }
  };

  const onPress = (e: MouseEvent) => {
    const target = pageTarget(e);
    if (!outlined || !e.altKey || !target || !outlined.contains(target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pressed = true;
    if (e.type === 'click') {
      hoverTarget = outlined;
      void api?.runtime.sendMessage(HOVER_MESSAGE)?.catch?.(() => {});
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    contextTarget = e.target instanceof Element ? e.target : null;
  };

  const listeners: [string, EventListener][] = [
    ['mousemove', onMove as EventListener],
    ['keydown', onKey as EventListener],
    ['keyup', onKey as EventListener],
    ['contextmenu', onContextMenu as EventListener],
    ['blur', clear],
    ...PRESS_EVENTS.map((type): [string, EventListener] => [type, onPress as EventListener]),
  ];
  for (const [type, fn] of listeners) win.addEventListener(type, fn, true);
  slots[BRIDGE_KEY] = {
    contextTarget() {
      const el = take(contextTarget);
      contextTarget = null;
      return el;
    },
    hoverTarget() {
      const el = take(hoverTarget);
      hoverTarget = null;
      return el;
    },
  };
  return () => {
    clear();
    for (const [type, fn] of listeners) win.removeEventListener(type, fn, true);
    delete slots[BRIDGE_KEY];
  };
}

if (typeof window !== 'undefined' && ext()) installContent(globalThis, window, ext());
