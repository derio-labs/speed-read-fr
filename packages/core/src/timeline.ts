import type { Block, Doc, ExhibitBlock, ExhibitKind, ExhibitMeta, ListItem, Section, Sentence, SourceRef, Token } from './model';
import type { Settings } from './settings';
import { chipLabel } from './ui/format';
import { chunkSentence, type Chunk, type ChunkOptions } from './text/chunks';

export type ListBlock = Extract<Block, { kind: 'list' }>;

export interface ChapterCard {
  title: string;
  words: number;
  /** e.g. "4 paragraphs, 1 list, 2 code blocks, 1 table" */
  summary: string;
  /** Titles of the section's direct sub-headings. */
  subheadings: string[];
}

/** Where a step sits. Heading steps have `blockIndex` -1, since a heading is not a block. */
export interface StepPosition {
  sectionId: string;
  blockIndex: number;
  source: SourceRef;
}

export interface SentencePart {
  chunk: Chunk;
  /** Index of the sentence within its prose block or list item. */
  sentenceIndex: number;
  /** The chunk is the first of its sentence. */
  sentenceStart: boolean;
}

export type Step = StepPosition &
  (
    | { kind: 'chapter'; card: ChapterCard }
    | { kind: 'title'; text: string; level: number; tokens?: Token[] }
    | ({ kind: 'chunk' } & SentencePart)
    | ({ kind: 'item-chunk'; index: number; of: number; depth: number } & SentencePart)
    | { kind: 'item-gap' }
    | { kind: 'list-whole'; block: ListBlock; words: number }
    | { kind: 'stop'; exhibit: ExhibitKind; prompt: string; inlineIndex?: number; chip?: number }
    | { kind: 'dwell'; exhibit: ExhibitKind; seconds: number; inlineIndex?: number; chip?: number }
  );

export type StepKind = Step['kind'];

/** A block exhibit: a code, table, math, image or diagram block. */
export interface BlockExhibit {
  inline?: undefined;
  blockIndex: number;
  block: ExhibitBlock;
  /** Index of the step at which playback passes the exhibit (the timeline length when nothing follows it). */
  revealAt: number;
}

/** A long inline code or math atom of a flow-mode sentence, listed as an exhibit of its own. */
export interface InlineExhibit {
  inline: true;
  blockIndex: number;
  /** 1-based, within the block. */
  inlineIndex: number;
  /** The chip's number on the ribbon (`⟨code 2⟩`), per kind within the section. */
  chip: number;
  kind: 'code' | 'math';
  text: string;
  revealAt: number;
}

export type TimelineExhibit = BlockExhibit | InlineExhibit;

/** Identity of an exhibit within its section: `b<blockIndex>`, or `b<blockIndex>i<inlineIndex>` for an inline one. */
export const exhibitKey = ({ blockIndex, inlineIndex }: { blockIndex: number; inlineIndex?: number }): string =>
  `b${blockIndex}${inlineIndex !== undefined ? `i${inlineIndex}` : ''}`;

export const exhibitKind = (e: TimelineExhibit): ExhibitKind => (e.inline ? e.kind : e.block.kind);

export interface TimelineSection {
  id: string;
  title?: string;
  level?: number;
  words: number;
  /** Index of the section's first step (its chapter card when it has one). */
  firstStep: number;
  exhibits: TimelineExhibit[];
}

export interface Timeline {
  steps: Step[];
  sections: TimelineSection[];
}

const SHORT_LIST_ITEM_WORDS = 6;
const SHORT_LIST_MAX_ITEMS = 8;
/** In flow mode an atom longer than this becomes a chip on the ribbon and an exhibit of its own. */
export const LONG_ATOM_CHARS = 20;
const PROMPT_TAIL = ': Space to continue, E to expand';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const sentenceWords = (sentences: Sentence[]): number => sentences.reduce((n, s) => n + s.tokens.length, 0);

function stopPrompt(kind: 'code' | 'table' | 'math', meta: ExhibitMeta, chip?: number): string {
  if (chip !== undefined) return `${chipLabel(kind === 'math' ? 'math' : 'code', chip)}${PROMPT_TAIL}`;
  if (kind === 'code') return `Code${meta.lines !== undefined ? `, ${plural(meta.lines, 'line')}` : ''}${PROMPT_TAIL}`;
  if (kind === 'table') {
    const size =
      meta.rows !== undefined && meta.cols !== undefined
        ? `, ${plural(meta.rows, 'row')} by ${plural(meta.cols, 'column')}`
        : '';
    return `Table${size}${PROMPT_TAIL}`;
  }
  return `Formula${PROMPT_TAIL}`;
}

const SUMMARY_LABELS: [Block['kind'], string, string][] = [
  ['prose', 'paragraph', 'paragraphs'],
  ['list', 'list', 'lists'],
  ['code', 'code block', 'code blocks'],
  ['table', 'table', 'tables'],
  ['math', 'formula', 'formulas'],
  ['image', 'image', 'images'],
  ['diagram', 'diagram', 'diagrams'],
];

function summarise(blocks: Block[]): string {
  return SUMMARY_LABELS.map(([kind, one, many]) => [blocks.filter((b) => b.kind === kind).length, one, many] as const)
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => plural(n, one, many))
    .join(', ');
}

function directSubheadings(sections: Section[], at: number): string[] {
  const level = sections[at].heading?.level ?? 0;
  const titles: string[] = [];
  let shallowest = Infinity;
  for (let i = at + 1; i < sections.length; i++) {
    const s = sections[i];
    if (!s.heading) continue;
    if (s.heading.level <= level) break;
    if (s.heading.level <= shallowest) titles.push(s.heading.text);
    shallowest = Math.min(shallowest, s.heading.level);
  }
  return titles;
}

const isShortList = (items: ListItem[]) =>
  items.length <= SHORT_LIST_MAX_ITEMS && items.every((it) => sentenceWords(it.sentences) <= SHORT_LIST_ITEM_WORDS);

function sentenceParts(sentences: Sentence[], options: ChunkOptions): SentencePart[] {
  return sentences.flatMap((sentence, sentenceIndex) =>
    chunkSentence(sentence, options).map((chunk, i) => ({ chunk, sentenceIndex, sentenceStart: i === 0 })),
  );
}

const isChip = (token: Token): token is Extract<Token, { kind: 'atom' }> & { full: string; chip: number } =>
  token.kind === 'atom' && token.full !== undefined && token.chip !== undefined;

/** Turn a document into the ordered steps the player runs through (spec section 4). */
export function buildTimeline(doc: Doc, settings: Settings): Timeline {
  const steps: Step[] = [];
  const sections: TimelineSection[] = [];
  const flow = settings.readingMode === 'flow';
  // Flow mode steps one word at a time; the stored chunk limits apply again in chunk mode.
  const chunkOptions: ChunkOptions = { chunkWords: flow ? 1 : settings.chunkWords, chunkChars: settings.chunkChars };

  doc.sections.forEach((section, sectionAt) => {
    const sectionId = section.id;
    /** Chip numbers per kind, from 1 in each section. */
    const chips = { code: 0, math: 0 };
    const entry: TimelineSection = {
      id: sectionId,
      title: section.heading?.text,
      level: section.heading?.level,
      words: section.words,
      firstStep: steps.length,
      exhibits: [],
    };
    sections.push(entry);

    if (section.heading) {
      const at = { sectionId, blockIndex: -1, source: section.heading.source };
      if (settings.stopLevels.includes(section.heading.level)) {
        const card: ChapterCard = {
          title: section.heading.text,
          words: section.words,
          summary: summarise(section.blocks),
          subheadings: directSubheadings(doc.sections, sectionAt),
        };
        steps.push({ ...at, kind: 'chapter', card });
      } else {
        steps.push({ ...at, kind: 'title', text: section.heading.text, level: section.heading.level, tokens: section.heading.tokens });
      }
    }

    section.blocks.forEach((block, blockIndex) => {
      const at = { sectionId, blockIndex, source: block.source };
      let inlineCount = 0;

      /** Flow mode: atoms over the limit become chips (numbered per section); the rest is untouched. */
      const withChips = (sentences: Sentence[]): Sentence[] =>
        !flow
          ? sentences
          : sentences.map((sentence) => ({
              tokens: sentence.tokens.map((t): Token =>
                t.kind === 'atom' && t.text.length > LONG_ATOM_CHARS
                  ? { kind: 'atom', atom: t.atom, text: `⟨${t.atom} ${++chips[t.atom]}⟩`, full: t.text, chip: chips[t.atom] }
                  : t,
              ),
            }));

      /** The chunk steps of the sentences; each chip is followed by its inline exhibit's stop or dwell. */
      const pushSentences = (sentences: Sentence[], position: StepPosition, build: (part: SentencePart) => Step) => {
        for (const part of sentenceParts(withChips(sentences), chunkOptions)) {
          steps.push(build(part));
          const token = part.chunk.tokens[0];
          if (!flow || !isChip(token)) continue;
          const inlineIndex = ++inlineCount;
          const { chip } = token;
          entry.exhibits.push({ inline: true, blockIndex, inlineIndex, chip, kind: token.atom, text: token.full, revealAt: steps.length });
          const behaviour = settings[token.atom];
          const inline = { inlineIndex, chip };
          if (behaviour.mode === 'stop')
            steps.push({ ...position, kind: 'stop', exhibit: token.atom, prompt: stopPrompt(token.atom, {}, chip), ...inline });
          else if (behaviour.mode === 'dwell')
            steps.push({ ...position, kind: 'dwell', exhibit: token.atom, seconds: behaviour.dwellSeconds, ...inline });
        }
      };

      switch (block.kind) {
        case 'prose':
          pushSentences(block.sentences, at, (part) => ({ ...at, kind: 'chunk', ...part }));
          return;
        case 'list':
          if (isShortList(block.items)) {
            const words = block.items.reduce((n, it) => n + sentenceWords(it.sentences), 0);
            steps.push({ ...at, kind: 'list-whole', block, words });
            return;
          }
          for (const it of block.items) {
            const itemAt = { ...at, source: it.source };
            const counter = { index: it.index, of: it.of, depth: it.depth };
            pushSentences(it.sentences, itemAt, (part) => ({ ...itemAt, kind: 'item-chunk', ...counter, ...part }));
            steps.push({ ...itemAt, kind: 'item-gap' });
          }
          return;
        case 'image':
        case 'diagram':
          entry.exhibits.push({ blockIndex, block, revealAt: steps.length });
          steps.push({ ...at, kind: 'dwell', exhibit: block.kind, seconds: settings.imageDwellSeconds });
          return;
        default: {
          const behaviour = settings[block.kind];
          entry.exhibits.push({ blockIndex, block, revealAt: steps.length });
          if (behaviour.mode === 'stop')
            steps.push({ ...at, kind: 'stop', exhibit: block.kind, prompt: stopPrompt(block.kind, block.meta) });
          else if (behaviour.mode === 'dwell')
            steps.push({ ...at, kind: 'dwell', exhibit: block.kind, seconds: behaviour.dwellSeconds });
        }
      }
    });
  });

  return { steps, sections };
}
