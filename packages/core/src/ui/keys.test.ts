// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '../player';
import { ARTICLE, mountHarness } from '../testing/reader';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const KEY_MAP: [string, KeyboardEventInit, keyof Player, unknown[]][] = [
  [' ', {}, 'toggle', []],
  ['ArrowRight', {}, 'sentence', [1]],
  ['ArrowLeft', {}, 'sentence', [-1]],
  ['ArrowUp', {}, 'speed', [25]],
  ['ArrowDown', {}, 'speed', [-25]],
  ['n', {}, 'section', [1]],
  ['N', { shiftKey: true }, 'section', [1]],
  ['p', {}, 'section', [-1]],
  ['P', { shiftKey: true }, 'section', [-1]],
  ['Tab', {}, 'toggleReading', []],
  ['e', {}, 'expand', []],
  ['E', { shiftKey: true }, 'expand', []],
  ['Escape', {}, 'close', []],
];

describe('reader keys', () => {
  it.each(KEY_MAP)('%s on the reader root calls %s', (key, init, command, args) => {
    const t = mountHarness(ARTICLE);
    const spy = vi.spyOn(t.handle.player, command as 'toggle');
    const event = t.key(key, init, t.reader);
    expect(spy).toHaveBeenCalledWith(...args);
    expect(event.defaultPrevented).toBe(true);
  });

  it('acts when focus is on the stage too', () => {
    const t = mountHarness(ARTICLE);
    const stage = t.q('.sr-stage')!;
    stage.focus();
    const spy = vi.spyOn(t.handle.player, 'toggle');
    t.key(' ', {}, stage);
    expect(spy).toHaveBeenCalled();
  });

  it('ignores keys with Ctrl, Meta or Alt', () => {
    const t = mountHarness(ARTICLE);
    const spy = vi.spyOn(t.handle.player, 'section');
    const event = t.key('n', { ctrlKey: true });
    t.key('n', { metaKey: true });
    t.key('n', { altKey: true });
    expect(spy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not handle shortcuts while focus is in a form control', () => {
    const t = mountHarness(ARTICLE);
    const input = document.createElement('input');
    t.q('.sr-stage')!.append(input);
    input.focus();
    const spy = vi.spyOn(t.handle.player, 'toggle');
    const event = t.key(' ', {}, input);
    expect(spy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('E and Esc close an expanded exhibit before anything else', () => {
    const t = mountHarness('<p>Intro.</p><pre>a\nb</pre>');
    t.key(' ');
    t.clock.advance(10_000);
    t.key('e');
    expect(t.q('.sr-expanded')).not.toBeNull();
    t.key('e');
    expect(t.q('.sr-expanded')).toBeNull();
    t.key('E', { shiftKey: true });
    expect(t.q('.sr-expanded')).not.toBeNull();
    const close = vi.spyOn(t.handle.player, 'close');
    t.key('Escape');
    expect(t.q('.sr-expanded')).toBeNull();
    expect(close).not.toHaveBeenCalled();
    t.key('Escape');
    expect(close).toHaveBeenCalled();
    expect(t.host.onClose).toHaveBeenCalled();
  });

  it('Tab from a reader button keeps focus inside the reader', () => {
    const t = mountHarness(ARTICLE);
    const buttons = t.qa<HTMLButtonElement>('button').filter((b) => !b.closest('[hidden]'));
    const last = buttons[buttons.length - 1];
    last.focus();
    const event = t.key('Tab', {}, last);
    expect(event.defaultPrevented).toBe(true);
    expect(t.reader.contains(document.activeElement)).toBe(true);
  });
});

describe('while the settings panel is open', () => {
  it('opens with "," and leaves the reader shortcuts unhandled', () => {
    const t = mountHarness(ARTICLE);
    t.key(',');
    const panel = t.q('.sr-settings')!;
    expect(panel.closest('[hidden]')).toBeNull();
    const spies = (['toggle', 'sentence', 'speed', 'section', 'toggleReading', 'expand', 'close'] as const).map((c) => vi.spyOn(t.handle.player, c));
    for (const key of [' ', 'ArrowRight', 'ArrowUp', 'n', 'p', 'e']) t.key(key, {}, t.reader);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('cycles Tab and Shift+Tab within the panel, wrapping', () => {
    const t = mountHarness(ARTICLE);
    t.q<HTMLButtonElement>('.sr-settings-button')!.click();
    const panel = t.q('.sr-settings')!;
    const focusables = [...panel.querySelectorAll<HTMLElement>('button, input, select')].filter((el) => !(el as HTMLInputElement).disabled);
    expect(document.activeElement).toBe(focusables[0]);
    focusables[focusables.length - 1].focus();
    let event = t.key('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    event = t.key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    focusables[1].focus();
    t.key('Tab');
    expect(document.activeElement).toBe(focusables[2]);
  });

  it('closes on Esc and refocuses the reader root', () => {
    const t = mountHarness(ARTICLE);
    t.key(',');
    const close = vi.spyOn(t.handle.player, 'close');
    t.key('Escape');
    expect(t.q('.sr-settings')!.closest('[hidden]')).not.toBeNull();
    expect(document.activeElement).toBe(t.reader);
    expect(close).not.toHaveBeenCalled();
  });
});
