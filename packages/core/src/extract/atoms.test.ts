// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Block, Token } from '../model';
import { extract, extractRange } from './extract';

function root(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${markup}</div>`;
  return document.getElementById('root')!;
}

const tokens = (block: Block): Token[] => (block.kind === 'prose' ? block.sentences.flatMap((s) => s.tokens) : []);

// KaTeX's output for $x^2$: the MathML part carries the TeX annotation, the HTML part repeats the formula.
const KATEX_X2 =
  '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord"><span class="mord mathnormal">x</span><span class="msupsub"><span class="mord">2</span></span></span></span></span></span>';

describe('inline atoms', () => {
  it('makes inline code one atom with its text', () => {
    const d = extract(root('<p>Call <code>foo bar()</code> now.</p>'));
    expect(tokens(d.sections[0].blocks[0])).toEqual([
      { kind: 'word', text: 'Call' },
      { kind: 'atom', atom: 'code', text: 'foo bar()' },
      { kind: 'word', text: 'now.' },
    ]);
  });

  it('uses the TeX annotation of a KaTeX node, never its raw text content', () => {
    const d = extract(root(`<p>Square ${KATEX_X2} here.</p>`));
    const atoms = tokens(d.sections[0].blocks[0]).filter((t) => t.kind === 'atom');
    expect(atoms).toEqual([{ kind: 'atom', atom: 'math', text: 'x^2' }]);
  });

  it('reads mjx-container and math by aria-label, then alttext, then MathML text', () => {
    const d = extract(
      root(
        '<p>a <mjx-container aria-label="y squared"><svg></svg></mjx-container> b <math alttext="\\alpha"><mi>α</mi></math> c <math><mi>z</mi><mo>+</mo><mn>1</mn></math></p>',
      ),
    );
    const atoms = tokens(d.sections[0].blocks[0]).filter((t) => t.kind === 'atom');
    expect(atoms.map((t) => t.text)).toEqual(['y squared', '\\alpha', 'z+1']);
  });

  it('does not treat a display-math block inside a paragraph as an atom', () => {
    const d = extract(root(`<p>before</p><span class="katex-display">${KATEX_X2}</span>`));
    expect(d.sections[0].blocks.map((b) => b.kind)).toEqual(['prose', 'math']);
  });

  it('reads a heading holding math by its source once', () => {
    const d = extract(root(`<h2>About ${KATEX_X2}</h2>`));
    expect(d.sections[0].heading?.text).toBe('About x^2');
  });

  it('counts an atom as one word', () => {
    const d = extract(root('<h1>T</h1><p>run <code>npm ci --silent</code></p>'));
    expect(d.sections[0].words).toBe(2);
  });
});

describe('extractRange', () => {
  it('returns the blocks the range intersects', () => {
    const r = root('<h1>T</h1><p id="a">Alpha one.</p><p id="b">Beta two.</p><pre id="c">x</pre><p id="d">Delta.</p>');
    const range = document.createRange();
    range.setStart(document.getElementById('b')!.firstChild!, 2);
    range.setEnd(document.getElementById('c')!.firstChild!, 1);
    const d = extractRange(range);
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].blocks.map((b) => b.source.element)).toEqual([r.querySelector('#b'), r.querySelector('#c')]);
    expect(d.sections[0].words).toBe(2);
  });

  it('keeps headings the range covers', () => {
    root('<p id="a">Alpha.</p><h2 id="h">Head</h2><p id="b">Beta.</p>');
    const range = document.createRange();
    range.setStartBefore(document.getElementById('a')!);
    range.setEndAfter(document.getElementById('b')!);
    const d = extractRange(range);
    expect(d.sections.map((s) => s.heading?.text)).toEqual([undefined, 'Head']);
  });

  it('turns a range inside one block into one prose block of the selected text', () => {
    const r = root('<p id="p">The quick <b>brown</b> fox jumps.</p>');
    const p = r.querySelector('#p')!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 4);
    range.setEnd(p.lastChild!, 4);
    const d = extractRange(range);
    expect(d.sections).toHaveLength(1);
    const block = d.sections[0].blocks[0];
    expect(d.sections[0].blocks).toHaveLength(1);
    expect(block.kind).toBe('prose');
    expect(block.source.element).toBe(p);
    expect(tokens(block).map((t) => t.text)).toEqual(['quick', 'brown', 'fox']);
  });
});
