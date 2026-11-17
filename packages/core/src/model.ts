/** Document model (spec section 2). Every host hands the core a DOM subtree; extraction yields a `Doc`. */

export interface Doc {
  sections: Section[];
}

export interface Section {
  id: string;
  heading?: { level: 1 | 2 | 3 | 4 | 5 | 6; text: string };
  blocks: Block[];
  words: number;
}

export type Block =
  | { kind: 'prose'; sentences: Sentence[]; source: SourceRef }
  | { kind: 'list'; ordered: boolean; items: ListItem[]; source: SourceRef }
  | { kind: 'code' | 'table' | 'math' | 'image' | 'diagram'; meta: ExhibitMeta; source: SourceRef };

export type ExhibitKind = 'code' | 'table' | 'math' | 'image' | 'diagram';
export type ExhibitBlock = Extract<Block, { kind: ExhibitKind }>;

export interface ListItem {
  depth: number;
  index: number;
  of: number;
  sentences: Sentence[];
  source: SourceRef;
}

export interface Sentence {
  tokens: Token[];
}

export type Token = { kind: 'word'; text: string } | { kind: 'atom'; atom: 'code' | 'math'; text: string };

/** `element` is null outside a DOM (unit tests); `line` comes from `data-line` when present. */
export interface SourceRef {
  element: Element | null;
  line?: number;
}

export interface ExhibitMeta {
  lines?: number;
  rows?: number;
  cols?: number;
  alt?: string;
  language?: string;
}
