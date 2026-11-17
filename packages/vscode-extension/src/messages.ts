import type { Settings } from '@speed-read/core';

/** Extension -> webview: read `markdown` from `startLine` to `endLine` (inclusive; none = end of file). */
export interface ReadMessage {
  type: 'read';
  markdown: string;
  startLine: number;
  endLine?: number;
  settings: Settings;
  /** `plain` for a non-Markdown file: read as plain prose, nothing is rendered as Markdown. */
  format: 'markdown' | 'plain';
  /** The document's folder through `asWebviewUri`, ending in `/`; relative images resolve against it. */
  baseUri?: string;
}

/** Extension -> webview: the `speedRead.*` configuration changed. */
export interface SettingsMessage {
  type: 'settings';
  settings: Settings;
}

/** Extension -> webview: the source was edited after the read; offer to re-read. */
export interface StaleMessage {
  type: 'stale';
}

export type ToWebview = ReadMessage | SettingsMessage | StaleMessage;

/** Webview -> extension. */
export type FromWebview =
  | { type: 'ready' }
  | { type: 'position'; line: number }
  | { type: 'settings'; settings: Settings }
  | { type: 'close' }
  /** Re-read the edited source from the current position (`line`: the last line the webview read). */
  | { type: 'reread'; line: number | null };
