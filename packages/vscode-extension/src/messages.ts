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

export type ToWebview = ReadMessage | SettingsMessage;

/** Webview -> extension. */
export type FromWebview =
  | { type: 'ready' }
  | { type: 'position'; line: number }
  | { type: 'settings'; settings: Settings }
  | { type: 'close' };
