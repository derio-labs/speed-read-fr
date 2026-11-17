// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mountHarness } from '../testing/reader';

const MARKUP = '<p>First words of the text here.</p><p>Second words.</p>';

afterEach(() => {
  document.body.innerHTML = '';
});

// jsdom events are untrusted, like a page script's synthetic events.
describe('trustedEventsOnly', () => {
  it('off (the default): synthetic keys act', () => {
    const t = mountHarness(MARKUP);
    t.key('ArrowUp');
    expect(t.handle.player.settings.wpm).toBe(325);
  });

  it('on: synthetic keys change nothing', () => {
    const t = mountHarness(MARKUP, { trustedEventsOnly: true });
    expect(t.key('ArrowUp').defaultPrevented).toBe(false);
    t.key(' ');
    expect(t.handle.player.settings.wpm).toBe(300);
    expect(t.handle.player.state).toBe('idle');
  });

  it('on: synthetic settings-panel input and change events change nothing', () => {
    const t = mountHarness(MARKUP, { trustedEventsOnly: true });
    t.handle.player; // the panel is built at mount
    const wpm = t.q<HTMLInputElement>('.sr-settings [name="wpm"]')!;
    wpm.value = '800';
    wpm.dispatchEvent(new Event('input', { bubbles: true }));
    wpm.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.handle.player.settings.wpm).toBe(300);
    expect(t.store.save).not.toHaveBeenCalled();
  });
});
