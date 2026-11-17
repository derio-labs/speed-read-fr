/**
 * Fit math and diagram exhibits to the exhibit pane (the clones the webview host returns). A display
 * equation is scaled down to the pane width, never below 0.6; past that it scrolls sideways with a
 * fade on the clipped side. A diagram is scaled to the pane's width and height cap, never below 0.5
 * of its natural size; past that the exhibit scrolls and its header says "E to expand".
 */
import { WIDE_MIN_PX } from '@speed-read/core';

export const MIN_MATH_SCALE = 0.6;
export const MIN_DIAGRAM_SCALE = 0.5;
/** Diagram height cap in the pane, as a share of the window height: beside the stage, and below it. */
const DIAGRAM_CAP_WIDE = 0.45;
const DIAGRAM_CAP_NARROW = 0.24;

/** The exhibit pane CSS for what `fitExhibit` sets. */
export const FIT_CSS = `
.sr-md .katex-display[data-clip="right"] { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
.sr-md .katex-display[data-clip="left"] { -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to left, #000 calc(100% - 32px), transparent); }
.sr-md .katex-display[data-clip="both"] { -webkit-mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent); }
.sr-exhibit-body .sr-md .mermaid svg[data-fitted] { display: block; margin: 0 auto; max-width: none; }
.sr-expand-hint { font-weight: 500; color: var(--sr-muted); white-space: nowrap; }
`;

const round = (scale: number) => Math.floor(scale * 1000) / 1000;
/** An overflow this small (sub-pixel and one-pixel rounding of font metrics) counts as fitting. */
export const FIT_TOLERANCE_PX = 1;
/** Rounds of re-measuring a zoomed equation that still overflows. */
const REFIT_ROUNDS = 4;

/**
 * The zoom that fits an equation `natural` px wide into `available` px: 1 when it overflows by at most
 * a pixel, else the scaled width at most `available - 1` px, floored to 3 decimals, never below
 * `MIN_MATH_SCALE`.
 */
export function mathScale(natural: number, available: number): number {
  if (natural <= available + FIT_TOLERANCE_PX) return 1;
  return Math.max(MIN_MATH_SCALE, Math.min(1, round((available - FIT_TOLERANCE_PX) / natural)));
}

/** Whether `el` overflows sideways by more than the tolerance. */
const overflows = (el: HTMLElement) => el.scrollWidth > el.clientWidth + FIT_TOLERANCE_PX;

/** Mark which side of a scrolled equation is clipped (for the edge fade). */
function updateClip(display: HTMLElement) {
  const { scrollLeft, scrollWidth, clientWidth } = display;
  let clip = '';
  if (scrollWidth > clientWidth + FIT_TOLERANCE_PX) {
    const atStart = scrollLeft <= 1;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
    clip = atStart ? 'right' : atEnd ? 'left' : 'both';
  }
  if (clip) display.dataset.clip = clip;
  else delete display.dataset.clip;
}

export function fitMath(wrapper: HTMLElement) {
  for (const display of wrapper.querySelectorAll<HTMLElement>('.katex-display')) {
    display.style.zoom = '';
    // KaTeX makes `.katex` a block here, so the formula's own width is the display's scroll width.
    const natural = display.scrollWidth;
    const available = display.clientWidth;
    if (!natural || !available) continue;
    let scale = mathScale(natural, available);
    // Text does not scale exactly with zoom (glyph metrics round per size): measure again, in the
    // zoomed element's own units, and shrink a little more while it still overflows.
    for (let i = 0; i < REFIT_ROUNDS && scale < 1; i++) {
      display.style.zoom = String(scale);
      if (!overflows(display) || scale <= MIN_MATH_SCALE) break;
      scale = Math.max(MIN_MATH_SCALE, round((scale * (display.clientWidth - FIT_TOLERANCE_PX)) / display.scrollWidth));
    }
    display.style.zoom = scale < 1 ? String(scale) : '';
    updateClip(display);
  }
}

function setHint(wrapper: HTMLElement, show: boolean) {
  const caption = wrapper.closest('.sr-exhibit')?.querySelector('.sr-exhibit-caption');
  const hint = caption?.querySelector('.sr-expand-hint');
  if (show && caption && !hint) {
    const span = wrapper.ownerDocument.createElement('span');
    span.className = 'sr-expand-hint';
    span.textContent = 'E to expand';
    caption.append(span);
  } else if (!show) hint?.remove();
}

function fitDiagram(wrapper: HTMLElement) {
  const svg = wrapper.querySelector<SVGSVGElement>('.mermaid svg');
  const view = svg?.viewBox?.baseVal;
  if (!svg || !view || !view.width || !view.height) return;
  const win = wrapper.ownerDocument.defaultView as Window;
  const reader = wrapper.closest<HTMLElement>('.sr-reader');
  const narrow = (reader?.clientWidth ?? win.innerWidth) < WIDE_MIN_PX;
  const available = wrapper.clientWidth;
  if (!available) return;
  const cap = win.innerHeight * (narrow ? DIAGRAM_CAP_NARROW : DIAGRAM_CAP_WIDE);
  const fitting = Math.min(1, available / view.width, cap / view.height);
  const scale = Math.max(MIN_DIAGRAM_SCALE, fitting);
  svg.dataset.fitted = '';
  svg.style.width = `${view.width * scale}px`;
  svg.style.height = `${view.height * scale}px`;
  setHint(wrapper, fitting < MIN_DIAGRAM_SCALE);
}

/**
 * Fit an exhibit node shown in the pane, now and whenever its width or the window changes. Returns
 * the cleanup to call when the node is released.
 */
export function fitExhibit(node: Node, kind: string): () => void {
  if (!(kind === 'math' || kind === 'diagram') || !(node instanceof HTMLElement)) return () => {};
  const win = node.ownerDocument.defaultView;
  if (!win || typeof win.ResizeObserver !== 'function') return () => {};
  const fit = kind === 'math' ? fitMath : fitDiagram;
  let width = -1;
  const observer = new win.ResizeObserver(() => {
    if (!node.isConnected || node.clientWidth === width) return;
    width = node.clientWidth;
    fit(node);
  });
  observer.observe(node);
  const onResize = () => node.isConnected && fit(node);
  const onScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.classList?.contains('katex-display')) updateClip(target);
  };
  win.addEventListener('resize', onResize);
  node.addEventListener('scroll', onScroll, true);
  // A web font (KaTeX's) that loads after the first fit changes the formula's width: fit again.
  const fonts = (node.ownerDocument as Document & { fonts?: FontFaceSet }).fonts;
  fonts?.addEventListener?.('loadingdone', onResize);
  void fonts?.ready?.then(onResize, () => {});
  return () => {
    observer.disconnect();
    fonts?.removeEventListener?.('loadingdone', onResize);
    win.removeEventListener('resize', onResize);
    node.removeEventListener('scroll', onScroll, true);
  };
}
