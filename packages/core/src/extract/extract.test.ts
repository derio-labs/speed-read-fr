// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Block, Doc, Section } from '../model';
import { extract } from './extract';

function html(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${markup}</div>`;
  return document.getElementById('root')!;
}

const words = (block: Block | undefined): string => {
  if (!block) return '';
  if (block.kind === 'prose') return block.sentences.map((s) => s.tokens.map((t) => t.text).join(' ')).join(' | ');
  if (block.kind === 'list') return block.items.map((it) => it.sentences.flatMap((s) => s.tokens.map((t) => t.text)).join(' ')).join(' / ');
  return block.kind;
};

const kinds = (section: Section) => section.blocks.map((b) => b.kind);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sections', () => {
  it('splits at h1-h6 and keeps content before the first heading as an untitled section', () => {
    const d = extract(html('<p>Intro text.</p><h1>Title</h1><p>One.</p><h3>Deep</h3><p>Two.</p>'));
    expect(d.sections).toHaveLength(3);
    expect(d.sections[0].heading).toBeUndefined();
    expect(words(d.sections[0].blocks[0])).toBe('Intro text.');
    expect(d.sections[1].heading).toMatchObject({ level: 1, text: 'Title' });
    expect(d.sections[2].heading).toMatchObject({ level: 3, text: 'Deep' });
    expect(new Set(d.sections.map((s) => s.id)).size).toBe(3);
  });

  it('has no untitled section when the document starts with a heading', () => {
    const d = extract(html('<h2>Start</h2><p>Body.</p>'));
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].heading?.level).toBe(2);
  });

  it('treats [role=heading][aria-level] as a heading', () => {
    const d = extract(html('<p>a b</p><div role="heading" aria-level="2">Aria   title</div><p>c</p>'));
    expect(d.sections[1].heading).toMatchObject({ level: 2, text: 'Aria title' });
  });

  it('gives each heading its own source with the element and data-line', () => {
    const root = html('<h1 data-line="4">A</h1><h2>B</h2>');
    const d = extract(root);
    expect(d.sections[0].heading?.source).toEqual({ element: root.querySelector('h1'), line: 4 });
    expect(d.sections[1].heading?.source.element).toBe(root.querySelector('h2'));
    expect(d.sections[1].heading?.source.line).toBeUndefined();
  });

  it('counts the words of prose and list items in Section.words', () => {
    const d = extract(html('<h1>T</h1><p>one two three</p><ul><li>four five</li></ul><pre>not counted</pre>'));
    expect(d.sections[0].words).toBe(5);
  });

  it('accepts several roots in order', () => {
    document.body.innerHTML = '<div id="a"><p>first</p></div><div id="b"><h1>H</h1><p>second</p></div>';
    const d = extract([document.getElementById('a')!, document.getElementById('b')!]);
    expect(d.sections.map((s) => s.blocks.map(words))).toEqual([['first'], ['second']]);
  });
});

describe('prose', () => {
  it('turns p and inline-only leaf blocks into prose, joining inline elements without adding spaces', () => {
    const d = extract(html('<p>Hello <b>wor</b>ld. Next one.</p><div>Leaf <em>div</em> text</div>'));
    expect(kinds(d.sections[0])).toEqual(['prose', 'prose']);
    expect(words(d.sections[0].blocks[0])).toBe('Hello world. | Next one.');
    expect(words(d.sections[0].blocks[1])).toBe('Leaf div text');
  });

  it('walks into blockquote, div, section, article and details', () => {
    const d = extract(
      html(
        '<blockquote><p>q</p></blockquote><div><p>d</p></div><section><p>s</p></section><article><p>a</p></article><details><summary>sum</summary><p>det</p></details>',
      ),
    );
    expect(d.sections[0].blocks.map(words)).toEqual(['q', 'd', 's', 'a', 'sum', 'det']);
  });

  it('collects loose inline text between blocks as prose', () => {
    const d = extract(html('<div>before<p>para</p>after</div>'));
    expect(d.sections[0].blocks.map(words)).toEqual(['before', 'para', 'after']);
  });

  it('treats br as a word break and skips empty blocks', () => {
    const d = extract(html('<p>one<br>two</p><p>   </p>'));
    expect(d.sections[0].blocks.map(words)).toEqual(['one two']);
  });

  it('copies data-line into source.line', () => {
    const root = html('<p data-line="12">x</p>');
    expect(extract(root).sections[0].blocks[0].source).toEqual({ element: root.querySelector('p'), line: 12 });
  });
});

describe('lists', () => {
  it('turns ul/ol into one list block with nested items at depth + 1 and index/of per own list', () => {
    const root = html(
      '<ol data-line="1"><li data-line="1">first item</li><li>second<ul><li>nested a</li><li>nested b</li><li>nested c</li></ul></li></ol>',
    );
    const d = extract(root);
    expect(d.sections[0].blocks).toHaveLength(1);
    const list = d.sections[0].blocks[0];
    if (list.kind !== 'list') throw new Error('expected list');
    expect(list.ordered).toBe(true);
    expect(list.source.element).toBe(root.querySelector('ol'));
    expect(list.items.map((it) => [it.depth, it.index, it.of])).toEqual([
      [0, 1, 2],
      [0, 2, 2],
      [1, 1, 3],
      [1, 2, 3],
      [1, 3, 3],
    ]);
    expect(words(list)).toBe('first item / second / nested a / nested b / nested c');
    expect(list.items[0].source).toEqual({ element: root.querySelector('li'), line: 1 });
  });

  it('reads paragraphs inside a list item as the item text and emits exhibits in an item after the list', () => {
    const d = extract(html('<ul><li><p>Loose one.</p><p>More.</p></li><li>two<pre>code</pre></li></ul>'));
    expect(kinds(d.sections[0])).toEqual(['list', 'code']);
    expect(words(d.sections[0].blocks[0])).toBe('Loose one. More. / two');
  });
});

describe('exhibits', () => {
  it('turns pre into code with lines and language', () => {
    const d = extract(html('<pre><code class="language-ts">a\nb\nc\n</code></pre><pre class="language-py">x</pre>'));
    expect(d.sections[0].blocks).toMatchObject([
      { kind: 'code', meta: { lines: 3, language: 'ts' } },
      { kind: 'code', meta: { lines: 1, language: 'py' } },
    ]);
  });

  it('turns table into a table with rows and cols', () => {
    const d = extract(
      html('<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody></table>'),
    );
    expect(d.sections[0].blocks).toMatchObject([{ kind: 'table', meta: { rows: 3, cols: 3 } }]);
  });

  it('recognises display math', () => {
    const d = extract(
      html(
        '<span class="katex-display"><span class="katex">x</span></span><mjx-container display="true">y</mjx-container><math display="block"><mi>z</mi></math>',
      ),
    );
    expect(kinds(d.sections[0])).toEqual(['math', 'math', 'math']);
  });

  it('recognises diagrams: .mermaid with svg, block-level svg, canvas', () => {
    const d = extract(html('<div class="mermaid"><svg></svg></div><svg></svg><canvas></canvas>'));
    expect(kinds(d.sections[0])).toEqual(['diagram', 'diagram', 'diagram']);
  });

  it('treats a block-level custom element with a shadow root as a diagram', () => {
    const root = html('<x-chart></x-chart>');
    root.querySelector('x-chart')!.attachShadow({ mode: 'open' });
    expect(kinds(extract(root).sections[0])).toEqual(['diagram']);
  });

  it('keeps an unrendered mermaid fence as code', () => {
    const d = extract(html('<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>'));
    expect(d.sections[0].blocks).toMatchObject([{ kind: 'code', meta: { language: 'mermaid' } }]);
  });

  it('recognises img, picture and figure with an image, keeping alt', () => {
    const d = extract(
      html(
        '<img alt="cat" src="data:,"><picture><img alt="dog" src="data:,"></picture><figure><img alt="bird" src="data:,"><figcaption>cap</figcaption></figure>',
      ),
    );
    expect(d.sections[0].blocks).toMatchObject([
      { kind: 'image', meta: { alt: 'cat' } },
      { kind: 'image', meta: { alt: 'dog' } },
      { kind: 'image', meta: { alt: 'bird' } },
    ]);
  });

  it('gives a figure holding a table or code that type', () => {
    const d = extract(html('<figure><table><tr><td>1</td></tr></table></figure><figure><pre>a\nb</pre></figure>'));
    expect(d.sections[0].blocks).toMatchObject([
      { kind: 'table', meta: { rows: 1, cols: 1 } },
      { kind: 'code', meta: { lines: 2 } },
    ]);
  });

  it('splits a paragraph around an image it holds', () => {
    const d = extract(html('<p>before <img alt="i" src="data:,"> after</p>'));
    expect(kinds(d.sections[0])).toEqual(['prose', 'image', 'prose']);
  });
});

describe('skipped content', () => {
  it('skips hidden and aria-hidden blocks and elements hidden by style', () => {
    const d = extract(
      html(
        '<p hidden>h</p><p aria-hidden="true">a</p><p style="display:none">d</p><p style="visibility:hidden">v</p><div aria-hidden="true"><p>deep</p></div><p>kept</p>',
      ),
    );
    expect(d.sections[0].blocks.map(words)).toEqual(['kept']);
  });

  it('skips script, style, nav, aside, button, form, noscript, template, iframe, video, audio, object and embed', () => {
    const skipped = ['script', 'style', 'nav', 'aside', 'button', 'form', 'noscript', 'template', 'iframe', 'video', 'audio', 'object'];
    const d = extract(html(`${skipped.map((t) => `<${t}>x${t}</${t}>`).join('')}<embed><p>kept</p><p>in <button>btn</button>line</p>`));
    expect(d.sections[0].blocks.map(words)).toEqual(['kept', 'in line']);
  });

  it('skips headings inside skipped containers', () => {
    const d = extract(html('<nav><h2>Menu</h2></nav><p>body</p>'));
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].heading).toBeUndefined();
  });
});

describe('an empty root', () => {
  it('yields no sections', () => {
    const d: Doc = extract(html(''));
    expect(d.sections).toEqual([]);
  });
});
