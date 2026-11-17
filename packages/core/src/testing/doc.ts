/** Builders for `Doc` literals in unit tests (no DOM: every source element is null). */
import type { Block, Doc, ExhibitMeta, ListItem, Section, SourceRef } from '../model';
import { splitSentences, tokenize } from '../text/sentences';

let line = 0;
export const src = (): SourceRef => ({ element: null, line: ++line });

export const prose = (text: string): Block => ({ kind: 'prose', sentences: splitSentences(tokenize(text)), source: src() });

export const item = (text: string, index: number, of: number, depth = 0): ListItem => ({
  depth,
  index,
  of,
  sentences: splitSentences(tokenize(text)),
  source: src(),
});

export const list = (items: ListItem[], ordered = false): Block => ({ kind: 'list', ordered, items, source: src() });

/** A flat list whose items are the given texts. */
export const flatList = (...texts: string[]): Block => list(texts.map((t, i) => item(t, i + 1, texts.length)));

export const exhibit = (kind: 'code' | 'table' | 'math' | 'image' | 'diagram', meta: ExhibitMeta = {}): Block => ({
  kind,
  meta,
  source: src(),
});

const blockWords = (block: Block): number => {
  if (block.kind === 'prose') return block.sentences.reduce((n, s) => n + s.tokens.length, 0);
  if (block.kind === 'list')
    return block.items.reduce((n, it) => n + it.sentences.reduce((m, s) => m + s.tokens.length, 0), 0);
  return 0;
};

export const section = (
  id: string,
  heading: { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | undefined,
  ...blocks: Block[]
): Section => ({
  id,
  ...(heading ? { heading: { ...heading, source: src() } } : {}),
  blocks,
  words: blocks.reduce((n, b) => n + blockWords(b), 0),
});

export const doc = (...sections: Section[]): Doc => ({ sections });
