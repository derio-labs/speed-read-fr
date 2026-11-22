// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTICLE, mountHarness, chunkSettings } from '../testing/reader';

const scrolled = vi.fn();
beforeEach(() => {
  scrolled.mockClear();
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(() => {
  document.body.innerHTML = '';
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe('normal reading', () => {
  it('Tab replaces stage and pane with the host document, marking and scrolling to the current block', () => {
    const t = mountHarness(ARTICLE);
    t.key(' ');
    t.key('n');
    expect(t.handle.player.state).toBe('stopped');
    t.key('Tab');
    expect(t.handle.player.state).toBe('reading');
    expect(t.q('.sr-layout')!.dataset.mode).toBe('reading');
    const reading = t.q('.sr-reading')!;
    expect(reading.hidden).toBe(false);
    const node = t.host.document.mock.results[0].value.node as Node;
    expect(reading.contains(node)).toBe(true);
    const marked = t.qa('[data-sr-current]');
    expect(marked).toHaveLength(1);
    expect(marked[0].tagName).toBe('H2');
    expect(marked[0].textContent).toBe('Setup');
    expect(t.source.contains(marked[0])).toBe(false);
    expect(scrolled).toHaveBeenCalled();
  });

  it('a pointer press on a block moves the position there', () => {
    const t = mountHarness(ARTICLE);
    t.key('Tab');
    const reading = t.q('.sr-reading')!;
    const code = reading.querySelector('pre code')!;
    code.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const pre = t.source.querySelector('pre')!;
    expect(t.host.onPosition).toHaveBeenLastCalledWith({ element: pre, line: 9 });
    expect(t.qa('[data-sr-current]')).toEqual([reading.querySelector('pre')]);
    expect(t.handle.player.state).toBe('reading');
  });

  it('Tab returns to the stage, paused, at the position, and releases the document', () => {
    const t = mountHarness(ARTICLE, { settings: { ...chunkSettings, stopLevels: [] } });
    t.key(' ');
    t.key('Tab');
    const node = t.host.document.mock.results[0].value.node as Node;
    t.q('.sr-reading p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    t.key('Tab');
    expect(t.handle.player.state).toBe('paused');
    expect(t.q('.sr-layout')!.dataset.mode).toBeUndefined();
    expect(t.q<HTMLElement>('.sr-reading')!.hidden).toBe(true);
    expect(t.host.release).toHaveBeenCalledWith(node);
    expect(t.q('.sr-display')!.dataset.kind).toBe('chunk');
    expect(t.q('.sr-sentence')!.textContent).toContain('The first paragraph');
  });

  it('marks the located element inline and restores its own style exactly', () => {
    const t = mountHarness('<p id="a" style="outline: 1px dotted red; color: blue">First words here.</p><p id="b">Second words.</p>');
    t.key('Tab');
    const reading = t.q('.sr-reading')!;
    const a = reading.querySelector('p')!;
    const b = reading.querySelectorAll('p')[1] as HTMLElement;
    const original = t.source.querySelector('#a')!.getAttribute('style');
    expect(a.hasAttribute('data-sr-current')).toBe(true);
    expect(a.style.outlineStyle).toBe('solid');
    expect(a.style.outlineOffset).not.toBe('');
    // Outline only: a fill would replace the page's own background (a dark code block).
    expect(a.style.backgroundColor).toBe('');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(a.getAttribute('style')).toBe(original);
    expect(a.hasAttribute('data-sr-current')).toBe(false);
    expect(b.hasAttribute('data-sr-current')).toBe(true);
    t.key('Tab');
    expect(b.hasAttribute('style')).toBe(false);
    expect(b.hasAttribute('data-sr-current')).toBe(false);
  });

  it('releases the document on destroy', () => {
    const t = mountHarness(ARTICLE);
    t.key('Tab');
    t.handle.destroy();
    expect(t.live.size).toBe(0);
  });

  it('with trustedEventsOnly, a synthetic press on a block does not move the position (l-security-r3)', () => {
    const t = mountHarness(ARTICLE, { trustedEventsOnly: true });
    t.handle.player.toggleReading();
    expect(t.handle.player.state).toBe('reading');
    const reading = t.q('.sr-reading')!;
    const before = t.qa('[data-sr-current]');
    const calls = t.host.onPosition.mock.calls.length;
    reading.querySelector('pre code')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.host.onPosition.mock.calls.length).toBe(calls);
    expect(t.qa('[data-sr-current]')).toEqual(before);
  });
});
