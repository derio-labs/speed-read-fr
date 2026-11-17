/**
 * The webview document and its Content-Security-Policy (spec section 8). Pure, no `vscode`
 * import, so the browser-level test serves the very same page.
 */

export interface WebviewHtmlOptions {
  /** `webview.cspSource`. */
  cspSource: string;
  nonce: string;
  /** The webview bundle, `dist/webview.js`, as a webview URI. */
  scriptUri: string;
  /** KaTeX's stylesheet, `media/katex/katex.min.css`, as a webview URI. */
  katexCssUri: string;
}

/** The exact CSP of spec section 8: no remote source, scripts by nonce only. */
export const webviewCsp = (cspSource: string, nonce: string) =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src ${cspSource} data:`;

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function webviewHtml({ cspSource, nonce, scriptUri, katexCssUri }: WebviewHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${attr(webviewCsp(cspSource, nonce))}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${attr(katexCssUri)}">
<title>Speed Read</title>
</head>
<body>
<div id="sr-reader-root"></div>
<script nonce="${attr(nonce)}" src="${attr(scriptUri)}"></script>
</body>
</html>`;
}

/** A nonce of 32 characters from [A-Za-z0-9], from the platform's CSPRNG. */
export function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
