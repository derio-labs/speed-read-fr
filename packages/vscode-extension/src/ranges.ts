/**
 * Markdown source structure for the commands (spec section 8): headings, sections, the block a line
 * belongs to. Pure line-based scanning, no `vscode` import; lines are zero-based.
 */

export interface Heading {
  line: number;
  level: number;
  text: string;
}

/** A source range: `startLine` to `endLine`, inclusive. */
export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface SelectionLike {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

type LineKind = 'blank' | 'fence' | 'heading' | 'underline' | 'break' | 'list' | 'table' | 'quote' | 'para';

interface LineInfo {
  kind: LineKind;
  /** Fence lines: the fence's opening line. Heading lines (all lines of a setext heading): the heading's first line. */
  start?: number;
}

interface Scan {
  lines: LineInfo[];
  headings: Heading[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?=\s|$)(.*)$/;
const UNDERLINE = /^ {0,3}(=+|-+)\s*$/;
const BREAK = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST = /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;

let cache: { text: string; scan: Scan } | null = null;

function scan(text: string): Scan {
  if (cache?.text === text) return cache.scan;
  const src = text.split(/\r?\n/);
  const lines: LineInfo[] = [];
  let fence: { char: string; length: number; start: number } | null = null;
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    if (fence) {
      lines.push({ kind: 'fence', start: fence.start });
      const close = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length, start: i };
      lines.push({ kind: 'fence', start: i });
    } else if (/^\s*$/.test(line)) lines.push({ kind: 'blank' });
    else if (ATX.test(line)) lines.push({ kind: 'heading', start: i });
    else if (UNDERLINE.test(line) && lines[i - 1]?.kind === 'para') {
      let first = i - 1;
      while (lines[first - 1]?.kind === 'para') first--;
      for (let l = first; l < i; l++) lines[l] = { kind: 'heading', start: first };
      lines.push({ kind: 'underline', start: first });
    } else if (BREAK.test(line)) lines.push({ kind: 'break' });
    else if (LIST.test(line)) lines.push({ kind: 'list' });
    else if (/^\s*\|/.test(line)) lines.push({ kind: 'table' });
    else if (/^\s*>/.test(line)) lines.push({ kind: 'quote' });
    else lines.push({ kind: 'para' });
  }
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== 'heading' || lines[i].start !== i) continue;
    const atx = ATX.exec(src[i]);
    if (atx) {
      headings.push({ line: i, level: atx[1].length, text: atx[2].replace(/(?:^|\s)#+\s*$/, '').trim() });
      continue;
    }
    let end = i;
    while (lines[end].kind === 'heading') end++;
    const level = src[end].trim().startsWith('=') ? 1 : 2;
    headings.push({ line: i, level, text: src.slice(i, end).map((l) => l.trim()).join(' ') });
  }
  const result = { lines, headings };
  cache = { text, scan: result };
  return result;
}

/** ATX and setext headings, in order; `#` lines inside fenced code are not headings. */
export function findHeadings(text: string): Heading[] {
  return scan(text).headings;
}

/**
 * The section of the heading at (or last before) `line`: to the line before the next heading of the
 * same or a higher level, else to the last line. With no heading before `line`, from `line` to the end.
 */
export function sectionRange(headings: Heading[], line: number, lineCount: number): LineRange {
  const last = lineCount - 1;
  let index = -1;
  while (index + 1 < headings.length && headings[index + 1].line <= line) index++;
  if (index < 0) return { startLine: line, endLine: last };
  const heading = headings[index];
  const next = headings.slice(index + 1).find((h) => h.level <= heading.level);
  return { startLine: heading.line, endLine: next ? next.line - 1 : last };
}

/**
 * The first line of the block containing `line`: the paragraph, list item, heading or fence. A blank
 * line belongs to the next block (reading from there reads what follows).
 */
export function blockStart(text: string, line: number): number {
  const { lines } = scan(text);
  let l = Math.max(0, Math.min(line, lines.length - 1));
  if (lines[l].kind === 'blank') {
    const next = lines.findIndex((info, i) => i > l && info.kind !== 'blank');
    if (next < 0) return l;
    l = next;
  }
  const info = lines[l];
  if (info.start !== undefined) return info.start;
  while (info.kind !== 'break' && lines[l].kind !== 'list' && l > 0) {
    const prev = lines[l - 1].kind;
    if (prev === 'blank' || prev === 'fence' || prev === 'heading' || prev === 'underline' || prev === 'break') break;
    l--;
  }
  return l;
}

/** The selection widened to whole lines; an end at column 0 of a later line does not take that line. */
export function selectionRange(selection: SelectionLike): LineRange {
  const { start, end } = selection;
  const endLine = end.line > start.line && end.character === 0 ? end.line - 1 : end.line;
  return { startLine: start.line, endLine };
}

/** Whether `line` is the first line of a paragraph (not a heading, list item, fence or blank). */
export function isParagraphStart(text: string, line: number): boolean {
  const info = scan(text).lines[line];
  return info?.kind === 'para' && blockStart(text, line) === line;
}

/** Whether `line` lies in fenced code, the fence markers included. */
export function isInFence(text: string, line: number): boolean {
  return scan(text).lines[line]?.kind === 'fence';
}

/** Lines that carry the "Speed read from here" hover: headings and paragraph, list or quote text. */
export function hoverable(text: string, line: number): boolean {
  const kind = scan(text).lines[line]?.kind;
  return kind === 'heading' || kind === 'para' || kind === 'list' || kind === 'quote';
}
