/**
 * Markdown to HTML for the webview reader (spec section 8, R20): markdown-it with raw HTML shown as
 * text, KaTeX math for dollar and bracket delimiters, Mermaid fences left as pending diagrams,
 * every block tagged with its original source line. The output is markdown-it's escaped HTML.
 */
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import type { RenderRule } from 'markdown-it/lib/renderer.mjs';

export interface RenderOptions {
  /** First source line to render (zero-based, default 0); rendered blocks keep their original lines. */
  startLine?: number;
  /** Last source line to render, inclusive; none renders to the end. */
  endLine?: number;
  /** Maps a relative image path to a loadable URI (the document folder through `asWebviewUri`). */
  resolveUri?: (src: string) => string;
}

interface Env {
  lineOffset: number;
  resolveUri?: (src: string) => string;
}

/** Tokens rendered whole (no opening/closing pair), wrapped in an element carrying `data-line`. */
const WRAPPED = ['fence', 'code_block', 'math_block', 'math_block_eqno'];

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const lineOffset = (env: unknown) => (env as Env | undefined)?.lineOffset ?? 0;

/**
 * A local stand-in for an image that is not loaded: remote, a scheme the webview cannot load, or a
 * relative path with no document folder to resolve it against (an untitled document).
 */
function placeholderSrc(alt: string, reason: string): string {
  const label = alt.length > 60 ? `${alt.slice(0, 57)}…` : alt;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="72" viewBox="0 0 360 72">' +
    '<rect x="1" y="1" width="358" height="70" rx="8" fill="none" stroke="#8a8a8a" stroke-dasharray="6 4"/>' +
    '<text x="180" y="30" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#8a8a8a">${reason}</text>' +
    `<text x="180" y="52" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#8a8a8a">${escapeHtml(label)}</text>` +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  md.use(texmath, { engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: { throwOnError: false } });

  // The data-line rule: markdown-it writes no source line by itself.
  md.core.ruler.push('sr_data_line', (state) => {
    const offset = lineOffset(state.env);
    for (const token of state.tokens) {
      if (token.block && token.nesting === 1 && token.map) token.attrSet('data-line', String(token.map[0] + offset));
    }
  });

  // Display math as KaTeX's own `.katex-display`, which the extractor recognises (texmath's
  // `<section><eqn>` wrapping would read as prose); an equation number becomes a `\tag`.
  const displayMath: RenderRule = (tokens, idx) => {
    const { content, info, type } = tokens[idx];
    const tex = type === 'math_block_eqno' && info ? `${content}\\tag{${info}}` : content;
    return katex.renderToString(tex, { displayMode: true, throwOnError: false });
  };
  md.renderer.rules.math_block = displayMath;
  md.renderer.rules.math_block_eqno = displayMath;

  for (const name of WRAPPED) {
    const inner = md.renderer.rules[name] as RenderRule;
    md.renderer.rules[name] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const html = inner(tokens, idx, options, env, self);
      if (!token.map) return html;
      const mermaid = name === 'fence' && token.info.trim().split(/\s+/)[0] === 'mermaid' ? ' data-mermaid="pending"' : '';
      return `<div class="sr-block" data-line="${token.map[0] + lineOffset(env)}"${mermaid}>${html}</div>\n`;
    };
  }

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    const alt = self.renderInlineAsText(token.children ?? [], options, env);
    if (/^data:/i.test(src)) return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
    const placeholder = (reason: string) => `<img class="sr-remote-image" src="${placeholderSrc(alt, reason)}" alt="${escapeHtml(alt)}">`;
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return placeholder('Remote image not loaded (offline)');
    const resolve = (env as Env).resolveUri;
    if (!resolve) return placeholder('Image not loaded (unsaved document)');
    return `<img src="${escapeHtml(resolve(src))}" alt="${escapeHtml(alt)}">`;
  };

  // Links are inert: the reader is for reading, and a webview should not navigate.
  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href');
    token.attrs = (token.attrs ?? []).filter(([key]) => key !== 'href');
    if (href && !token.attrGet('title')) token.attrSet('title', href);
    return self.renderToken(tokens, idx, options);
  };
  return md;
}

let renderer: MarkdownIt | null = null;

const sliceLines = (text: string, { startLine = 0, endLine }: RenderOptions) =>
  text.split(/\r?\n/).slice(startLine, endLine === undefined ? undefined : endLine + 1);

/** Render the lines `startLine`..`endLine` of `markdown`, each block tagged with its original line. */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
  renderer ??= createRenderer();
  const env: Env = { lineOffset: options.startLine ?? 0, resolveUri: options.resolveUri };
  return renderer.render(sliceLines(markdown, options).join('\n'), env);
}

/** Plain prose (a non-Markdown file): one paragraph per run of non-blank lines, as text. */
export function renderPlain(text: string, options: RenderOptions = {}): string {
  const lines = sliceLines(text, options);
  const offset = options.startLine ?? 0;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const start = i;
    while (i + 1 < lines.length && lines[i + 1].trim()) i++;
    out.push(`<p data-line="${start + offset}">${escapeHtml(lines.slice(start, i + 1).join('\n'))}</p>`);
  }
  return out.join('\n');
}

export type DiagramRenderer = (id: string, source: string) => Promise<{ svg: string }>;

let diagramCount = 0;

/** How long one Mermaid render may take before its fence stays a code block (l-errors-r6). */
export const DIAGRAM_TIMEOUT_MS = 10_000;
export const DIAGRAM_FAILED = 'Diagram failed to render';

/** The first line of an error's message, for the one-line caption. */
function firstLine(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? '')).trim();
  return text.split(/\r?\n/)[0].trim() || 'unknown error';
}

/**
 * Render every pending Mermaid fence under `root` with `render` (`mermaid.render`), replacing its
 * code with the SVG. A fence that fails, or whose render has not settled after `timeoutMs`, stays a
 * code block under a one-line caption, "Diagram failed to render: <first line of the error>" (read
 * as a short prose line before the code exhibit). Resolves once every diagram has settled or timed out.
 */
export async function renderDiagrams(root: Element, render: DiagramRenderer, { timeoutMs = DIAGRAM_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<void> {
  const pending = Array.from(root.querySelectorAll<HTMLElement>('[data-mermaid="pending"]'));
  await Promise.allSettled(
    pending.map(async (el) => {
      const source = el.querySelector('code')?.textContent ?? '';
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      });
      try {
        const { svg } = await Promise.race([render(`sr-mermaid-${++diagramCount}`, source), timeout]);
        // Mermaid's output with securityLevel 'strict', sanitized by Mermaid itself.
        el.innerHTML = svg;
        el.classList.add('mermaid');
        el.dataset.mermaid = 'rendered';
      } catch (error) {
        el.dataset.mermaid = 'failed';
        const caption = el.ownerDocument.createElement('p');
        caption.className = 'sr-diagram-error';
        const line = el.getAttribute('data-line');
        if (line !== null) caption.setAttribute('data-line', line);
        caption.textContent = `${DIAGRAM_FAILED}: ${firstLine(error)}`;
        el.before(caption);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
