/**
 * The narrow exhibit push (spec section 13, R28): under the narrow width the exhibit card sits above
 * the stage, as tall as its content up to the room available, and the stage moves down to make room.
 * The numbers go to CSS custom properties on the reader; the stylesheet animates them (400 ms ease).
 */
import { WIDE_MIN_PX } from './styles';

/** Gap between the exhibit card and the stage, and between the floating stage and the reader edge. */
export const PUSH_GAP_PX = 12;
/** Distance of the floating exhibit card from the reader top. */
const FLOATING_CARD_TOP_PX = 8;
/** Distance of the panel's exhibit card below the toolbar. */
const PANEL_CARD_GAP_PX = 8;
/** Where the floating stage's centre rests, as a fraction of the reader height (matches the wide 56 %). */
const FLOATING_REST = 0.56;

export interface PushInput {
  /** Card top, px from the reader top. */
  cardTop: number;
  /** The card's content height (what it needs). */
  cardHeight: number;
  /** Whether the card shows anything. */
  shown: boolean;
  /** The stage top with no card, px from the reader top. */
  resting: number;
  stageHeight: number;
  /** Lowest allowed stage bottom, px from the reader top. */
  floor: number;
}

/** Where the stage's top goes, and the card's maximum height. */
export function stagePush(i: PushInput): { top: number; cardMax: number } {
  const lowest = Math.max(0, i.floor - i.stageHeight);
  const cardMax = Math.max(0, lowest - PUSH_GAP_PX - i.cardTop);
  let top = i.resting;
  if (i.shown) top = Math.max(top, i.cardTop + Math.min(i.cardHeight, cardMax) + PUSH_GAP_PX);
  return { top: Math.max(0, Math.min(top, lowest)), cardMax };
}

export interface LayoutElements {
  reader: HTMLElement;
  floating: boolean;
  /** The floating stage card. */
  main: HTMLElement;
  /** The panel's stage region. */
  stage: HTMLElement;
  /** The overall progress line: the panel stage's resting top is its bottom. */
  overall: HTMLElement;
  exhibits: HTMLElement;
  list: HTMLElement;
}

const PROPS = ['--sr-stage-top', '--sr-stage-push', '--sr-exhibit-top', '--sr-exhibit-max', '--sr-exhibit-height'];

/** What the panel's stage needs: its children's extent plus its padding. */
function contentHeight(stage: HTMLElement): number {
  const kids = [...stage.children].filter((k) => (k as HTMLElement).offsetHeight > 0 || k.getBoundingClientRect().height > 0);
  if (kids.length === 0) return stage.offsetHeight;
  const top = kids[0].getBoundingClientRect().top;
  const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
  const style = stage.ownerDocument.defaultView?.getComputedStyle(stage);
  const pad = (parseFloat(style?.paddingTop ?? '') || 0) + (parseFloat(style?.paddingBottom ?? '') || 0);
  return bottom - top + pad;
}

/** The unobstructed band above the stage, and the stage's bottom, in viewport px. */
export interface FreeBand {
  top: number;
  bottom: number;
  below: number;
}

export function createLayout(el: LayoutElements): { update(): void; freeBand(): FreeBand; destroy(): void } {
  const { reader } = el;
  const px = (n: number) => `${Math.round(n)}px`;

  function clear() {
    for (const p of PROPS) reader.style.removeProperty(p);
  }

  function update() {
    const box = reader.getBoundingClientRect();
    if (box.width === 0 || box.width >= WIDE_MIN_PX) return clear();
    const shown = !el.exhibits.hasAttribute('data-empty');
    // What the card needs: its head, its whole list, its border (its own height is animated).
    const head = el.exhibits.querySelector<HTMLElement>('.sr-exhibits-head');
    const cardHeight = (head?.offsetHeight ?? 0) + el.list.scrollHeight + 2;
    const height = (max: number) => reader.style.setProperty('--sr-exhibit-height', px(shown ? Math.min(cardHeight, max) : 0));
    if (el.floating) {
      const stageHeight = el.main.offsetHeight;
      const floor = box.height - PUSH_GAP_PX;
      const resting = Math.max(FLOATING_CARD_TOP_PX, Math.min(box.height * FLOATING_REST - stageHeight / 2, floor - stageHeight));
      const r = stagePush({ cardTop: FLOATING_CARD_TOP_PX, cardHeight, shown, resting, stageHeight, floor });
      reader.style.setProperty('--sr-stage-top', px(r.top));
      reader.style.setProperty('--sr-exhibit-top', px(FLOATING_CARD_TOP_PX));
      reader.style.setProperty('--sr-exhibit-max', px(r.cardMax));
      height(r.cardMax);
      return;
    }
    const resting = el.overall.getBoundingClientRect().bottom - box.top;
    const cardTop = resting + PANEL_CARD_GAP_PX;
    const r = stagePush({ cardTop, cardHeight, shown, resting, stageHeight: contentHeight(el.stage), floor: box.height });
    reader.style.setProperty('--sr-stage-push', px(r.top - resting));
    reader.style.setProperty('--sr-exhibit-top', px(cardTop));
    reader.style.setProperty('--sr-exhibit-max', px(r.cardMax));
    height(r.cardMax);
  }

  function freeBand(): FreeBand {
    const box = reader.getBoundingClientRect();
    const stage = (el.floating ? el.main : el.stage).getBoundingClientRect();
    const narrow = box.width > 0 && box.width < WIDE_MIN_PX;
    const above = narrow && !el.exhibits.hasAttribute('data-empty') ? el.exhibits.getBoundingClientRect().bottom : box.top;
    return { top: above, bottom: stage.top, below: stage.bottom };
  }

  const win = reader.ownerDocument.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver; MutationObserver?: typeof MutationObserver }) | null;
  const Resize = win?.ResizeObserver ?? globalThis.ResizeObserver;
  const Mutation = win?.MutationObserver ?? globalThis.MutationObserver;
  const resize = Resize ? new Resize(() => update()) : null;
  for (const target of [reader, el.main, el.stage, el.exhibits, el.list]) resize?.observe(target);
  const observeItems = () => {
    for (const item of el.list.children) resize?.observe(item);
  };
  const mutation = Mutation
    ? new Mutation(() => {
        observeItems();
        update();
      })
    : null;
  mutation?.observe(el.list, { childList: true });
  mutation?.observe(el.exhibits, { attributes: true, attributeFilter: ['data-empty'] });
  update();

  return {
    update,
    freeBand,
    destroy() {
      resize?.disconnect();
      mutation?.disconnect();
      clear();
    },
  };
}
