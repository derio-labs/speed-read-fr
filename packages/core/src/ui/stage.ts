import type { Token } from '../model';
import { baseMs, sectionEstimate } from '../pacing';
import type { EndStep, PlayerState, StepEvent } from '../player';
import { joinTokens } from '../text/chunks';
import { middleLetter } from '../text/middle';
import { orp } from '../text/orp';
import type { Step } from '../timeline';
import type { ReaderContext, Zone } from './context';
import { createDialStrip, type DialStrip } from './dial-strip';
import { replaceChildren, type Child } from './dom';
import { EXHIBIT_LABELS, formatDuration, plural } from './format';
import { glideMs, ribbonOffsets, runBounds, runWindow, type Range as RunRange, type WordSpan, type Window as RunWindow } from './ribbon-geometry';

type ChunkStep = Extract<Step, { kind: 'chunk' | 'item-chunk' }>;

const STATE_LABELS: Record<PlayerState, string> = {
  idle: 'Ready',
  playing: 'Playing',
  paused: 'Paused',
  stopped: 'Waiting',
  reading: 'Reading',
  closed: 'Closed',
};

/** Fraction of the stage width where the pivot axis sits (matches `--sr-axis`). */
const AXIS = 0.45;
const EDGE_PX = 12;
/** Indent per list depth (matches the 28px in the stylesheet). */
const DEPTH_PX = 28;
/** Below this scale a chunk wraps inside the stage instead of shrinking further. */
const MIN_SCALE = 0.5;

const isChunk = (step: Step): step is ChunkStep => step.kind === 'chunk' || step.kind === 'item-chunk';
const sameSentence = (a: ChunkStep, b: Step) =>
  isChunk(b) && b.kind === a.kind && b.source === a.source && b.sentenceIndex === a.sentenceIndex;

export interface StageElements {
  stage: HTMLElement;
  status: HTMLElement;
  overallFill: HTMLElement;
  details?: HTMLElement;
}

/** The stage: the current chunk on the pivot axis, the faded sentence, cards, and the status line. */
export interface StageZone extends Zone {
  /** The position dial's wheel input (for a host that routes page wheel events to it). */
  wheel: DialStrip['wheel'];
  /** Show `text` as a note in the status line ("Settings not saved"), or clear it with null. */
  note(text: string | null): void;
}

export function createStage(ctx: ReaderContext, { stage, status, overallFill, details }: StageElements): StageZone {
  const { h, player } = ctx;
  const display = h('div', { class: 'sr-display', 'aria-live': 'off' });
  const sentence = h('div', { class: 'sr-sentence', 'aria-hidden': 'true' });
  stage.append(display);
  if (!details) stage.append(sentence);
  const dial = createDialStrip(ctx, stage);
  /** A note set through `note()`: a host's message, such as a failed settings save. */
  let hostNote: string | null = null;

  const kbd = (key: string) => h('span', { class: 'sr-kbd' }, key);
  const eyebrow = (text: string) => h('div', { class: 'sr-card-eyebrow' }, text);
  const title = (text: string) => h('div', { class: 'sr-card-title' }, text);
  const hint = (...parts: Child[]) => h('div', { class: 'sr-card-hint' }, ...parts);

  /** Token text as nodes, atoms wrapped in a monospace span; `from`/`to` are offsets in the joined text. */
  function tokenNodes(tokens: Token[], from = 0, to = Infinity): Child[] {
    const nodes: Child[] = [];
    let at = 0;
    tokens.forEach((token, i) => {
      const piece = (i > 0 ? ' ' : '') + token.text;
      const start = at;
      at += piece.length;
      const lo = Math.max(from, start);
      const hi = Math.min(to, at);
      if (lo >= hi) return;
      const lead = i > 0 ? 1 : 0;
      const slice = piece.slice(lo - start, hi - start);
      if (token.kind !== 'atom') return nodes.push(slice);
      // The joining space stays outside the atom's box.
      const space = lo - start < lead ? ' ' : '';
      nodes.push(space, h('span', { class: 'sr-atom' }, space ? slice.slice(1) : slice));
    });
    return nodes;
  }

  function setDisplay(kind: string, ...children: Child[]) {
    display.dataset.kind = kind;
    delete display.dataset.wrap;
    display.style.removeProperty('--sr-depth');
    if (details) {
      const prose = kind === 'chunk' || kind === 'item-chunk' || kind === 'flow' || kind === 'whole';
      if (prose) {
        if (!details.hidden) {
          replaceChildren(details);
          details.hidden = true;
        }
      } else {
        replaceChildren(details, ...children);
        details.hidden = false;
      }
      replaceChildren(display, ...(prose ? children : []));
    } else replaceChildren(display, ...children);
  }

  function card(kind: string, ...children: Child[]) {
    return h('div', { class: `sr-card sr-card-${kind}` }, ...children);
  }

  /** The flow ribbon on show: one line of word spans in three clipped rows, shifted by one shared offset. */
  interface Ribbon {
    el: HTMLElement;
    middle: HTMLElement;
    target: HTMLElement;
    steps: Step[];
    run: RunRange;
    window: RunWindow;
    /** Step indices of the words, in line order, and the middle line's span for each. */
    order: number[];
    words: Map<number, { el: HTMLElement; tokens: Token[] }>;
    spans: WordSpan[];
    /** Width of a row, measured with the spans. */
    row: number;
    /** The shared offset last applied (null before the first placement), the step on show, and the lit word. */
    x: number | null;
    index: number;
    hidden: boolean;
    lit: number | null;
  }
  let ribbon: Ribbon | null = null;

  const TARGET_PAD = 4;

  function buildRibbon(run: RunRange, win: RunWindow): Ribbon {
    const steps = ctx.timeline.steps;
    const order: number[] = [];
    const pieces: ({ step: number; tokens: Token[] } | null)[] = [];
    for (let i = win.from; i <= win.to; i++) {
      const step = steps[i];
      if (isChunk(step)) {
        order.push(i);
        pieces.push({ step: i, tokens: step.chunk.tokens });
      } else if (step.kind === 'item-gap' && pieces.length > 0 && i < win.to && isChunk(steps[i + 1])) pieces.push(null);
    }
    const words = new Map<number, { el: HTMLElement; tokens: Token[] }>();
    const line = (position: 'top' | 'middle' | 'bottom') => {
      const children: Child[] = [];
      pieces.forEach((piece, n) => {
        if (n > 0) children.push(' ');
        if (!piece) return children.push(h('span', { class: 'sr-ribbon-sep' }, '•'));
        const el = h('span', { class: 'sr-w' }, ...tokenNodes(piece.tokens));
        if (position === 'middle') words.set(piece.step, { el, tokens: piece.tokens });
        children.push(el);
      });
      return h('div', { class: 'sr-ribbon-line' }, ...children);
    };
    const lines = (['top', 'middle', 'bottom'] as const).map(line);
    const rows = (['top', 'middle', 'bottom'] as const).map((position, n) => h('div', { class: 'sr-ribbon-row', 'data-position': position }, lines[n]));
    const target = h(
      'div',
      { class: 'sr-flow-target', 'aria-hidden': 'true' },
      h('span', { class: 'sr-flow-brace', 'data-side': 'top' }),
      h('span', { class: 'sr-flow-brace', 'data-side': 'bottom' }),
    );
    const el = h('div', { class: 'sr-ribbon' }, ...rows, target);
    return { el, middle: lines[1], target, steps, run, window: win, order, words, spans: [], row: 0, x: null, index: -1, hidden: false, lit: null };
  }

  const widthOf = (el: Element) => (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().width : 0);

  /** Centre of the word's middle letter, measured on the line (a proportional guess without layout). */
  function middleCentre(el: HTMLElement, start: number, width: number): number {
    const text = el.textContent ?? '';
    const offset = middleLetter(text);
    const length = Array.from(text.slice(offset))[0]?.length ?? 1;
    const walker = ctx.document.createTreeWalker(el, 4 /* SHOW_TEXT */);
    let seen = 0;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (offset >= seen + node.data.length) {
        seen += node.data.length;
        continue;
      }
      const range = ctx.document.createRange();
      range.setStart(node, offset - seen);
      range.setEnd(node, Math.min(node.data.length, offset - seen + length));
      if (typeof range.getBoundingClientRect === 'function') {
        const box = range.getBoundingClientRect();
        if (box.width > 0) return box.left + box.width / 2;
      }
      break;
    }
    return start + (width * (offset + 0.5)) / Math.max(1, text.length);
  }

  /** Measure the word spans once per layout, and the row width. */
  function measureRibbon(r: Ribbon) {
    r.row = widthOf(r.el.querySelector('.sr-ribbon-row[data-position="middle"]')!);
    const origin = r.middle.getBoundingClientRect().left;
    r.spans = r.order.map((step) => {
      const { el } = r.words.get(step)!;
      const box = el.getBoundingClientRect();
      const start = box.left - origin;
      return { start, width: box.width, mid: middleCentre(el, box.left, box.width) - origin };
    });
  }

  function lightMiddle(r: Ribbon, step: number | null) {
    if (r.lit !== null && r.lit !== step) {
      const prev = r.words.get(r.lit);
      if (prev) replaceChildren(prev.el, ...tokenNodes(prev.tokens));
    }
    r.lit = step;
    const word = step === null ? undefined : r.words.get(step);
    if (!word) return;
    const text = joinTokens(word.tokens);
    const at = middleLetter(text);
    const end = at + (Array.from(text.slice(at))[0]?.length ?? 0);
    const mid = (...children: Child[]) => h('span', { class: 'sr-flow-mid' }, ...children);
    // An atom keeps one box around the whole word, so lighting a letter never moves the others.
    if (word.tokens.length === 1 && word.tokens[0].kind === 'atom')
      return replaceChildren(word.el, h('span', { class: 'sr-atom' }, text.slice(0, at), mid(text.slice(at, end)), text.slice(end)));
    replaceChildren(word.el, ...tokenNodes(word.tokens, 0, at), mid(...tokenNodes(word.tokens, at, end)), ...tokenNodes(word.tokens, end));
  }

  const reducedMotion = () => !!ctx.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const round = (n: number) => Math.round(n * 100) / 100;

  /** Put the current word's middle letter on the target: the shared offset, its glide, and the braces. */
  function placeRibbon(r: Ribbon, index: number, hidden: boolean) {
    r.index = index;
    r.hidden = hidden;
    const row = r.row;
    const at = r.order.indexOf(index);
    const offsets = ribbonOffsets(r.spans, at, row);
    if (!offsets || at < 0) return;
    const span = r.spans[at];
    const glide = r.x === null ? 0 : glideMs({ wpm: player.settings.wpm, distance: Math.abs(offsets.x - r.x), rowWidth: row, reducedMotion: reducedMotion() });
    r.x = offsets.x;
    r.el.style.setProperty('--sr-w', String(round(row)));
    r.el.style.setProperty('--sr-glide', `${glide}ms`);
    r.el.style.setProperty('--sr-x', String(round(offsets.x)));
    r.target.style.setProperty('--sr-target-x', String(round(row / 2 - (span.mid - span.start) - TARGET_PAD)));
    r.target.style.setProperty('--sr-target-w', String(round(span.width + 2 * TARGET_PAD)));
    r.target.hidden = hidden;
    // With the braces hidden no word is known yet, so none is lit.
    lightMiddle(r, hidden ? null : index);
  }

  /** Show the ribbon around the chunk at `index`; `hidden` hides the braces (a position no one knows yet). */
  function showFlow(index: number, hidden = false) {
    const steps = ctx.timeline.steps;
    const run = runBounds(steps, index);
    if (!run) return;
    aligned = null;
    replaceChildren(sentence);
    if (details && !details.hidden) {
      replaceChildren(details);
      details.hidden = true;
    }
    const live = ribbon && ribbon.steps === steps && ribbon.el.isConnected && display.dataset.kind === 'flow' && ribbon.run.first === run.first && ribbon.run.last === run.last;
    const win = runWindow(run, index, live ? ribbon!.window : null);
    if (!live || ribbon!.window !== win) {
      const prev = live ? ribbon : null;
      ribbon = buildRibbon(run, win);
      setDisplay('flow', ribbon.el);
      measureRibbon(ribbon);
      // A new window glides on like any step: start from where the old one stood, then move.
      if (prev && ribbon.order.includes(prev.index)) {
        placeRibbon(ribbon, prev.index, prev.hidden);
        void ribbon.el.offsetWidth;
      }
    }
    placeRibbon(ribbon!, index, hidden);
  }

  /** Measure and place the ribbon again: after a resize, or a settings change that moves the text. */
  function relayoutRibbon() {
    if (!ribbon || !ribbon.el.isConnected) return;
    measureRibbon(ribbon);
    ribbon.x = null;
    placeRibbon(ribbon, ribbon.index, ribbon.hidden);
  }

  function showChunk(step: ChunkStep, index: number) {
    if (player.settings.readingMode === 'flow') return showFlow(index);
    const tokens = step.chunk.tokens;
    const text = joinTokens(tokens);
    let split = orp(text);
    if (details && (split.before.length > 12 || split.after.length > 12)) {
      // Balance long words/identifiers across the same axis without scaling or inserting breaks.
      const chars = Array.from(text);
      const mid = Math.floor(chars.length / 2);
      split = { before: chars.slice(0, mid).join(''), pivot: chars[mid], after: chars.slice(mid + 1).join('') };
    }
    const b = split.before.length;
    const p = b + split.pivot.length;
    const before = h('span', { class: 'sr-before' }, ...tokenNodes(tokens, 0, b));
    const pivot = h('span', { class: 'sr-pivot' }, ...tokenNodes(tokens, b, p));
    const after = h('span', { class: 'sr-after' }, ...tokenNodes(tokens, p));
    const chunk = h('div', { class: 'sr-chunk', title: details ? text : null }, before, pivot, after);
    const counter =
      step.kind === 'item-chunk'
        ? h('div', { class: 'sr-item-counter' }, h('span', { class: 'sr-depth-mark' }), `item ${step.index}/${step.of}`)
        : null;
    setDisplay(step.kind, h('div', { class: 'sr-axis' }), counter, chunk);
    if (step.kind === 'item-chunk') display.style.setProperty('--sr-depth', String(step.depth));
    if (details) return;
    aligned = { chunk, before, pivot, depth: step.kind === 'item-chunk' ? step.depth : 0 };
    align();
    showSentence(step, index);
  }

  /** The chunk on show, kept so a resize can align it again. */
  let aligned: { chunk: HTMLElement; before: HTMLElement; pivot: HTMLElement; depth: number } | null = null;

  /**
   * Put the pivot on the axis; shrink the chunk (not below MIN_SCALE) when it would overflow the stage,
   * and wrap it when even that is too wide. Widths are 0 without layout.
   */
  function align() {
    if (!aligned || !aligned.chunk.isConnected) return;
    const { chunk, before, pivot, depth } = aligned;
    chunk.style.removeProperty('--sr-scale');
    delete display.dataset.wrap;
    const width = (el: Element) => (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().width : 0);
    const left = width(before);
    const pivotHalf = width(pivot) / 2;
    const total = width(chunk);
    const room = width(display);
    let shift = left + pivotHalf;
    if (room > 0 && total > 0) {
      const axisX = room * AXIS + depth * DEPTH_PX;
      let scale = Math.min(1, (axisX - EDGE_PX) / Math.max(shift, 1), (room - axisX - EDGE_PX) / Math.max(total - shift, 1));
      if (scale < 1) {
        if (scale < MIN_SCALE) {
          scale = MIN_SCALE;
          display.dataset.wrap = 'true';
        }
        chunk.style.setProperty('--sr-scale', scale.toFixed(3));
        shift = display.dataset.wrap ? 0 : shift * scale;
      }
    }
    chunk.style.setProperty('--sr-shift', `${Math.round(shift * 10) / 10}px`);
  }

  function showSentence(step: ChunkStep, index: number) {
    const steps = ctx.timeline.steps;
    let first = index;
    while (first > 0 && sameSentence(step, steps[first - 1])) first--;
    const parts: Child[] = [];
    for (let i = first; i < steps.length && (i === index || sameSentence(step, steps[i])); i++) {
      const s = steps[i] as ChunkStep;
      if (parts.length > 0) parts.push(' ');
      parts.push(h('span', { class: i === index ? 'sr-current' : null }, ...tokenNodes(s.chunk.tokens)));
    }
    replaceChildren(sentence, ...parts);
  }

  type StopStep = Extract<Step, { kind: 'stop' }>;
  type DwellStep = Extract<Step, { kind: 'dwell' }>;

  /** The prompt card of a block or inline stop. */
  function stopCard(step: StopStep) {
    const [what, ...rest] = step.prompt.split(': ');
    return card('stop', eyebrow(EXHIBIT_LABELS[step.exhibit]), title(what), rest.length > 0 ? hint(rest.join(': ')) : null);
  }

  /** The prompt card of a block or inline dwell; an inline exhibit has no block, so no alt text. */
  function dwellCard(step: DwellStep) {
    const block = step.inline ? undefined : ctx.doc.sections.find((s) => s.id === step.sectionId)?.blocks[step.blockIndex];
    const alt = block && block.kind !== 'prose' && block.kind !== 'list' ? block.meta.alt : undefined;
    return card(
      'dwell',
      eyebrow(EXHIBIT_LABELS[step.exhibit]),
      title(alt ?? `${EXHIBIT_LABELS[step.exhibit]} in the exhibit pane`),
      hint(`Showing for ${step.seconds} s · `, kbd('E'), ' to expand'),
    );
  }

  /**
   * A flow-mode stop or dwell on an inline exhibit: the ribbon stays with the chip on the target, and the
   * prompt shows beside it (the details panel), or in the status line on a reader without one.
   */
  function showInlineStop(step: StopStep | DwellStep, index: number) {
    showFlow(index - 1);
    if (details) {
      replaceChildren(details, step.kind === 'stop' ? stopCard(step) : dwellCard(step));
      details.hidden = false;
    } else inlinePrompt = step.kind === 'stop' ? step.prompt : `Showing for ${step.seconds} s: E to expand`;
  }
  /** The prompt of an inline stop on a reader without a details panel, shown in the status line. */
  let inlinePrompt: string | null = null;

  function sectionSteps(sectionId: string): Step[] {
    return ctx.timeline.steps.filter((s) => s.sectionId === sectionId);
  }

  function showStep(step: Step | EndStep, index: number) {
    if (step.kind === 'item-gap') return;
    inlinePrompt = null;
    if (step.kind === 'chunk' || step.kind === 'item-chunk') return showChunk(step, index);
    if ((step.kind === 'stop' || step.kind === 'dwell') && step.inline && player.settings.readingMode === 'flow') return showInlineStop(step, index);
    replaceChildren(sentence);
    switch (step.kind) {
      case 'chapter': {
        const { card: c } = step;
        const estimate = formatDuration(sectionEstimate(sectionSteps(step.sectionId), ctx.settings));
        return setDisplay(
          'chapter',
          card(
            'chapter',
            eyebrow('Chapter'),
            title(c.title),
            h('div', { class: 'sr-card-meta' }, `${plural(c.words, 'word')} · ${estimate}`),
            c.summary ? h('div', { class: 'sr-card-summary' }, c.summary) : null,
            c.subheadings.length > 0 ? h('ul', { class: 'sr-card-subs' }, ...c.subheadings.map((s) => h('li', {}, s))) : null,
            hint(kbd('Space'), ' to continue'),
          ),
        );
      }
      case 'title':
        return setDisplay(
          'title',
          h('div', { class: 'sr-card-title-step' }, eyebrow('Section'), title(step.text)),
        );
      case 'stop':
        return setDisplay('stop', stopCard(step));
      case 'dwell':
        return setDisplay('dwell', dwellCard(step));
      case 'list-whole': {
        const tag = step.block.ordered ? 'ol' : 'ul';
        const items = step.block.items.map((it) => {
          const li = h('li', {}, ...tokenNodes(it.sentences.flatMap((s) => s.tokens)));
          li.style.setProperty('--sr-depth', String(it.depth));
          return li;
        });
        return setDisplay(
          'list-whole',
          card('list', eyebrow(`List · ${plural(step.block.items.length, 'item')}`), h(tag, { class: 'sr-list-whole' }, ...items)),
        );
      }
      case 'end':
        return setDisplay(
          'end',
          card(
            'end',
            eyebrow('Finished'),
            title(`${plural(step.words, 'word')} in ${formatDuration(step.elapsedMs)}`),
            hint(kbd('Space'), ' to read again · ', kbd('Esc'), ' to close'),
          ),
        );
    }
  }

  function showEmpty() {
    replaceChildren(sentence);
    setDisplay('empty', card('empty', eyebrow('Speed read'), title('Nothing to read here'), hint('This content has no text, lists, code or images to read.')));
  }

  function showReady() {
    const steps = ctx.timeline.steps;
    if (steps.length === 0) return showEmpty();
    const docTitle = ctx.doc.sections.find((s) => s.heading)?.heading?.text ?? 'Ready to read';
    const words = ctx.doc.sections.reduce((n, s) => n + s.words, 0);
    replaceChildren(sentence);
    setDisplay(
      'ready',
      card(
        'ready',
        eyebrow('Speed read'),
        title(docTitle),
        h('div', { class: 'sr-card-meta' }, `${plural(words, 'word')} · ${formatDuration(sectionEstimate(steps, ctx.settings))}`),
        hint(kbd('Space'), ' to start · ', kbd('Tab'), ' normal reading · ', kbd(','), ' settings'),
      ),
    );
  }

  function renderStatus() {
    const total = ctx.timeline.steps.length;
    const pct = total === 0 ? 0 : Math.round((Math.min(player.index, total) / total) * 100);
    const signature = JSON.stringify([player.settings.wpm, player.state, pct, ctx.speech.failed, hostNote, inlinePrompt]);
    if (signature === lastStatus) return;
    lastStatus = signature;
    replaceChildren(
      status,
      h('span', { class: 'sr-status-wpm' }, `${player.settings.wpm} WPM`),
      h('span', { class: 'sr-status-sep' }, ' · '),
      h('span', { class: 'sr-status-state' }, STATE_LABELS[player.state]),
      h('span', { class: 'sr-status-sep' }, ' · '),
      h('span', { class: 'sr-status-progress' }, `${pct}%`),
      inlinePrompt ? h('span', { class: 'sr-status-note', 'data-note': 'prompt' }, inlinePrompt) : null,
      ctx.speech.failed ? h('span', { class: 'sr-status-note', title: 'Speech failed: showing text only. Try another voice in Settings.' }, 'Speech failed: showing text only') : null,
      hostNote ? h('span', { class: 'sr-status-note', 'data-note': 'host', role: 'status' }, hostNote) : null,
    );
    overallFill.style.width = `${pct}%`;
  }
  let lastStatus = '';

  /** Speech without word boundaries: the sentence's chunks together, wrapped. */
  function showWhole({ from, to }: { from: number; to: number }) {
    if (details && player.settings.readingMode !== 'flow') return; // Keep browser chunk semantics outside flow mode.
    inlinePrompt = null;
    // Flow: the ribbon holds at the sentence's first word, with the braces hidden, until a word is known.
    if (player.settings.readingMode === 'flow' && isChunk(ctx.timeline.steps[from])) return showFlow(from, true);
    const tokens = ctx.timeline.steps.slice(from, to + 1).flatMap((s) => (isChunk(s) ? s.chunk.tokens : []));
    aligned = null;
    setDisplay('whole', h('div', { class: 'sr-chunk sr-chunk-whole' }, ...tokenNodes(tokens)));
    display.dataset.wrap = 'true';
    // The stage already shows the whole sentence: no second copy below it (p5b-r6).
    replaceChildren(sentence);
  }

  let shown = false;
  const off = [
    player.on('whole', showWhole),
    player.on('step', (e: StepEvent) => {
      shown = true;
      if (ctx.timeline.steps.length === 0) showEmpty();
      else showStep(e.step, e.index);
      renderStatus();
    }),
    player.on('state', renderStatus),
    player.on('settings', () => {
      syncMode();
      renderStatus();
    }),
    ctx.speech.onVoices(renderStatus),
  ];
  /** The reader's reading mode as an attribute, for the stylesheet (the flow window is wider). */
  function syncMode() {
    ctx.reader.dataset.readingMode = player.settings.readingMode;
    syncInset();
  }
  /**
   * In the docked panel the contents sidebar overlays the stage's left edge: a flow stage starts at its right edge
   * (`--sr-flow-inset`), so the target is centred in the visible area. No sidebar showing, no inset.
   */
  function syncInset() {
    const root = ctx.reader;
    let inset = 0;
    const outline = root.querySelector<HTMLElement>('.sr-outline');
    if (outline && root.hasAttribute('data-bottom-stage') && root.dataset.layout === 'panel' && root.dataset.readingMode === 'flow') {
      const box = outline.getBoundingClientRect();
      if (box.width > 0 && getComputedStyle(outline).display !== 'none') inset = Math.max(0, box.right - root.getBoundingClientRect().left);
    }
    const value = inset > 0 ? `${Math.round(inset)}px` : '';
    if (root.style.getPropertyValue('--sr-flow-inset') === value) return false;
    if (value) root.style.setProperty('--sr-flow-inset', value);
    else root.style.removeProperty('--sr-flow-inset');
    return true;
  }
  syncMode();
  showReady();
  renderStatus();
  const Observer = (ctx.document.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver ?? globalThis.ResizeObserver;
  const resize = Observer
    ? new Observer(() => {
        if (!details) align();
        syncInset();
        relayoutRibbon();
      })
    : null;
  resize?.observe(stage);
  resize?.observe(ctx.reader);
  // Opening or closing the contents drawer changes the inset without resizing anything we watch.
  const MutationWatcher = (ctx.document.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
  const drawer = MutationWatcher
    ? new MutationWatcher(() => {
        if (syncInset()) relayoutRibbon();
      })
    : null;
  drawer?.observe(ctx.reader, { attributes: true, subtree: true, attributeFilter: ['data-drawer', 'data-outline'] });

  return {
    wheel: dial.wheel,
    note(text) {
      if (text === hostNote) return;
      hostNote = text;
      renderStatus();
    },
    refresh() {
      syncMode();
      ribbon = null;
      if (!shown) showReady();
      renderStatus();
    },
    destroy() {
      for (const o of off) o();
      dial.destroy();
      resize?.disconnect();
      drawer?.disconnect();
    },
  };
}
