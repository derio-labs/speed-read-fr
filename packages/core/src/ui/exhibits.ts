import type { ExhibitBlock } from '../model';
import type { StepEvent } from '../player';
import type { StepPosition, TimelineExhibit } from '../timeline';
import type { ReaderContext, Zone } from './context';
import { icon, ICONS } from './dom';
import { EXHIBIT_LABELS, plural } from './format';

/** What the caption says about an exhibit, e.g. "24 lines · ts". */
function details(block: ExhibitBlock): string {
  const m = block.meta;
  const parts: string[] = [];
  if (m.lines !== undefined) parts.push(plural(m.lines, 'line'));
  if (m.language) parts.push(m.language);
  if (m.rows !== undefined && m.cols !== undefined) parts.push(`${plural(m.rows, 'row')} × ${plural(m.cols, 'column')}`);
  if (m.alt) parts.push(m.alt);
  return parts.join(' · ');
}

export interface ExhibitElements {
  pane: HTMLElement;
  /** The reader's layout root; the expanded view covers it (spec section 13, p3-r18). */
  root: HTMLElement;
}

export interface ExhibitZone extends Zone {
  isExpanded(): boolean;
  closeExpanded(): void;
}

interface Shown {
  item: HTMLElement;
  node: Node;
}

/** The exhibit pane (revealed non-prose blocks of the current section) and the expanded view (E). */
export function createExhibits(ctx: ReaderContext, { pane, root }: ExhibitElements): ExhibitZone {
  const { h, host, player } = ctx;
  const list = h('div', { class: 'sr-exhibit-list' });
  const empty = h('p', { class: 'sr-exhibits-empty' }, 'Code, tables, formulas and images in this section appear here as you reach them.');
  list.append(empty);
  pane.append(h('div', { class: 'sr-exhibits-head', 'aria-hidden': 'true' }, 'Exhibits'), list);

  let shownSection: string | null = null;
  const shown = new Map<number, Shown>();
  let expanded: { overlay: HTMLElement; node: Node } | null = null;

  function caption(block: ExhibitBlock) {
    return h('figcaption', { class: 'sr-exhibit-caption' }, h('span', { class: 'sr-exhibit-kind' }, EXHIBIT_LABELS[block.kind]), h('span', {}, details(block)));
  }

  function clear() {
    for (const { item, node } of shown.values()) {
      item.remove();
      host.release(node);
    }
    shown.clear();
  }

  function add(exhibit: TimelineExhibit) {
    const node = host.exhibit(exhibit.block, 'pane');
    const item = h('figure', { class: 'sr-exhibit', 'data-block': exhibit.blockIndex, 'data-kind': exhibit.block.kind }, caption(exhibit.block), h('div', { class: 'sr-exhibit-body' }, node));
    const next = [...shown.entries()].filter(([at]) => at > exhibit.blockIndex).sort(([a], [b]) => a - b)[0];
    list.insertBefore(item, next ? next[1].item : null);
    shown.set(exhibit.blockIndex, { item, node });
  }

  function sync(sectionId: string | undefined, active: number | null) {
    if (sectionId !== shownSection) {
      clear();
      shownSection = sectionId ?? null;
    }
    if (sectionId !== undefined) {
      for (const exhibit of player.revealedExhibits(sectionId)) if (!shown.has(exhibit.blockIndex)) add(exhibit);
    }
    for (const [at, { item }] of shown) {
      if (at === active) {
        item.setAttribute('aria-current', 'true');
        reveal(item);
      } else item.removeAttribute('aria-current');
    }
    empty.hidden = shown.size > 0;
    pane.toggleAttribute('data-empty', shown.size === 0);
  }

  /** Scroll the pane's own list (never an ancestor) so the item's caption is in view. */
  function reveal(item: HTMLElement) {
    const view = list.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.top >= view.top && box.bottom <= view.bottom) return;
    list.scrollTop += box.top - view.top - 8;
  }

  function onStep({ step }: StepEvent) {
    if (step.kind === 'end') return sync(ctx.timeline.sections[ctx.timeline.sections.length - 1]?.id, null);
    sync(step.sectionId, step.kind === 'stop' || step.kind === 'dwell' ? step.blockIndex : null);
  }

  function closeExpanded() {
    if (!expanded) return;
    const { overlay, node } = expanded;
    expanded = null;
    overlay.remove();
    host.release(node);
    ctx.reader.focus({ preventScroll: true });
  }

  function openExpanded(at: StepPosition) {
    const exhibit = ctx.timeline.sections.find((s) => s.id === at.sectionId)?.exhibits.find((e) => e.blockIndex === at.blockIndex);
    if (!exhibit) return;
    closeExpanded();
    const block = exhibit.block;
    const node = host.exhibit(block, 'expanded');
    const close = h('button', { type: 'button', class: 'sr-icon-button', 'aria-label': 'Close exhibit', title: 'Close (E or Esc)' }, icon(ctx.document, ICONS.close));
    close.addEventListener('click', closeExpanded);
    const label = [EXHIBIT_LABELS[block.kind], details(block)].filter(Boolean).join(' · ');
    const overlay = h(
      'div',
      { class: 'sr-expanded', role: 'dialog', 'aria-label': `${EXHIBIT_LABELS[block.kind]}, expanded` },
      h('div', { class: 'sr-expanded-head' }, h('span', { class: 'sr-expanded-title' }, label), h('span', {}, 'E or Esc to close'), close),
      h('div', { class: 'sr-expanded-body' }, node),
    );
    root.append(overlay);
    expanded = { overlay, node };
  }

  const off = [player.on('step', onStep), player.on('expand', openExpanded)];
  sync(ctx.timeline.steps[player.index]?.sectionId, null);

  return {
    refresh() {
      const step = ctx.timeline.steps[player.index];
      sync(step?.sectionId, null);
    },
    isExpanded: () => expanded !== null,
    closeExpanded,
    destroy() {
      for (const o of off) o();
      closeExpanded();
      clear();
    },
  };
}
