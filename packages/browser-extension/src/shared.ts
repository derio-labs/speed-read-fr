/**
 * What the background, the always-on content script and the injected reader share. The content
 * script and the reader run in the extension's one isolated world on the page, so the reader asks
 * the content script for its remembered targets through a global, not a message.
 */

/**
 * How the reader is opened: by the toolbar or shortcut (`auto`), a context-menu item (`selection`,
 * `from-here`; `main` when the item was used in a subframe, which the top-frame reader cannot see
 * into), or Alt+click (`from-block`).
 */
export type ReadMode = 'auto' | 'selection' | 'from-here' | 'from-block' | 'main';

export const READ_MODES: readonly ReadMode[] = ['auto', 'selection', 'from-here', 'from-block', 'main'];

/** Background -> reader. */
export interface ReadMessage {
  mode: ReadMode;
}

/** Content script -> background, on an Alt+click on an outlined block. */
export const HOVER_MESSAGE = { type: 'read-from-hover' } as const;

/** Reader -> background, the answer to a ReadMessage: the cause when the reader could not open. */
export type ReadReply = { ok: true } | { ok: false; error: string };

export const isReadMessage = (m: unknown): m is ReadMessage => READ_MODES.includes((m as ReadMessage | null)?.mode as ReadMode);

/** The content script's answers to the reader. Each target is handed out once, and only while in the page. */
export interface ContentBridge {
  /** The element under the last `contextmenu` event. */
  contextTarget(): Element | null;
  /** The block last Alt+clicked. */
  hoverTarget(): Element | null;
}

/**
 * Keys of the shared state in the isolated world's global. Symbols, because an element `id` on the
 * page becomes a named property of `window`, even in the isolated world, and would shadow a string key.
 */
export const BRIDGE_KEY: unique symbol = Symbol.for('speed-read.content-bridge');
export const READER_KEY: unique symbol = Symbol.for('speed-read.reader');

/** An own property of `scope` under `key`, or undefined. */
export const ownValue = (scope: object, key: PropertyKey): unknown =>
  Object.prototype.hasOwnProperty.call(scope, key) ? (scope as Record<PropertyKey, unknown>)[key] : undefined;

export function bridgeOf(scope: object): ContentBridge | undefined {
  const b = ownValue(scope, BRIDGE_KEY) as Partial<ContentBridge> | undefined;
  return b && typeof b.contextTarget === 'function' && typeof b.hoverTarget === 'function' ? (b as ContentBridge) : undefined;
}
