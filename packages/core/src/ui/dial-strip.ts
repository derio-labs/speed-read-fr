import { createDial, DRAG_RATIO } from '../dial';
import type { ReaderContext } from './context';

/** Px a tick strip slides per step moved, so the strip visibly turns with the position. */
const TICK_SLIDE_PX = 12;
const LINE_PX = 16;

export interface DialStrip {
  /** Turn the dial by a wheel event (over the stage, or routed by the host); prevents its scrolling. */
  wheel(event: WheelEvent): void;
  destroy(): void;
}

/** A wheel event's turn in px: the dominant axis, lines and pages converted. */
export function wheelDelta(event: WheelEvent, pageHeight: number): number {
  const d = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  return d * (event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? pageHeight : 1);
}

/** The position dial strip under the sentence line (spec section 13, R27), and the wheel over `stage`. */
export function createDialStrip(ctx: ReaderContext, stage: HTMLElement): DialStrip {
  const { h, player } = ctx;
  const strip = h('div', {
    class: 'sr-dial',
    role: 'slider',
    tabindex: 0,
    'aria-label': 'Position dial',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': 0,
    title: 'Turn to move: drag or use the wheel',
  });
  strip.append(h('span', { class: 'sr-dial-needle', 'aria-hidden': 'true' }));
  const readout = h('span', { class: 'sr-dial-gain', 'aria-hidden': 'true' }, '×1.0');
  stage.append(h('div', { class: 'sr-dial-row' }, strip, readout));

  let slide = 0;
  const dial = createDial({
    now: () => ctx.scheduler.now(),
    requestFrame: (fn) => ctx.frame.request(fn),
    cancelFrame: (handle) => ctx.frame.cancel(handle),
    onMove(steps) {
      const moved = player.scrub(steps);
      slide -= moved * TICK_SLIDE_PX;
      strip.style.setProperty('--sr-dial-offset', `${slide}px`);
      return moved;
    },
  });
  dial.onGain((gain) => {
    readout.textContent = `×${gain.toFixed(1)}`;
  });

  function value() {
    const total = ctx.timeline.steps.length;
    const pct = total <= 1 ? 0 : Math.round((Math.min(player.index, total - 1) / (total - 1)) * 100);
    strip.setAttribute('aria-valuenow', String(pct));
  }

  function wheel(event: WheelEvent) {
    if (!ctx.accepts(event)) return;
    event.preventDefault();
    const pageHeight = ctx.document.defaultView?.innerHeight ?? 800;
    dial.turn(wheelDelta(event, pageHeight));
  }

  let dragX: number | null = null;
  function down(event: PointerEvent) {
    if (!ctx.accepts(event) || event.button !== 0) return;
    event.preventDefault();
    dragX = event.clientX;
    if (typeof event.pointerId === 'number') strip.setPointerCapture?.(event.pointerId);
    dial.hold(true);
  }
  function move(event: PointerEvent) {
    if (dragX === null || !ctx.accepts(event)) return;
    const dx = event.clientX - dragX;
    dragX = event.clientX;
    // Dragging left moves forward.
    if (dx) dial.turn(-dx * DRAG_RATIO);
  }
  function up() {
    if (dragX === null) return;
    dragX = null;
    dial.hold(false);
  }

  const onWheel = (e: Event) => wheel(e as WheelEvent);
  stage.addEventListener('wheel', onWheel, { passive: false });
  strip.addEventListener('pointerdown', down as EventListener);
  strip.addEventListener('pointermove', move as EventListener);
  strip.addEventListener('pointerup', up);
  strip.addEventListener('pointercancel', up);
  strip.addEventListener('lostpointercapture', up);
  const off = [player.on('position', value), player.on('step', value)];

  return {
    wheel,
    destroy() {
      for (const o of off) o();
      dial.destroy();
      stage.removeEventListener('wheel', onWheel);
    },
  };
}
