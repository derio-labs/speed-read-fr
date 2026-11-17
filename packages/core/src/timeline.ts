import type { Block, Doc, ExhibitBlock, ExhibitKind, ExhibitMeta, ListItem, Section, Sentence, SourceRef, Token } from './model';
import type { Settings } from './settings';
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
    | { kind: 'stop'; exhibit: ExhibitKind; prompt: string }
    | { kind: 'dwell'; exhibit: ExhibitKind; seconds: number }
  );

export type StepKind = Step['kind'];

export interface TimelineExhibit {
  blockIndex: number;
  block: ExhibitBlock;
  /** Index of the step at which playback passes the exhibit (the timeline length when nothing follows it). */
  revealAt: number;
}

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
const PROMPT_TAIL = ': Space to continue, E to expand';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const sentenceWords = (sentences: Sentence[]): number => sentences.reduce((n, s) => n + s.tokens.length, 0);

function stopPrompt(kind: 'code' | 'table' | 'math', meta: ExhibitMeta): string {
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

/** Turn a document into the ordered steps the player runs through (spec section 4). */
export function buildTimeline(doc: Doc, settings: Settings): Timeline {
  const steps: Step[] = [];
  const sections: TimelineSection[] = [];
  const chunkOptions: ChunkOptions = { chunkWords: settings.chunkWords, chunkChars: settings.chunkChars };

  doc.sections.forEach((section, sectionAt) => {
    const sectionId = section.id;
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
      switch (block.kind) {
        case 'prose':
          for (const part of sentenceParts(block.sentences, chunkOptions)) steps.push({ ...at, kind: 'chunk', ...part });
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
            for (const part of sentenceParts(it.sentences, chunkOptions))
              steps.push({ ...itemAt, kind: 'item-chunk', ...counter, ...part });
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
