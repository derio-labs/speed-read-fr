// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountHarness } from '../testing/reader';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const LONG = `<p>${Array.from({ length: 40 }, (_, i) => `Word${i} is here.`).join(' ')}</p>`;

const wheel = (deltaY: number, init: WheelEventInit = {}) => new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...init });
/** jsdom has no PointerEvent: a MouseEvent of the pointer type carries what the strip reads. */
const pointer = (type: string, clientX: number) => new MouseEvent(type, { clientX, bubbles: true, cancelable: true, button: 0 });

describe('dial strip in the stage (spec section 13)', () => {
  it('sits under the sentence line: a slider with a centre needle and a x1.0 readout', () => {
    const t = mountHarness(LONG);
    const strip = t.q('.sr-stage .sr-dial')!;
    expect(strip).not.toBeNull();
    expect(t.q('.sr-sentence')!.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.getAttribute('role')).toBe('slider');
    expect(strip.getAttribute('aria-label')).toBe('Position dial');
    expect(strip.getAttribute('aria-valuemin')).toBe('0');
    expect(strip.getAttribute('aria-valuemax')).toBe('100');
    expect(strip.getAttribute('aria-valuenow')).toBe('0');
    expect(t.q('.sr-dial-needle')).not.toBeNull();
    expect(t.q('.sr-dial-gain')!.textContent).toBe('×1.0');
  });

  it('a wheel turn over the stage moves the position forwards and backwards and is not scrolled', () => {
    const t = mountHarness(LONG);
    const stage = t.q('.sr-stage')!;
    const e = wheel(130);
    stage.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(t.handle.player.index).toBe(1);
    t.clock.advance(1000);
    stage.dispatchEvent(wheel(-130));
    expect(t.handle.player.index).toBe(0);
  });

  it('counts a line-mode wheel notch as 16 px per line and takes the dominant axis', () => {
    const t = mountHarness(LONG);
    t.q('.sr-stage')!.dispatchEvent(wheel(8, { deltaMode: 1 }));
    expect(t.handle.player.index).toBe(1);
    t.clock.advance(1000);
    // A horizontal turn counts on the strip itself.
    t.q('.sr-dial')!.dispatchEvent(wheel(1, { deltaX: 130 }));
    expect(t.handle.player.index).toBe(2);
  });

  it('leaves ctrl/meta+wheel (zoom, pinch) and horizontal swipes off the strip to the browser (p5a-r4)', () => {
    const t = mountHarness(LONG);
    const stage = t.q('.sr-stage')!;
    for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
      const e = wheel(130, init);
      stage.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    const swipe = wheel(5, { deltaX: 130 });
    stage.dispatchEvent(swipe);
    expect(swipe.defaultPrevented).toBe(false);
    const routed = wheel(5, { deltaX: 130 });
    t.handle.wheel(routed);
    expect(routed.defaultPrevented).toBe(false);
    expect(t.handle.player.index).toBe(0);
  });

  it('a fast burst travels further per notch than slow notches, and the readout shows the multiplier', () => {
    const slow = mountHarness(LONG);
    for (let i = 0; i < 5; i++) {
      slow.q('.sr-stage')!.dispatchEvent(wheel(100));
      slow.runFrames(300);
    }
    const slowSteps = slow.handle.player.index;
    slow.handle.destroy();

    const fast = mountHarness(LONG);
    for (let i = 0; i < 5; i++) {
      fast.q('.sr-stage')!.dispatchEvent(wheel(100));
      fast.runFrames(16);
    }
    const gain = Number(fast.q('.sr-dial-gain')!.textContent!.slice(1));
    expect(gain).toBeGreaterThan(2);
    expect(fast.handle.player.index).toBeGreaterThan(slowSteps * 2);
    fast.runFrames(2000);
    expect(fast.q('.sr-dial-gain')!.textContent).toBe('×1.0');
    expect(Number(fast.q('.sr-dial')!.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  });

  it('dragging the strip left moves forward at 2.2 px of turn per px; right moves back; no coast while held', () => {
    const t = mountHarness(LONG);
    const strip = t.q('.sr-dial')!;
    strip.dispatchEvent(pointer('pointerdown', 300));
    strip.dispatchEvent(pointer('pointermove', 240)); // 60 px left = 132 px of turn
    expect(t.handle.player.index).toBe(1);
    t.runFrames(500);
    expect(t.handle.player.index).toBe(1);
    t.clock.advance(1000);
    strip.dispatchEvent(pointer('pointermove', 300));
    expect(t.handle.player.index).toBe(0);
    strip.dispatchEvent(pointer('pointerup', 300));
    strip.dispatchEvent(pointer('pointermove', 100));
    expect(t.handle.player.index).toBe(0);
  });

  it('pauses playback while turning and resumes after scrubbing', () => {
    const t = mountHarness(LONG);
    t.handle.player.toggle();
    expect(t.handle.player.state).toBe('playing');
    t.q('.sr-stage')!.dispatchEvent(wheel(130));
    expect(t.handle.player.state).toBe('paused');
    t.runFrames(800);
    expect(t.handle.player.state).toBe('playing');
  });

  it('handle.wheel routes a wheel event from elsewhere (the page) to the dial', () => {
    const t = mountHarness(LONG);
    const e = wheel(130);
    t.handle.wheel(e);
    expect(e.defaultPrevented).toBe(true);
    expect(t.handle.player.index).toBe(1);
  });

  // jsdom events are all script-made (untrusted); the browser-level test proves real input still turns the dial.
  it('with trustedEventsOnly ignores script-made wheel and pointer input', () => {
    const t = mountHarness(LONG, { trustedEventsOnly: true });
    const stage = t.q('.sr-stage')!;
    const strip = t.q('.sr-dial')!;
    stage.dispatchEvent(wheel(130));
    strip.dispatchEvent(pointer('pointerdown', 300));
    strip.dispatchEvent(pointer('pointermove', 100));
    t.handle.wheel(wheel(130));
    expect(t.handle.player.index).toBe(0);
  });

  it('destroy removes the listeners and stops the coast', () => {
    const t = mountHarness(LONG);
    const stage = t.q('.sr-stage')!;
    for (let i = 0; i < 5; i++) {
      stage.dispatchEvent(wheel(100));
      t.runFrames(16);
    }
    const at = t.handle.player.index;
    t.handle.destroy();
    t.runFrames(1000);
    expect(t.handle.player.index).toBe(at);
  });
});
