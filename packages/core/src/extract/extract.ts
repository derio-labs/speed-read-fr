import type { Block, Doc, ExhibitMeta, ListItem, Section, Sentence, SourceRef, Token } from '../model';
import { splitSentences, tokenize } from '../text/sentences';

export interface ExtractOptions {
  /** Prefix of the generated section ids (default `s`). */
  idPrefix?: string;
}

const SKIPPED = new Set([
  'script',
  'style',
  'nav',
  'aside',
  'button',
  'form',
  'noscript',
  'template',
  'iframe',
  'video',
  'audio',
  'object',
  'embed',
  'head',
  'link',
  'meta',
  'input',
  'select',
  'textarea',
]);

/** Elements that break an inline run: everything else is inline content. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'blockquote',
  'body',
  'canvas',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'img',
  'li',
  'main',
  'ol',
  'p',
  'picture',
  'pre',
  'section',
  'summary',
  'svg',
  'table',
  'ul',
]);

const HEADING = /^h([1-6])$/;
const DISPLAY_MATH = '.katex-display, mjx-container[display="true"], math[display="block"]';

const tag = (el: Element) => el.localName.toLowerCase();

function headingLevel(el: Element): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const m = HEADING.exec(tag(el));
  if (m) return Number(m[1]) as 1 | 2 | 3 | 4 | 5 | 6;
  if (el.getAttribute('role') === 'heading') {
    const level = Number.parseInt(el.getAttribute('aria-level') ?? '', 10);
    if (Number.isInteger(level)) return Math.min(6, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return null;
}

const isDisplayMath = (el: Element) => el.matches(DISPLAY_MATH);
const isCustomWithShadow = (el: Element) => el.localName.includes('-') && !!el.shadowRoot && !el.matches('mjx-container');
const isDiagram = (el: Element) =>
  (el.classList.contains('mermaid') && !!el.querySelector('svg')) || tag(el) === 'svg' || tag(el) === 'canvas' || isCustomWithShadow(el);
const isImage = (el: Element) => tag(el) === 'img' || tag(el) === 'picture';

function isBlockElement(el: Element): boolean {
  return BLOCK_TAGS.has(tag(el)) || headingLevel(el) !== null || isDisplayMath(el) || isDiagram(el);
}

/** Not rendered, judged by attributes and, where a window is available, the computed style. */
function isHidden(el: Element, blockLevel: boolean): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (blockLevel && el.getAttribute('aria-hidden') === 'true') return true;
  const view = el.ownerDocument?.defaultView;
  let style: { display?: string; visibility?: string } | undefined = (el as Partial<HTMLElement>).style;
  if (view && typeof view.getComputedStyle === 'function') {
    try {
      style = view.getComputedStyle(el);
    } catch {
      // Some DOM implementations cannot compute a style for every element (jsdom and MathML): keep the attributes.
    }
  }
  return style?.display === 'none' || style?.visibility === 'hidden';
}

const isSkipped = (el: Element, blockLevel: boolean) => SKIPPED.has(tag(el)) || isHidden(el, blockLevel);

/**
 * Source of a bare prose run between blocks: the parent container (the core never wraps or mutates
 * page text, so several runs can share it) with the line of the nearest `data-line` ancestor.
 */
function runSource(el: Element): SourceRef {
  const line = Number.parseInt(el.closest('[data-line]')?.getAttribute('data-line') ?? '', 10);
  return Number.isInteger(line) ? { element: el, line } : { element: el };
}

function sourceOf(el: Element): SourceRef {
  const line = Number.parseInt(el.getAttribute('data-line') ?? '', 10);
  return Number.isInteger(line) ? { element: el, line } : { element: el };
}

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** Builds a token stream from inline content: text is gathered so a word may span inline elements. */
class InlineText {
  tokens: Token[] = [];
  private text = '';

  addText(text: string) {
    this.text += text;
  }

  addBreak() {
    this.text += ' ';
  }

  addAtom(atom: 'code' | 'math', text: string) {
    const value = collapse(text);
    if (!value) return;
    this.flush();
    this.tokens.push({ kind: 'atom', atom, text: value });
  }

  flush() {
    this.tokens.push(...tokenize(this.text));
    this.text = '';
  }

  sentences(): Sentence[] {
    this.flush();
    return splitSentences(this.tokens);
  }
}

/** Gather the inline content of `node`'s children into `out`. */
function gatherInline(node: Node, out: InlineText, onBlock?: BlockFilter) {
  for (const child of Array.from(node.childNodes)) gatherNode(child, out, onBlock);
}

/** Returns true when it took a block-level element out of the inline flow. */
type BlockFilter = (el: Element) => boolean;

function gatherNode(node: Node, out: InlineText, onBlock?: BlockFilter) {
  if (node.nodeType === 3) return out.addText(node.nodeValue ?? '');
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const block = isBlockElement(el);
  if ((onBlock && block && onBlock(el)) || isSkipped(el, false)) return;
  if (tag(el) === 'br') return out.addBreak();
  if (atomOf(el, out)) return;
  if (block) out.addBreak();
  gatherInline(el, out, onBlock);
  if (block) out.addBreak();
}

const INLINE_MATH = '.katex, mjx-container, math';
const TEX = 'annotation[encoding="application/x-tex"]';

/** The text of an inline math node: its TeX source, else aria-label or alttext, else its MathML text only. */
function mathText(el: Element): string {
  const tex = el.querySelector(TEX)?.textContent;
  if (tex?.trim()) return tex;
  const label = el.getAttribute('aria-label') ?? el.getAttribute('alttext') ?? el.querySelector('math')?.getAttribute('alttext');
  if (label?.trim()) return label;
  const mathml = tag(el) === 'math' ? el : el.querySelector('math');
  if (!mathml) return '';
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) parts.push(n.nodeValue ?? '');
    else if (n.nodeType === 1 && tag(n as Element) !== 'annotation' && tag(n as Element) !== 'annotation-xml')
      n.childNodes.forEach(walk);
  };
  walk(mathml);
  return parts.join('');
}

/** Adds an inline atom for `el` when it is one (inline code or inline math); returns whether it did. */
function atomOf(el: Element, out: InlineText): boolean {
  if (tag(el) === 'code') {
    out.addAtom('code', el.textContent ?? '');
    return true;
  }
  if (el.matches(INLINE_MATH)) {
    out.addAtom('math', mathText(el));
    return true;
  }
  return false;
}

/** A heading's text, read like inline content so math shows its source once. */
function headingText(el: Element): string {
  const text = new InlineText();
  gatherInline(el, text);
  text.flush();
  return text.tokens.map((t) => t.text).join(' ');
}

const hasBlockChild = (el: Element) => Array.from(el.children).some((c) => isBlockElement(c) && !isSkipped(c, true));

function codeMeta(pre: Element): ExhibitMeta {
  const text = (pre.textContent ?? '').replace(/\n$/u, '');
  const meta: ExhibitMeta = { lines: text.length === 0 ? 0 : text.split('\n').length };
  const classes = [...Array.from(pre.classList), ...Array.from(pre.querySelector('code')?.classList ?? [])];
  const language = classes.find((c) => c.startsWith('language-'));
  if (language) meta.language = language.slice('language-'.length);
  return meta;
}

function tableMeta(table: Element): ExhibitMeta {
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  const cols = rows.reduce((n, tr) => Math.max(n, Array.from(tr.children).filter((c) => /^t[dh]$/.test(tag(c))).length), 0);
  return { rows: rows.length, cols };
}

function imageMeta(el: Element): ExhibitMeta {
  const img = tag(el) === 'img' ? el : el.querySelector('img');
  const alt = img?.getAttribute('alt');
  return alt ? { alt } : {};
}

/** Walks a DOM subtree and fills sections. */
class Extractor {
  readonly sections: Section[] = [];
  private current: Section;
  private nextId = 0;

  constructor(private readonly idPrefix: string) {
    this.current = this.newSection();
  }

  private newSection(heading?: Section['heading']): Section {
    const section: Section = { id: `${this.idPrefix}${this.nextId++}`, blocks: [], words: 0 };
    if (heading) section.heading = heading;
    return section;
  }

  private push(block: Block) {
    this.current.blocks.push(block);
    this.current.words += blockWords(block);
  }

  private closeSection() {
    if (this.current.heading || this.current.blocks.length > 0) this.sections.push(this.current);
  }

  finish(): Doc {
    this.closeSection();
    return { sections: this.sections };
  }

  prose(sentences: Sentence[], source: SourceRef) {
    if (sentences.length > 0) this.push({ kind: 'prose', sentences, source });
  }

  /** Handle one element at block level. */
  block(el: Element): void {
    if (isSkipped(el, true)) return;
    const level = headingLevel(el);
    if (level !== null) {
      this.closeSection();
      this.current = this.newSection({ level, text: headingText(el), source: sourceOf(el) });
      return;
    }
    const exhibit = exhibitOf(el);
    if (exhibit) return this.push(exhibit);
    const t = tag(el);
    if (t === 'ul' || t === 'ol') return this.list(el);
    if (t === 'figure') {
      const inner = el.querySelector('table, pre, img, picture');
      if (inner) return this.block(inner);
    }
    if (t === 'hr') return;
    this.walk(el);
  }

  /** Walk an element's children: block children are handled in turn, inline runs between them become prose. */
  walk(el: Element): void {
    if (!hasBlockChild(el)) {
      const text = new InlineText();
      gatherInline(el, text);
      return this.prose(text.sentences(), sourceOf(el));
    }
    let run = new InlineText();
    const flushRun = () => {
      this.prose(run.sentences(), runSource(el));
      run = new InlineText();
    };
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1 && isBlockElement(child as Element)) {
        flushRun();
        this.block(child as Element);
      } else {
        gatherNode(child, run);
      }
    }
    flushRun();
  }

  private list(el: Element): void {
    const items: ListItem[] = [];
    const trailing: Element[] = [];
    collectItems(el, 0, items, trailing);
    if (items.length > 0) this.push({ kind: 'list', ordered: tag(el) === 'ol', items, source: sourceOf(el) });
    for (const t of trailing) this.block(t);
  }
}

function exhibitOf(el: Element): Block | null {
  const t = tag(el);
  const source = sourceOf(el);
  if (t === 'pre') return { kind: 'code', meta: codeMeta(el), source };
  if (t === 'table') return { kind: 'table', meta: tableMeta(el), source };
  if (isDisplayMath(el)) return { kind: 'math', meta: {}, source };
  if (isDiagram(el)) return { kind: 'diagram', meta: {}, source };
  if (isImage(el)) return { kind: 'image', meta: imageMeta(el), source };
  if (t === 'figure' && el.querySelector('img, picture') && !el.querySelector('table, pre'))
    return { kind: 'image', meta: imageMeta(el), source };
  return null;
}

const countWords = (sentences: Sentence[]) => sentences.reduce((n, s) => n + s.tokens.length, 0);

const blockWords = (block: Block): number =>
  block.kind === 'prose'
    ? countWords(block.sentences)
    : block.kind === 'list'
      ? block.items.reduce((n, it) => n + countWords(it.sentences), 0)
      : 0;

const isList = (el: Element) => tag(el) === 'ul' || tag(el) === 'ol';

/** Items of `list` and its nested lists in document order; exhibits inside items go to `trailing`. */
function collectItems(list: Element, depth: number, items: ListItem[], trailing: Element[]) {
  const lis = Array.from(list.children).filter((c) => tag(c) === 'li' && !isSkipped(c, true));
  lis.forEach((li, i) => {
    const text = new InlineText();
    const nested: Element[] = [];
    gatherInline(li, text, (child) => {
      if (isSkipped(child, true)) return true;
      if (isList(child)) {
        nested.push(child);
        return true;
      }
      if (exhibitOf(child)) {
        trailing.push(child);
        return true;
      }
      return false;
    });
    const sentences = text.sentences();
    items.push({ depth, index: i + 1, of: lis.length, sentences, source: sourceOf(li) });
    for (const sub of nested) collectItems(sub, depth + 1, items, trailing);
  });
}

/** Turn rendered DOM into a document (spec section 2). */
export function extract(root: Element | Element[], opts: ExtractOptions = {}): Doc {
  const extractor = new Extractor(opts.idPrefix ?? 's');
  for (const r of Array.isArray(root) ? root : [root]) {
    if (isSkipped(r, true)) continue;
    if (isBlockElement(r) && (headingLevel(r) !== null || exhibitOf(r) || isList(r))) extractor.block(r);
    else extractor.walk(r);
  }
  return extractor.finish();
}

/** The nearest block-level element holding `node`. */
function enclosingBlock(node: Node): Element | null {
  for (let n: Node | null = node; n; n = n.parentNode) {
    if (n.nodeType === 1 && isBlockElement(n as Element)) return n as Element;
  }
  return null;
}

/**
 * Turn a selection into a document: the blocks the range intersects, or, when the range lies
 * inside one block, one prose block of the selected text.
 */
export function extractRange(range: Range, opts: ExtractOptions = {}): Doc {
  const id = opts.idPrefix ?? 's';
  const start = enclosingBlock(range.startContainer);
  if (start && start === enclosingBlock(range.endContainer) && !hasBlockChild(start)) {
    const text = new InlineText();
    gatherInline(range.cloneContents(), text);
    const sentences = text.sentences();
    if (sentences.length === 0) return { sections: [] };
    return { sections: [{ id: `${id}0`, blocks: [{ kind: 'prose', sentences, source: sourceOf(start) }], words: countWords(sentences) }] };
  }
  const common = range.commonAncestorContainer;
  const container = common.nodeType === 1 ? (common as Element) : common.parentElement;
  if (!container) return { sections: [] };
  const intersects = (ref: SourceRef) => !!ref.element && range.intersectsNode(ref.element);
  const sections: Section[] = [];
  for (const section of extract(container, opts).sections) {
    const blocks = section.blocks.filter((b) => intersects(b.source));
    const heading = section.heading && intersects(section.heading.source) ? section.heading : undefined;
    if (!heading && blocks.length === 0) continue;
    const kept: Section = { id: section.id, blocks, words: blocks.reduce((n, b) => n + blockWords(b), 0) };
    if (heading) kept.heading = heading;
    sections.push(kept);
  }
  return { sections };
}
