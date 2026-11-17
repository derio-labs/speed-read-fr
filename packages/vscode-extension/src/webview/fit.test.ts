// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fitMath, mathScale, MIN_MATH_SCALE } from './fit';

/**
 * A display equation whose widths follow its zoom like a browser's (in the zoomed element's own
 * units), with `slack` px of extra width that does not scale (glyph metrics rounding per size).
 */
function display(natural: number, available: number, slack = 0) {
  document.body.innerHTML = '<div class="w"><div class="katex-display"></div></div>';
  const el = document.querySelector<HTMLElement>('.katex-display')!;
  const zoom = () => Number(el.style.zoom || 1);
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => Math.round(available / zoom()) });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => Math.max(Math.round(available / zoom()), Math.ceil(natural + (zoom() < 1 ? slack / zoom() : 0))) });
  return el;
}

describe('mathScale (l-ci: rounding)', () => {
  it('keeps the scaled width at least 1 px inside the available width, floored to 3 decimals', () => {
    for (const [natural, available] of [[1000, 700], [999, 997], [1234, 1000], [702, 700], [10_000, 7001]]) {
      const scale = mathScale(natural, available);
      expect(natural * scale).toBeLessThanOrEqual(available - 1);
      expect(Math.round(scale * 1000) / 1000).toBe(scale);
    }
  });

  it('is 1 when it fits and never below the minimum', () => {
    expect(mathScale(500, 500)).toBe(1);
    expect(mathScale(501, 500)).toBe(1);
    expect(mathScale(400, 500)).toBe(1);
    expect(mathScale(5000, 500)).toBe(MIN_MATH_SCALE);
  });
});

describe('fitMath', () => {
  const scrolls = (el: HTMLElement) => el.scrollWidth > el.clientWidth + 1;

  it('a scaled equation does not overflow, even when its zoomed text comes out a few px wider', () => {
    const el = display(1000, 700, 4);
    fitMath(el.parentElement!);
    expect(Number(el.style.zoom)).toBeLessThan(1);
    expect(Number(el.style.zoom)).toBeGreaterThanOrEqual(MIN_MATH_SCALE);
    expect(scrolls(el)).toBe(false);
    expect(el.dataset.clip).toBeUndefined();
  });

  it('a one-pixel overflow is fitting: no zoom and no scroll fade', () => {
    const el = display(701, 700);
    fitMath(el.parentElement!);
    expect(el.style.zoom).toBe('');
    expect(el.dataset.clip).toBeUndefined();
  });

  it('one too wide for the minimum stops at 0.6 and fades the clipped side', () => {
    const el = display(2000, 700);
    fitMath(el.parentElement!);
    expect(el.style.zoom).toBe('0.6');
    expect(el.dataset.clip).toBe('right');
  });
});
