import type { Token } from '../model';
import { sectionEstimate } from '../pacing';
import type { EndStep, PlayerState, StepEvent } from '../player';
import { joinTokens } from '../text/chunks';
import { orp } from '../text/orp';
import type { Step } from '../timeline';
import type { ReaderContext, Zone } from './context';
import { replaceChildren, type Child } from './dom';
import { EXHIBIT_LABELS, formatDuration, plural } from './format';

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

const isChunk = (step: Step): step is ChunkStep => step.kind === 'chunk' || step.kind === 'item-chunk';
const sameSentence = (a: ChunkStep, b: Step) =>
  isChunk(b) && b.kind === a.kind && b.source === a.source && b.sentenceIndex === a.sentenceIndex;

export interface StageElements {
  stage: HTMLElement;
  status: HTMLElement;
  overallFill: HTMLElement;
}

/** The stage: the current chunk on the pivot axis, the faded sentence, cards, and the status line. */
export function createStage(ctx: ReaderContext, { stage, status, overallFill }: StageElements): Zone {
  const { h, player } = ctx;
  const display = h('div', { class: 'sr-display', 'aria-live': 'off' });
  const sentence = h('div', { class: 'sr-sentence', 'aria-hidden': 'true' });
  stage.append(display, sentence);

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
    display.style.removeProperty('--sr-depth');
    replaceChildren(display, ...children);
  }

  function card(kind: string, ...children: Child[]) {
    return h('div', { class: `sr-card sr-card-${kind}` }, ...children);
  }

  function showChunk(step: ChunkStep, index: number) {
    const tokens = step.chunk.tokens;
    const text = joinTokens(tokens);
    const split = orp(text);
    const b = split.before.length;
    const p = b + split.pivot.length;
    const before = h('span', { class: 'sr-before' }, ...tokenNodes(tokens, 0, b));
    const pivot = h('span', { class: 'sr-pivot' }, ...tokenNodes(tokens, b, p));
    const after = h('span', { class: 'sr-after' }, ...tokenNodes(tokens, p));
    const chunk = h('div', { class: 'sr-chunk' }, before, pivot, after);
    const counter =
      step.kind === 'item-chunk'
        ? h('div', { class: 'sr-item-counter' }, h('span', { class: 'sr-depth-mark' }), `item ${step.index}/${step.of}`)
        : null;
    setDisplay(step.kind, h('div', { class: 'sr-axis' }), counter, chunk);
    if (step.kind === 'item-chunk') display.style.setProperty('--sr-depth', String(step.depth));
    align(chunk, before, pivot);
    showSentence(step, index);
  }

  /** Put the pivot on the axis; shrink the chunk when it would overflow the stage. Widths are 0 without layout. */
  function align(chunk: HTMLElement, before: HTMLElement, pivot: HTMLElement) {
    chunk.style.removeProperty('--sr-scale');
    const width = (el: Element) => (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().width : 0);
    const left = width(before);
    const pivotHalf = width(pivot) / 2;
    const total = width(chunk);
    const room = width(display);
    let shift = left + pivotHalf;
    if (room > 0 && total > 0) {
      const axisX = room * AXIS;
      const scale = Math.min(1, (axisX - EDGE_PX) / Math.max(shift, 1), (room - axisX - EDGE_PX) / Math.max(total - shift, 1));
      if (scale < 1) {
        chunk.style.setProperty('--sr-scale', scale.toFixed(3));
        shift *= scale;
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

  function sectionSteps(sectionId: string): Step[] {
    return ctx.timeline.steps.filter((s) => s.sectionId === sectionId);
  }

  function showStep(step: Step | EndStep, index: number) {
    if (step.kind === 'item-gap') return;
    if (step.kind === 'chunk' || step.kind === 'item-chunk') return showChunk(step, index);
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
      case 'stop': {
        const [what, ...rest] = step.prompt.split(': ');
        return setDisplay(
          'stop',
          card(
            'stop',
            eyebrow(EXHIBIT_LABELS[step.exhibit]),
            title(what),
            rest.length > 0 ? hint(rest.join(': ')) : null,
          ),
        );
      }
      case 'dwell': {
        const block = ctx.doc.sections.find((s) => s.id === step.sectionId)?.blocks[step.blockIndex];
        const alt = block && block.kind !== 'prose' && block.kind !== 'list' ? block.meta.alt : undefined;
        return setDisplay(
          'dwell',
          card(
            'dwell',
            eyebrow(EXHIBIT_LABELS[step.exhibit]),
            title(alt ?? `${EXHIBIT_LABELS[step.exhibit]} in the exhibit pane`),
            hint(`Showing for ${step.seconds} s · `, kbd('E'), ' to expand'),
          ),
        );
      }
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

  function showReady() {
    const steps = ctx.timeline.steps;
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
    replaceChildren(
      status,
      h('span', { class: 'sr-status-wpm' }, `${player.settings.wpm} WPM`),
      h('span', { class: 'sr-status-sep' }, ' · '),
      h('span', { class: 'sr-status-state' }, STATE_LABELS[player.state]),
      h('span', { class: 'sr-status-sep' }, ' · '),
      h('span', { class: 'sr-status-progress' }, `${pct}%`),
    );
    overallFill.style.width = `${pct}%`;
  }

  let shown = false;
  const off = [
    player.on('step', (e: StepEvent) => {
      shown = true;
      showStep(e.step, e.index);
      renderStatus();
    }),
    player.on('state', renderStatus),
    player.on('settings', renderStatus),
  ];
  showReady();
  renderStatus();

  return {
    refresh() {
      if (!shown) showReady();
      renderStatus();
    },
    destroy() {
      for (const o of off) o();
    },
  };
}
