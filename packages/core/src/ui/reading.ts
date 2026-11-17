import type { SourceRef } from '../model';
import type { PlayerState } from '../player';
import type { ReaderContext, Zone } from './context';
import type { HostDocument } from './host';

export interface ReadingElements {
  reading: HTMLElement;
  layout: HTMLElement;
}

const CURRENT = 'sr-reading-current';

/** Normal reading (Tab): the host's document in place of stage and pane, marked at the position. */
export function createReading(ctx: ReaderContext, { reading, layout }: ReadingElements): Zone {
  const { host, player } = ctx;
  let open: { doc: HostDocument; sources: Set<Element> } | null = null;
  let marked: Element | null = null;
  let position: SourceRef | null = null;

  function mark(ref: SourceRef | null | undefined) {
    if (!open || !ref) return;
    marked?.classList.remove(CURRENT);
    marked = open.doc.locate(ref);
    if (!marked) return;
    marked.classList.add(CURRENT);
    if (typeof marked.scrollIntoView === 'function') marked.scrollIntoView({ block: 'center' });
  }

  function enter() {
    const doc = host.document();
    const sources = new Set<Element>();
    for (const step of ctx.timeline.steps) if (step.source.element) sources.add(step.source.element);
    open = { doc, sources };
    reading.append(doc.node);
    reading.hidden = false;
    layout.dataset.mode = 'reading';
    mark(position ?? ctx.timeline.steps[player.index]?.source);
  }

  function leave() {
    if (!open) return;
    const { doc } = open;
    open = null;
    marked?.classList.remove(CURRENT);
    marked = null;
    doc.node.parentNode?.removeChild(doc.node);
    host.release(doc.node);
    reading.hidden = true;
    delete layout.dataset.mode;
  }

  /** Move the position to the innermost block holding the pressed element. */
  function onPress(event: Event) {
    if (!open) return;
    for (let el = event.target as Element | null; el && el !== reading; el = el.parentElement) {
      const ref = open.doc.refAt(el);
      if (ref?.element && open.sources.has(ref.element)) return player.jumpToBlock(ref);
    }
  }

  const off = [
    player.on('state', (state: PlayerState) => (state === 'reading' ? !open && enter() : leave())),
    player.on('position', (e) => {
      position = e.source;
      mark(e.source);
    }),
  ];
  reading.addEventListener('click', onPress);

  return {
    destroy() {
      for (const o of off) o();
      reading.removeEventListener('click', onPress);
      leave();
    },
  };
}
