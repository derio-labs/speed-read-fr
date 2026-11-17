// The built VS Code webview outside VS Code, for the browser-level test and the visual capture: the
// page the extension writes (same HTML, same CSP, with the server's origin as `webview.cspSource`),
// a stub `acquireVsCodeApi` recording posted messages, and VS Code's theme variables and body class.
import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEBVIEW_PATH = '/__webview__/index.html';

/** Colours VS Code injects for its default Dark Modern and Light Modern themes. */
export const THEMES = {
  dark: {
    class: 'vscode-dark',
    vars: {
      'editor-background': '#1f1f1f',
      'editor-foreground': '#cccccc',
      'sideBar-background': '#181818',
      'editorWidget-background': '#202020',
      'descriptionForeground': '#9d9d9d',
      'disabledForeground': '#cccccc80',
      'panel-border': '#2b2b2b',
      'widget-border': '#313131',
      'editorError-foreground': '#f85149',
      'progressBar-background': '#0078d4',
      'editor-inactiveSelectionBackground': '#3a3d41',
      'focusBorder': '#0078d4',
      'textCodeBlock-background': '#2b2b2b',
      'textLink-foreground': '#4daafc',
      'textBlockQuote-border': '#616161',
      'font-family': 'system-ui, "Ubuntu", "Droid Sans", sans-serif',
      'editor-font-family': '"Droid Sans Mono", "monospace", monospace',
    },
  },
  light: {
    class: 'vscode-light',
    vars: {
      'editor-background': '#ffffff',
      'editor-foreground': '#3b3b3b',
      'sideBar-background': '#f8f8f8',
      'editorWidget-background': '#f8f8f8',
      'descriptionForeground': '#3b3b3b',
      'disabledForeground': '#61616180',
      'panel-border': '#e5e5e5',
      'widget-border': '#e5e5e5',
      'editorError-foreground': '#f85149',
      'progressBar-background': '#005fb8',
      'editor-inactiveSelectionBackground': '#e5ebf1',
      'focusBorder': '#005fb8',
      'textCodeBlock-background': '#f8f8f8',
      'textLink-foreground': '#005fb8',
      'textBlockQuote-border': '#e5e5e5',
      'font-family': 'system-ui, "Ubuntu", "Droid Sans", sans-serif',
      'editor-font-family': '"Droid Sans Mono", "monospace", monospace',
    },
  },
};

let htmlModule;
/** The extension's own `webviewHtml` (src/html.ts), transpiled on the fly. */
async function loadHtmlModule() {
  if (!htmlModule) {
    const source = await readFile(path.join(root, 'packages/vscode-extension/src/html.ts'), 'utf8');
    const { code } = await transform(source, { loader: 'ts', format: 'esm' });
    htmlModule = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  }
  return htmlModule;
}

/** The page the extension would write, with `origin` standing in for `webview.cspSource`. */
export async function webviewPage(origin) {
  const { webviewHtml, createNonce } = await loadHtmlModule();
  return webviewHtml({
    cspSource: origin,
    nonce: createNonce(),
    scriptUri: `${origin}/packages/vscode-extension/dist/webview.js`,
    katexCssUri: `${origin}/packages/vscode-extension/media/katex/katex.min.css`,
  });
}

/**
 * Open the webview page in `page`: served under the extension's CSP, with the stub API
 * (`window.__posted`), CSP violations collected in `window.__violations`, and `theme` applied.
 */
export async function openWebview(page, origin, { theme = 'light' } = {}) {
  const html = await webviewPage(origin);
  await page.route(`${origin}${WEBVIEW_PATH}`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.addInitScript((t) => {
    window.__posted = [];
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    window.acquireVsCodeApi = () => ({
      postMessage: (m) => window.__posted.push(JSON.parse(JSON.stringify(m))),
      getState: () => undefined,
      setState: () => {},
    });
    document.addEventListener('DOMContentLoaded', () => {
      for (const [name, value] of Object.entries(t.vars)) document.documentElement.style.setProperty(`--vscode-${name}`, value);
      document.body.classList.add(t.class);
    });
  }, THEMES[theme]);
  await page.goto(`${origin}${WEBVIEW_PATH}`);
  await page.waitForFunction(() => window.__posted.some((m) => m.type === 'ready'));
}

/** Send the extension's read message for `markdown` (the fixture folder is the document folder). */
export async function sendRead(page, origin, { markdown, settings, startLine = 0, endLine, format = 'markdown' }) {
  const message = { type: 'read', markdown, startLine, settings, format, baseUri: `${origin}/tests/fixtures/` };
  if (endLine !== undefined) message.endLine = endLine;
  await page.evaluate((m) => window.postMessage(m, '*'), message);
  await page.locator('.sr-reader').waitFor();
}

export const readFixture = (name) => readFile(path.join(root, 'tests/fixtures', name), 'utf8');
