import type { ExhibitBlock } from '../model';
import type { StepEvent } from '../player';
import { exhibitKey, exhibitKind, type StepPosition, type TimelineExhibit } from '../timeline';
import type { ReaderContext, Zone } from './context';
import { icon, ICONS } from './dom';
import { chipLabel, EXHIBIT_LABELS, plural } from './format';

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

/** An exhibit's kind label; an inline one carries its chip number ("Code 2"). */
const exhibitLabel = (exhibit: TimelineExhibit): string => (exhibit.inline ? chipLabel(exhibit.kind, exhibit.chip) : EXHIBIT_LABELS[exhibitKind(exhibit)]);

/** What the caption says about an exhibit of either kind. */
function exhibitDetails(exhibit: TimelineExhibit): string {
  return exhibit.inline ? `inline · ${plural(exhibit.text.length, 'character')}` : details(exhibit.block);
}

/** Sort position of an exhibit: its block, then its place within it. */
const position = (exhibit: TimelineExhibit): [number, number] => [exhibit.blockIndex, exhibit.inline ? exhibit.inlineIndex : 0];
const before = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

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
  /** The node came from the host and goes back to it; an inline exhibit's own node does not. */
  hosted: boolean;
  at: [number, number];
}

/** The exhibit pane (revealed non-prose blocks of the current section) and the expanded view (E). */
export function createExhibits(ctx: ReaderContext, { pane, root }: ExhibitElements): ExhibitZone {
  const { h, host, player } = ctx;
  const list = h('div', { class: 'sr-exhibit-list' });
  const empty = h('p', { class: 'sr-exhibits-empty' }, 'Code, tables, formulas and images in this section appear here as you reach them.');
  list.append(empty);
  pane.append(h('div', { class: 'sr-exhibits-head', 'aria-hidden': 'true' }, 'Exhibits'), list);

  let shownSection: string | null = null;
  const shown = new Map<string, Shown>();
  let expanded: { overlay: HTMLElement; node: Node; hosted: boolean } | null = null;

  function caption(exhibit: TimelineExhibit) {
    return h('figcaption', { class: 'sr-exhibit-caption' }, h('span', { class: 'sr-exhibit-kind' }, exhibitLabel(exhibit)), h('span', {}, exhibitDetails(exhibit)));
  }

  /** The exhibit's content: an inline one is the atom's text, built here; a block is the host's to render. */
  function content(exhibit: TimelineExhibit, use: 'pane' | 'expanded'): { node: Node; hosted: boolean } {
    if (exhibit.inline) return { node: h('pre', { class: 'sr-inline-exhibit' }, h('code', {}, exhibit.text)), hosted: false };
    return { node: host.exhibit(exhibit.block, use), hosted: true };
  }

  function discard({ node, hosted }: { node: Node; hosted: boolean }) {
    if (hosted) host.release(node);
  }

  function clear() {
    for (const { item, ...rest } of shown.values()) {
      item.remove();
      discard(rest);
    }
    shown.clear();
  }

  function add(exhibit: TimelineExhibit) {
    const { node, hosted } = content(exhibit, 'pane');
    const key = exhibitKey(exhibit);
    const item = h(
      'figure',
      { class: 'sr-exhibit', 'data-block': exhibit.blockIndex, 'data-key': key, 'data-kind': exhibitKind(exhibit) },
      caption(exhibit),
      h('div', { class: 'sr-exhibit-body' }, node),
    );
    const at = position(exhibit);
    const next = [...shown.values()].filter((o) => before(at, o.at)).sort((a, b) => (before(a.at, b.at) ? -1 : 1))[0];
    list.insertBefore(item, next ? next.item : null);
    shown.set(key, { item, node, hosted, at });
  }

  function sync(sectionId: string | undefined, active: string | null) {
    if (sectionId !== shownSection) {
      clear();
      shownSection = sectionId ?? null;
    }
    if (sectionId !== undefined) {
      const revealed = player.revealedExhibits(sectionId);
      // A rebuilt timeline may no longer hold an exhibit (flow's inline ones in chunk mode): drop its card.
      const keys = new Set(revealed.map(exhibitKey));
      for (const [key, entry] of shown) {
        if (keys.has(key)) continue;
        entry.item.remove();
        discard(entry);
        shown.delete(key);
      }
      for (const exhibit of revealed) if (!shown.has(exhibitKey(exhibit))) add(exhibit);
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
    sync(step.sectionId, step.kind === 'stop' || step.kind === 'dwell' ? exhibitKey(step) : null);
  }

  function closeExpanded() {
    if (!expanded) return;
    const { overlay, ...content } = expanded;
    expanded = null;
    overlay.remove();
    discard(content);
    ctx.reader.focus({ preventScroll: true });
  }

  function openExpanded(at: StepPosition & { inlineIndex?: number }) {
    const key = exhibitKey(at);
    const exhibit = ctx.timeline.sections.find((s) => s.id === at.sectionId)?.exhibits.find((e) => exhibitKey(e) === key);
    if (!exhibit) return;
    closeExpanded();
    const kind = exhibitKind(exhibit);
    const { node, hosted } = content(exhibit, 'expanded');
    const close = h('button', { type: 'button', class: 'sr-icon-button', 'aria-label': 'Close exhibit', title: 'Close (E or Esc)' }, icon(ctx.document, ICONS.close));
    close.addEventListener('click', closeExpanded);
    const label = [exhibitLabel(exhibit), exhibitDetails(exhibit)].filter(Boolean).join(' · ');
    const overlay = h(
      'div',
      { class: 'sr-expanded', role: 'dialog', 'aria-label': `${EXHIBIT_LABELS[kind]}, expanded` },
      h('div', { class: 'sr-expanded-head' }, h('span', { class: 'sr-expanded-title' }, label), h('span', {}, 'E or Esc to close'), close),
      h('div', { class: 'sr-expanded-body' }, node),
    );
    root.append(overlay);
    expanded = { overlay, node, hosted };
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
