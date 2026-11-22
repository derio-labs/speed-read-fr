import { baseMs } from '../pacing';
import { ALNUM } from '../text/orp';

/** Pure geometry of the flow-mode ribbon: no DOM, so the renderer only measures and applies it. */

/** A word on the ribbon's one line: where it starts, how wide it is, and the centre of its middle letter. */
export interface WordSpan {
  start: number;
  width: number;
  /** x of the middle letter's centre, in the same coordinates as `start`. */
  mid: number;
}

/** The focus bracket's width: the focus span in measured characters, never wider than the row. */
export function focusWidth({ focusChars, charWidth, row }: { focusChars: number; charWidth: number; row: number }): number {
  return Math.min(row, focusChars * charWidth);
}

/** The most words laid out at once. */
export const RUN_WINDOW = 400;
/** The window is laid out again when the position comes within this many words of one of its edges. */
export const RUN_EDGE = 100;

export interface RunRange {
  first: number;
  last: number;
}

export interface RunWindow {
  from: number;
  to: number;
}

/** Steps that continue a run: words, list-item words and the gaps between items. */
const RUN_KINDS = new Set(['chunk', 'item-chunk', 'item-gap']);
const INLINE_STOP_KINDS = new Set(['stop', 'dwell']);

const continuesRun = (step: { kind: string; inlineIndex?: number }) =>
  RUN_KINDS.has(step.kind) || (INLINE_STOP_KINDS.has(step.kind) && step.inlineIndex !== undefined);

/**
 * The run of steps around `index`: consecutive steps up to a card (chapter, title, block stop or dwell,
 * whole list, end), which are not part of the ribbon. An inline stop or dwell does not end it.
 * Null when `index` is itself on a card.
 */
export function runBounds(steps: readonly { kind: string; inlineIndex?: number }[], index: number): RunRange | null {
  if (index < 0 || index >= steps.length || !continuesRun(steps[index])) return null;
  let first = index;
  while (first > 0 && continuesRun(steps[first - 1])) first--;
  let last = index;
  while (last < steps.length - 1 && continuesRun(steps[last + 1])) last++;
  return { first, last };
}

/**
 * The window of the run to lay out: at most RUN_WINDOW words centred on `index`, kept while `index`
 * stays RUN_EDGE words or more from an edge that is not the run's own, otherwise laid out again.
 */
export function runWindow(run: RunRange, index: number, current: RunWindow | null): RunWindow {
  if (current && index >= current.from && index <= current.to) {
    const nearStart = current.from > run.first && index - current.from < RUN_EDGE;
    const nearEnd = current.to < run.last && current.to - index < RUN_EDGE;
    if (!nearStart && !nearEnd) return current;
  }
  const size = run.last - run.first + 1;
  if (size <= RUN_WINDOW) return { from: run.first, to: run.last };
  const from = Math.min(Math.max(index - RUN_WINDOW / 2, run.first), run.last - RUN_WINDOW + 1);
  return { from, to: from + RUN_WINDOW - 1 };
}

export const GLIDE_MAX_MS = 100;

/**
 * Duration of the ribbon's glide to the next word: a third of one word's time at the set speed, never
 * above GLIDE_MAX_MS; none for a move longer than one row width or under reduced motion.
 */
export function glideMs({ wpm, distance, rowWidth, reducedMotion }: { wpm: number; distance: number; rowWidth: number; reducedMotion: boolean }): number {
  if (reducedMotion || distance > rowWidth) return 0;
  return Math.min(GLIDE_MAX_MS, baseMs({ wpm }) / 3);
}

/** Offsets `[start, end)` of the first letter or digit of `text`, as a whole code point; null when it has none. */
export function firstLetter(text: string): [number, number] | null {
  let offset = 0;
  for (const ch of text) {
    if (ALNUM.test(ch)) return [offset, offset + ch.length];
    offset += ch.length;
  }
  return null;
}

/** Where a word's left edge sits on screen: its line position, less the shared offset, plus the middle row's half-row shift. */
export const screenLeft = (span: { start: number }, x: number, row: number): number => span.start - x + row / 2;

/** Whether any part of the word sits inside the bracket (touching an edge does not count). */
export function inBracket({ span, x, row, target }: { span: { start: number; width: number }; x: number; row: number; target: { x: number; w: number } }): boolean {
  const left = screenLeft(span, x, row);
  return left < target.x + target.w && left + span.width > target.x;
}

/**
 * A point on the ribbon's line, named by the word it belongs to (a step index) so that it survives the
 * spans being measured again: the word's middle; the handover `before` it (from the previous word) or
 * `after` it (to the next one); its right (`end`) or left (`begin`) edge, which bound the gap between two
 * list items; or a frozen point part-way between two anchors (a paused slide).
 */
export type Anchor = { word: number; at: 'mid' | 'before' | 'after' | 'end' | 'begin' } | { between: [Anchor, Anchor]; t: number };

/** Pixels of an anchor on the current spans; `order` lists the step index of each span. */
export function anchorX(spans: readonly WordSpan[], order: readonly number[], anchor: Anchor): number {
  if ('between' in anchor) {
    const from = anchorX(spans, order, anchor.between[0]);
    return from + (anchorX(spans, order, anchor.between[1]) - from) * anchor.t;
  }
  const i = order.indexOf(anchor.word);
  const span = spans[i];
  if (!span) return 0;
  const handover = (other: WordSpan | undefined) => (other ? (other.mid + span.mid) / 2 : span.mid);
  switch (anchor.at) {
    case 'mid':
      return span.mid;
    case 'before':
      return handover(spans[i - 1]);
    case 'after':
      return handover(spans[i + 1]);
    case 'end':
      return span.start + span.width;
    case 'begin':
      return span.start;
  }
}

const sameAnchor = (a: Anchor, b: Anchor): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The anchor a slide `from` → `to` has reached at `progress` (0-1). A slide that began at a frozen point
 * heading for the same end collapses into one frozen point, so repeated pauses never nest deeper than one level.
 */
export function freezeAnchor(from: Anchor, to: Anchor, progress: number): Anchor {
  if ('between' in from && sameAnchor(from.between[1], to)) return { between: [from.between[0], to], t: from.t + (1 - from.t) * progress };
  return { between: [from, to], t: progress };
}

/** Where a slide is at `now`: linear from `fromX` to `toX` over `durationMs`, clamped; at `toX` for no duration. */
export function slideX({ fromX, toX, startedAt, durationMs, now }: { fromX: number; toX: number; startedAt: number; durationMs: number; now: number }): number {
  if (!(durationMs > 0)) return toX;
  const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
  return fromX + (toX - fromX) * progress;
}
