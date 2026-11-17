import type { SourceRef } from '../model';
import type { PlayerState } from '../player';
import type { ReaderContext, Zone } from './context';
import type { HostDocument } from './host';

export interface ReadingElements {
  reading: HTMLElement;
  layout: HTMLElement;
}

const CURRENT_ATTR = 'data-sr-current';
const FALLBACK_LINE = '#2f63c9';

/** A reader colour resolved to a value usable in an inline style (custom properties do not reach slotted content). */
function resolveColour(reader: HTMLElement, property: string, fallback: string): string {
  const value = reader.ownerDocument.defaultView?.getComputedStyle(reader).getPropertyValue(property).trim() ?? '';
  return value && !value.startsWith('var(') ? value : fallback;
}

/** Normal reading (Tab): the host's document in place of stage and pane, marked at the position. */
export function createReading(ctx: ReaderContext, { reading, layout }: ReadingElements): Zone {
  const { host, player } = ctx;
  let open: { doc: HostDocument; sources: Set<Element> } | null = null;
  let marked: { el: HTMLElement; style: string | null } | null = null;
  let position: SourceRef | null = null;
  // Outline only: a background fill would replace the page's own (a dark code block on a light tint).
  const colours = { line: resolveColour(ctx.reader, '--sr-progress', FALLBACK_LINE) };

  /**
   * The mark is inline style plus an attribute on the host's element, so it shows whatever tree the
   * node lives in (a slotted light-DOM clone is out of reach of the reader's sheet). The element's own
   * style attribute is restored exactly when the mark moves or reading ends.
   */
  function unmark() {
    if (!marked) return;
    const { el, style } = marked;
    marked = null;
    if (style === null) el.removeAttribute('style');
    else el.setAttribute('style', style);
    el.removeAttribute(CURRENT_ATTR);
  }

  function mark(ref: SourceRef | null | undefined) {
    if (!open || !ref) return;
    unmark();
    const el = open.doc.locate(ref) as HTMLElement | null;
    if (!el?.style) return;
    marked = { el, style: el.getAttribute('style') };
    el.setAttribute(CURRENT_ATTR, '');
    el.style.setProperty('outline-width', '2px');
    el.style.setProperty('outline-style', 'solid');
    el.style.setProperty('outline-color', colours.line);
    el.style.setProperty('outline-offset', '4px');
    el.style.setProperty('border-radius', '4px');
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
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
    unmark();
    doc.node.parentNode?.removeChild(doc.node);
    host.release(doc.node);
    reading.hidden = true;
    delete layout.dataset.mode;
  }

  /** Move the position to the innermost block holding the pressed element. */
  function onPress(event: Event) {
    if (!ctx.accepts(event) || !open) return;
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
