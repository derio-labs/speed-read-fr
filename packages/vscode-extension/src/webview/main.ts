/**
 * The webview reader (spec section 8, R20): render the requested lines of Markdown into an attached
 * container kept out of view, render the Mermaid fences, then extract and mount the core reader with
 * a host that shows clones. Reports the reading position (R21) and settings changes to the extension.
 */
import mermaid from 'mermaid';
import { createCloneHost, extract, mountReader, SETTINGS_NOT_SAVED, type Host, type ReaderHandle, type Settings, type SettingsStore } from '@speed-read/core';
import type { FromWebview, ReadMessage, ToWebview } from '../messages';
import { FIT_CSS, fitExhibit } from './fit';
import { renderDiagrams, renderMarkdown, renderPlain } from './render';

declare function acquireVsCodeApi(): { postMessage(message: FromWebview): void };

const vscode = acquireVsCodeApi();

/** VS Code theme colours onto the reader's custom properties, and styles for the rendered document. */
const WEBVIEW_CSS = `
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
#sr-reader-root {
  position: fixed; inset: 0;
  --speed-read-bg: var(--vscode-editor-background);
  --speed-read-surface: var(--vscode-sideBar-background, var(--vscode-editor-background));
  --speed-read-surface-2: var(--vscode-editorWidget-background);
  --speed-read-text: var(--vscode-editor-foreground);
  --speed-read-muted: var(--vscode-descriptionForeground);
  --speed-read-faint: var(--vscode-disabledForeground);
  --speed-read-border: var(--vscode-panel-border, var(--vscode-widget-border));
  --speed-read-accent: var(--vscode-editorError-foreground);
  --speed-read-progress: var(--vscode-progressBar-background);
  --speed-read-progress-soft: var(--vscode-editor-inactiveSelectionBackground);
  --speed-read-focus: var(--vscode-focusBorder);
  --speed-read-font: var(--vscode-font-family);
  --speed-read-mono: var(--vscode-editor-font-family);
}
body.vscode-dark .sr-reader, body.vscode-high-contrast:not(.vscode-high-contrast-light) .sr-reader { color-scheme: dark; }
body.vscode-light .sr-reader, body.vscode-high-contrast-light .sr-reader { color-scheme: light; }
#sr-render-frame { position: absolute; left: -10000px; top: 0; width: 760px; visibility: hidden; pointer-events: none; }
.sr-md { color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); line-height: 1.6; }
.sr-md pre { margin: 0; padding: 10px 12px; border-radius: 6px; overflow: auto; background: var(--vscode-textCodeBlock-background); font: 13px/1.5 var(--vscode-editor-font-family, ui-monospace, monospace); }
.sr-exhibit-body .sr-md pre, .sr-expanded-body .sr-md pre { padding: 0; background: transparent; }
.sr-md code { font-family: var(--vscode-editor-font-family, ui-monospace, monospace); font-size: .92em; }
.sr-md table { border-collapse: collapse; }
.sr-md th, .sr-md td { border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #8884)); padding: 5px 9px; text-align: left; }
.sr-md th { background: var(--vscode-textCodeBlock-background); }
/* Images and diagrams fit their box; KaTeX's own SVGs (radicals, arrows) keep KaTeX's sizing. */
.sr-md img, .sr-md .mermaid svg { max-width: 100%; height: auto; }
.sr-md .katex-display { margin: .4em 0; overflow-x: auto; overflow-y: hidden; }
.sr-md .katex { font-size: 1.15em; }
.sr-md blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--vscode-textBlockQuote-border, #8888); }
.sr-md a { color: var(--vscode-textLink-foreground); text-decoration: none; }
.sr-stale-notice {
  position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 10;
  display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; border-radius: 6px;
  font: 12px/1.4 var(--vscode-font-family, system-ui, sans-serif);
  color: var(--vscode-notifications-foreground, var(--vscode-editor-foreground));
  background: var(--vscode-notifications-background, var(--vscode-editorWidget-background));
  border: 1px solid var(--vscode-notifications-border, var(--vscode-widget-border, #8884));
  box-shadow: 0 2px 8px rgb(0 0 0 / 25%);
}
.sr-stale-notice[hidden], .sr-stale-notice button[hidden] { display: none; }
.sr-render-error {
  margin: 24px; padding: 12px 14px; border-radius: 6px; font: 13px/1.5 var(--vscode-font-family, system-ui, sans-serif);
  color: var(--vscode-errorForeground, var(--vscode-editor-foreground));
  background: var(--vscode-inputValidation-errorBackground, transparent);
  border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-editorError-foreground, #f85149));
}
.sr-render-error strong { display: block; margin-bottom: 4px; }
.sr-stale-notice button {
  font: inherit; cursor: pointer; padding: 2px 10px; border-radius: 4px; border: 0;
  color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #0078d4);
}
`;

const style = document.createElement('style');
style.textContent = WEBVIEW_CSS + FIT_CSS;
document.head.append(style);

const readerRoot = document.getElementById('sr-reader-root') ?? document.body.appendChild(document.createElement('div'));
readerRoot.id = 'sr-reader-root';
/**
 * The rendered document (`#sr-render`), in a frame that is attached (Mermaid measures text) but
 * kept out of view: absolutely positioned off-screen and `visibility: hidden`.
 */
const renderFrame = document.createElement('div');
renderFrame.id = 'sr-render-frame';
renderFrame.setAttribute('aria-hidden', 'true');
const renderRoot = document.createElement('div');
renderRoot.id = 'sr-render';
/** Where Mermaid measures a diagram: `mermaid.render` empties the container it is given. */
const diagramScratch = document.createElement('div');
renderFrame.append(renderRoot, diagramScratch);
document.body.append(renderFrame);

/**
 * Extract the rendered document. The extractor skips what is not rendered, `visibility: hidden`
 * included, so the off-screen frame is made visible for the synchronous extraction only.
 */
function extractRendered() {
  renderFrame.style.visibility = 'visible';
  try {
    return extract(renderRoot);
  } finally {
    renderFrame.style.visibility = '';
  }
}

const isDark = () => document.body.classList.contains('vscode-dark') || (document.body.classList.contains('vscode-high-contrast') && !document.body.classList.contains('vscode-high-contrast-light'));

/** Shown when the source was edited after this read: its lines no longer match (cursor follow stops). */
const staleNotice = document.createElement('div');
staleNotice.className = 'sr-stale-notice';
staleNotice.setAttribute('role', 'status');
staleNotice.hidden = true;
const STALE_TEXT = 'Document changed';
const staleText = document.createElement('span');
staleText.textContent = STALE_TEXT;
const rereadButton = document.createElement('button');
rereadButton.type = 'button';
rereadButton.textContent = 'Re-read';
staleNotice.append(staleText, rereadButton);
document.body.append(staleNotice);
rereadButton.addEventListener('click', () => vscode.postMessage({ type: 'reread', line: lastLine }));

let handle: ReaderHandle | null = null;
let settings: Settings | null = null;
let generation = 0;
let lastLine: number | null = null;
/** The id of the read on screen: the extension's reload fallback may deliver one read twice. */
let shownRead: number | undefined;
/** The inline error shown when a read fails. */
let renderError: HTMLElement | null = null;

const RENDER_FAILED = 'Speed Read could not render this document';

const store: SettingsStore = {
  async load() {
    return settings ?? {};
  },
  async save(next) {
    settings = next;
    vscode.postMessage({ type: 'settings', settings: next });
  },
};

function close() {
  handle?.destroy();
  handle = null;
  vscode.postMessage({ type: 'close' });
}

/**
 * Read `message`, and on any failure show an inline error in the reader root and report it to the
 * extension (which shows it with `showErrorMessage`): never a blank panel.
 */
async function read(message: ReadMessage) {
  if (message.id !== undefined && message.id === shownRead && (handle || renderError)) return;
  shownRead = message.id;
  const current = generation + 1;
  try {
    await render(message);
  } catch (error) {
    if (current !== generation) return;
    handle?.destroy();
    handle = null;
    const text = error instanceof Error ? error.message : String(error);
    renderError = document.createElement('div');
    renderError.className = 'sr-render-error';
    renderError.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = RENDER_FAILED;
    const detail = document.createElement('span');
    detail.textContent = text;
    renderError.append(title, detail);
    readerRoot.append(renderError);
    vscode.postMessage({ type: 'error', message: text });
  }
}

async function render(message: ReadMessage) {
  const current = ++generation;
  handle?.destroy();
  handle = null;
  renderError?.remove();
  renderError = null;
  lastLine = null;
  staleNotice.hidden = true;
  staleText.textContent = STALE_TEXT;
  rereadButton.hidden = false;
  settings = message.settings;
  const base = message.baseUri;
  const range = { startLine: message.startLine, endLine: message.endLine };
  renderRoot.innerHTML =
    message.format === 'plain'
      ? renderPlain(message.markdown, range)
      : renderMarkdown(message.markdown, { ...range, resolveUri: base ? (src) => new URL(src, base).toString() : undefined });
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default', suppressErrorRendering: true });
  await renderDiagrams(renderRoot, (id, source) => mermaid.render(id, source, diagramScratch));
  if (current !== generation) return;
  const clones = createCloneHost(renderRoot, {
    wrapperClass: 'sr-md',
    onPosition(ref) {
      if (typeof ref.line !== 'number' || ref.line === lastLine) return;
      lastLine = ref.line;
      vscode.postMessage({ type: 'position', line: ref.line });
    },
    onClose: close,
  });
  // Exhibits in the pane are fitted to it; the fitting stops when the core releases the node.
  const fitted = new Map<Node, () => void>();
  const host: Host = {
    ...clones,
    exhibit(block, use) {
      const node = clones.exhibit(block, use);
      if (use === 'pane') fitted.set(node, fitExhibit(node, block.kind));
      return node;
    },
    release(node) {
      fitted.get(node)?.();
      fitted.delete(node);
      clones.release(node);
    },
  };
  // Same reader as the browser dock: fixed chunk box, no sentence line, details above the stage.
  handle = mountReader(readerRoot, extractRendered(), { settings: message.settings, store, host, bottomStage: true });
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message?.type === 'read') void read(message);
  else if (message?.type === 'stale') staleNotice.hidden = false;
  else if (message?.type === 'notice') {
    // The source cannot be re-read: say why, without the Re-read button.
    staleText.textContent = String(message.text);
    rereadButton.hidden = true;
    staleNotice.hidden = false;
  } else if (message?.type === 'save-status') handle?.setStatusNote(message.ok ? null : SETTINGS_NOT_SAVED);
  else if (message?.type === 'settings') {
    if (JSON.stringify(message.settings) === JSON.stringify(settings)) return;
    settings = message.settings;
    handle?.applySettings(message.settings);
  }
});

vscode.postMessage({ type: 'ready' });
