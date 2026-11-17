/**
 * What the background, the always-on content script and the injected reader share. The content
 * script and the reader run in the extension's one isolated world on the page, so the reader asks
 * the content script for its remembered targets through a global, not a message.
 */

/** How the reader is opened: by the toolbar or shortcut, a context-menu item, or Alt+click. */
export type ReadMode = 'auto' | 'selection' | 'from-here' | 'from-block';

export const READ_MODES: readonly ReadMode[] = ['auto', 'selection', 'from-here', 'from-block'];

/** Background -> reader. */
export interface ReadMessage {
  mode: ReadMode;
}

/** Content script -> background, on an Alt+click on an outlined block. */
export const HOVER_MESSAGE = { type: 'read-from-hover' } as const;

export const isReadMessage = (m: unknown): m is ReadMessage => READ_MODES.includes((m as ReadMessage | null)?.mode as ReadMode);

/** The content script's answers to the reader. */
export interface ContentBridge {
  /** The element under the last `contextmenu` event. */
  contextTarget(): Element | null;
  /** The block last Alt+clicked. */
  hoverTarget(): Element | null;
}

export const BRIDGE_KEY = '__speedReadContent';

export const bridgeOf = (scope: object): ContentBridge | undefined => (scope as Record<string, ContentBridge | undefined>)[BRIDGE_KEY];
