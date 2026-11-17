// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { extract } from '@speed-read/core';
import { renderDiagrams, renderMarkdown, renderPlain } from './render';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root')!;
});

const render = (md: string, opts: Parameters<typeof renderMarkdown>[1] = {}) => {
  root.innerHTML = renderMarkdown(md, opts);
  return root;
};
const lineOf = (selector: string) => root.querySelector(selector)?.getAttribute('data-line');

const DOC = [
  '# Title', //                     0
  '', //                            1
  'A paragraph with $x^2$ inline.', // 2
  '', //                            3
  '- one', //                       4
  '- two', //                       5
  '', //                            6
  '> quoted', //                    7
  '', //                            8
  '| a | b |', //                   9
  '|---|---|', //                  10
  '| 1 | 2 |', //                  11
  '', //                           12
  '```js', //                      13
  'let x = 1;', //                 14
  '```', //                        15
  '', //                           16
  '$$', //                         17
  'E = mc^2', //                   18
  '$$', //                         19
  '', //                           20
  '## Second', //                  21
  'Bracket \\(a+b\\) inline.', //  22
  '', //                           23
  '\\[', //                        24
  '\\int_0^1 x\\,dx', //           25
  '\\]', //                        26
].join('\n');

describe('renderMarkdown', () => {
  it('shows raw HTML as text (html: false) and does not linkify bare URLs', () => {
    render('Hi <img src=x onerror="alert(1)"> and https://example.com here');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(root.querySelector('a')).toBeNull();
  });

  it('puts the source line on every paragraph, heading, list item, blockquote and table', () => {
    render(DOC);
    expect(lineOf('h1')).toBe('0');
    expect(lineOf('p')).toBe('2');
    expect([...root.querySelectorAll('li')].map((li) => li.getAttribute('data-line'))).toEqual(['4', '5']);
    expect(lineOf('blockquote')).toBe('7');
    expect(lineOf('blockquote p')).toBe('7');
    expect(lineOf('table')).toBe('9');
    expect(lineOf('h2')).toBe('21');
  });

  it('keeps original line numbers when a sub-range is rendered', () => {
    render(DOC, { startLine: 21, endLine: 26 });
    expect(root.querySelector('h1')).toBeNull();
    expect(lineOf('h2')).toBe('21');
    expect(lineOf('p')).toBe('22');
    expect(root.querySelector('.katex-display')?.closest('[data-line]')?.getAttribute('data-line')).toBe('24');
    render(DOC, { startLine: 4, endLine: 5 });
    expect([...root.querySelectorAll('li')].map((li) => li.getAttribute('data-line'))).toEqual(['4', '5']);
    render(DOC, { startLine: 21 });
    expect(lineOf('h2')).toBe('21');
  });

  it('wraps fences and display math in an element carrying data-line', () => {
    render(DOC);
    const pre = root.querySelector('pre')!;
    expect(pre.parentElement?.getAttribute('data-line')).toBe('13');
    expect(pre.querySelector('code')?.className).toBe('language-js');
    const displays = [...root.querySelectorAll('.katex-display')];
    expect(displays).toHaveLength(2);
    expect(displays.map((d) => d.closest('[data-line]')?.getAttribute('data-line'))).toEqual(['17', '24']);
    expect(displays.every((d) => d.closest('p') === null)).toBe(true);
  });

  it('typesets both delimiter families with KaTeX, inline and display', () => {
    render(DOC);
    const inline = [...root.querySelectorAll('p .katex')];
    expect(inline).toHaveLength(2);
    const tex = (el: Element) => el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    expect(inline.map(tex)).toEqual(['x^2', 'a+b']);
    expect([...root.querySelectorAll('.katex-display')].map(tex)).toEqual(['E = mc^2', '\\int_0^1 x\\,dx']);
    expect(root.textContent).not.toContain('$$');
    expect(root.textContent).not.toContain('\\(');
  });

  it('turns a mermaid fence into a pending diagram placeholder that is still a code block', () => {
    render(['text', '', '```mermaid', 'flowchart LR', '  A --> B', '```'].join('\n'));
    const pending = root.querySelector('[data-mermaid="pending"]')!;
    expect(pending.getAttribute('data-line')).toBe('2');
    expect(pending.querySelector('pre code.language-mermaid')?.textContent).toBe('flowchart LR\n  A --> B\n');
  });

  it('shows an http(s) image as a local placeholder with its alt text', () => {
    render('![A remote chart](https://example.com/chart.png) and ![b](//cdn.example.com/x.png)');
    const imgs = [...root.querySelectorAll('img')];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
      expect(img.classList.contains('sr-remote-image')).toBe(true);
    }
    expect(imgs[0].getAttribute('alt')).toBe('A remote chart');
    expect(decodeURIComponent(imgs[0].getAttribute('src')!)).toContain('A remote chart');
    expect(root.innerHTML).not.toContain('https://example.com/chart.png"');
  });

  it('resolves a relative image through resolveUri and escapes alt text in the placeholder', () => {
    render('![local](img/a.png) ![<b>&"](http://x/y.png)', { resolveUri: (src) => `https://webview.test/doc/${src}` });
    const [local, remote] = [...root.querySelectorAll('img')];
    expect(local.getAttribute('src')).toBe('https://webview.test/doc/img/a.png');
    expect(remote.getAttribute('alt')).toBe('<b>&"');
    expect(decodeURIComponent(remote.getAttribute('src')!)).toContain('&lt;b&gt;&amp;&quot;');
  });

  it('renders links as inert text', () => {
    render('see [the docs](https://example.com/docs) now');
    const a = root.querySelector('a')!;
    expect(a.hasAttribute('href')).toBe(false);
    expect(a.textContent).toBe('the docs');
  });

  it('extracts to blocks whose sources carry the original lines', () => {
    render(DOC);
    const doc = extract(root);
    const blocks = doc.sections.flatMap((s) => s.blocks.map((b) => [b.kind, b.source.line]));
    expect(blocks).toEqual([
      ['prose', 2],
      ['list', 4],
      ['prose', 7],
      ['table', 9],
      ['code', 13],
      ['math', 17],
      ['prose', 22],
      ['math', 24],
    ]);
  });
});

describe('renderPlain', () => {
  it('makes one paragraph per blank-line-separated run, with its first line, as text', () => {
    root.innerHTML = renderPlain('one\ntwo\n\n# three <b>\n\n\nfour', {});
    expect([...root.querySelectorAll('p')].map((p) => [p.getAttribute('data-line'), p.textContent])).toEqual([
      ['0', 'one\ntwo'],
      ['3', '# three <b>'],
      ['6', 'four'],
    ]);
    root.innerHTML = renderPlain('one\ntwo\n\nthree\nfour', { startLine: 1, endLine: 3 });
    expect([...root.querySelectorAll('p')].map((p) => [p.getAttribute('data-line'), p.textContent])).toEqual([
      ['1', 'two'],
      ['3', 'three'],
    ]);
  });
});

describe('renderDiagrams', () => {
  const MD = ['```mermaid', 'flowchart LR', 'A --> B', '```', '', '```mermaid', 'not a diagram', '```'].join('\n');

  it('renders each pending fence, keeps a failing one as code, and resolves after all settle', async () => {
    render(MD);
    const ids: string[] = [];
    await renderDiagrams(root, async (id, source) => {
      ids.push(id);
      await new Promise((r) => setTimeout(r, 5));
      if (source.startsWith('not')) throw new Error('parse error');
      return { svg: `<svg id="${id}" viewBox="0 0 10 10"><text>${source.trim()}</text></svg>` };
    });
    expect(new Set(ids).size).toBe(2);
    const [ok, bad] = [...root.querySelectorAll('[data-line]')];
    expect(ok.classList.contains('mermaid')).toBe(true);
    expect(ok.querySelector('svg')?.id).toBe(ids[0]);
    expect(ok.getAttribute('data-mermaid')).toBe('rendered');
    expect(bad.querySelector('svg')).toBeNull();
    expect(bad.querySelector('pre code.language-mermaid')).not.toBeNull();
    expect(bad.getAttribute('data-mermaid')).toBe('failed');
    expect(extract(root).sections[0].blocks.map((b) => [b.kind, b.source.line])).toEqual([
      ['diagram', 0],
      ['code', 5],
    ]);
  });
});
