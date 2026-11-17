// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOVER_ATTRIBUTE, installContent } from './content';
import type { ExtApi } from './ext';
import { BRIDGE_KEY, bridgeOf, type ContentBridge } from './shared';

/** jsdom events are untrusted, like a page script's: the unit tests relax the production check. */
const RELAXED = { trustedEventsOnly: false };

let scope: Record<PropertyKey, unknown>;
let sendMessage: ReturnType<typeof vi.fn>;
let uninstall: () => void;

const $ = (id: string) => document.getElementById(id)!;
const bridge = () => scope[BRIDGE_KEY] as ContentBridge;
const outlined = () => [...document.querySelectorAll(`[${HOVER_ATTRIBUTE}]`)];

function key(type: 'keydown' | 'keyup', altKey: boolean) {
  const e = new KeyboardEvent(type, { key: 'Alt', altKey, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return e;
}

function pointer(type: string, target: Element, altKey = false) {
  const Ctor = type === 'click' || type === 'auxclick' || type.startsWith('mouse') || type === 'contextmenu' ? MouseEvent : Event;
  const e = new Ctor(type, { bubbles: true, cancelable: true, altKey } as MouseEventInit);
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  document.body.innerHTML = `
    <article>
      <p id="p1">First <a id="link" href="#next">a link</a> here.</p>
      <p id="p2">Second <span id="inline">inline</span> text.</p>
      <ul><li id="li">Item</li></ul>
    </article>`;
  scope = {};
  sendMessage = vi.fn(async () => undefined);
  uninstall = installContent(scope, window, { runtime: { sendMessage } } as unknown as ExtApi, RELAXED);
});

afterEach(() => uninstall());

describe('with Alt up', () => {
  it('pointer moves and presses change nothing and prevent nothing', () => {
    const bubbled = vi.fn();
    document.addEventListener('click', bubbled);
    pointer('mousemove', $('link'));
    for (const type of ['mousedown', 'mouseup', 'click', 'auxclick']) expect(pointer(type, $('link')).defaultPrevented, type).toBe(false);
    expect(outlined()).toEqual([]);
    expect(bubbled).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    expect($('p1').getAttribute('style')).toBeNull();
    document.removeEventListener('click', bubbled);
  });
});

describe('with Alt held', () => {
  it('outlines the block under the pointer and follows it', () => {
    pointer('mousemove', $('link'));
    expect(key('keydown', true).defaultPrevented).toBe(false);
    expect(outlined()).toEqual([$('p1')]);
    expect($('p1').style.outline).not.toBe('');
    pointer('mousemove', $('inline'), true);
    expect(outlined()).toEqual([$('p2')]);
    expect($('p1').style.outline).toBe('');
    pointer('mousemove', $('li'), true);
    expect(outlined()).toEqual([$('li')]);
  });

  it('outlines on a pointer move that carries Alt, without a keydown', () => {
    pointer('mousemove', $('inline'), true);
    expect(outlined()).toEqual([$('p2')]);
  });

  it('releasing Alt removes the outline', () => {
    pointer('mousemove', $('inline'), true);
    expect(key('keyup', false).defaultPrevented).toBe(false);
    expect(outlined()).toEqual([]);
    expect($('p2').getAttribute('style') ?? '').toBe('');
  });

  it('a pointer press on the outlined block is prevented and stopped, and sends one hover message', () => {
    const bubbled = vi.fn();
    document.addEventListener('click', bubbled);
    document.addEventListener('mousedown', bubbled);
    document.addEventListener('auxclick', bubbled);
    pointer('mousemove', $('link'), true);
    for (const type of ['mousedown', 'mouseup', 'click', 'auxclick']) expect(pointer(type, $('link'), true).defaultPrevented, type).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'read-from-hover' });
    expect(bridge().hoverTarget()).toBe($('p1'));
    for (const type of ['click', 'mousedown', 'auxclick']) document.removeEventListener(type, bubbled);
  });

  it('prevents the default of the Alt keyup after such a press, once', () => {
    pointer('mousemove', $('link'), true);
    pointer('mousedown', $('link'), true);
    pointer('click', $('link'), true);
    expect(key('keyup', false).defaultPrevented).toBe(true);
    pointer('mousemove', $('link'), true);
    expect(key('keyup', false).defaultPrevented).toBe(false);
  });

  it('does not intercept a press outside the outlined block', () => {
    pointer('mousemove', $('link'), true);
    expect(pointer('click', document.body, true).defaultPrevented).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('window blur clears the outline', () => {
    pointer('mousemove', $('inline'), true);
    window.dispatchEvent(new Event('blur'));
    expect(outlined()).toEqual([]);
  });

  it('restores an inline outline the page had set', () => {
    $('p2').style.outline = '1px dotted red';
    pointer('mousemove', $('inline'), true);
    key('keyup', false);
    expect($('p2').style.outline).toBe('1px dotted red');
  });
});

describe('context-menu target', () => {
  it('remembers the element under the last contextmenu event and returns it when asked', () => {
    expect(bridge().contextTarget()).toBeNull();
    pointer('contextmenu', $('inline'));
    expect(bridge().contextTarget()).toBe($('inline'));
    pointer('contextmenu', $('li'));
    expect(bridge().contextTarget()).toBe($('li'));
  });

  it('is cleared once used', () => {
    pointer('contextmenu', $('li'));
    expect(bridge().contextTarget()).toBe($('li'));
    expect(bridge().contextTarget()).toBeNull();
  });

  it('is not returned once it left the page', () => {
    pointer('contextmenu', $('li'));
    $('li').remove();
    expect(bridge().contextTarget()).toBeNull();
  });

  it('the hover target is cleared once used', () => {
    pointer('mousemove', $('link'), true);
    pointer('click', $('link'), true);
    expect(bridge().hoverTarget()).toBe($('p1'));
    expect(bridge().hoverTarget()).toBeNull();
  });
});

describe('inside the open reader', () => {
  it('outlines nothing and intercepts nothing', () => {
    const host = document.createElement('div');
    host.setAttribute('data-speed-read-host', '');
    host.innerHTML = '<p id="inside">Clone text <a id="inlink" href="#y">link</a></p>';
    document.body.append(host);
    pointer('mousemove', $('inlink'), true);
    expect(outlined()).toEqual([]);
    key('keydown', true);
    expect(outlined()).toEqual([]);
    for (const type of ['mousedown', 'mouseup', 'click', 'auxclick']) expect(pointer(type, $('inlink'), true).defaultPrevented, type).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('clears an outline when the pointer moves into the reader', () => {
    const host = document.createElement('div');
    host.setAttribute('data-speed-read-host', '');
    document.body.append(host);
    pointer('mousemove', $('inline'), true);
    expect(outlined()).toEqual([$('p2')]);
    pointer('mousemove', host, true);
    expect(outlined()).toEqual([]);
  });
});

describe('a page with elements named like the extension globals', () => {
  it('still installs: the bridge lives under a symbol, not a string a named element can shadow', () => {
    uninstall();
    const named = document.createElement('div');
    const s: Record<PropertyKey, unknown> = { __speedReadContent: named, __speedRead: named };
    const off = installContent(s, window, { runtime: { sendMessage } } as unknown as ExtApi, RELAXED);
    expect(typeof (s[BRIDGE_KEY] as ContentBridge).contextTarget).toBe('function');
    pointer('contextmenu', $('li'));
    expect((s[BRIDGE_KEY] as ContentBridge).contextTarget()).toBe($('li'));
    off();
    uninstall = () => {};
  });

  it('bridgeOf ignores a value that is not a bridge', () => {
    expect(bridgeOf({ [BRIDGE_KEY]: document.createElement('div') })).toBeUndefined();
    expect(bridgeOf({ __speedReadContent: { contextTarget: () => null, hoverTarget: () => null } })).toBeUndefined();
  });
});

describe('install', () => {
  it('installs once per scope', () => {
    expect(installContent(scope, window, undefined)).toBeTypeOf('function');
    pointer('contextmenu', $('li'));
    expect(bridge().contextTarget()).toBe($('li'));
  });
});

describe('untrusted events (a page script dispatching them)', () => {
  let off: () => void;
  let s: Record<PropertyKey, unknown>;
  beforeEach(() => {
    uninstall();
    uninstall = () => {};
    s = {};
    // The production default: only events from the user act.
    off = installContent(s, window, { runtime: { sendMessage } } as unknown as ExtApi);
  });
  afterEach(() => off());

  it('a synthetic Alt move, keydown and press outline nothing, prevent nothing and send nothing', () => {
    pointer('mousemove', $('link'), true);
    key('keydown', true);
    expect(outlined()).toEqual([]);
    for (const type of ['mousedown', 'mouseup', 'click', 'auxclick']) expect(pointer(type, $('link'), true).defaultPrevented, type).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    expect((s[BRIDGE_KEY] as ContentBridge).hoverTarget()).toBeNull();
  });

  it('a synthetic contextmenu event is not remembered', () => {
    pointer('contextmenu', $('li'));
    expect((s[BRIDGE_KEY] as ContentBridge).contextTarget()).toBeNull();
  });
});

describe('an orphaned content script (the extension was reloaded)', () => {
  it('when sendMessage throws, it removes its listeners and outline and the page behaves normally', () => {
    sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    pointer('mousemove', $('link'), true);
    expect(() => pointer('click', $('link'), true)).not.toThrow();
    expect(outlined()).toEqual([]);
    expect($('p1').getAttribute('style') ?? '').toBe('');
    expect(scope[BRIDGE_KEY]).toBeUndefined();
    pointer('mousemove', $('link'), true);
    expect(outlined()).toEqual([]);
    expect(pointer('click', $('link'), true).defaultPrevented).toBe(false);
  });

  it('when sendMessage rejects with a gone context, it removes itself too', async () => {
    sendMessage.mockImplementation(async () => {
      throw new Error('Extension context invalidated.');
    });
    pointer('mousemove', $('link'), true);
    pointer('click', $('link'), true);
    await new Promise((r) => setTimeout(r, 0));
    expect(scope[BRIDGE_KEY]).toBeUndefined();
    pointer('mousemove', $('link'), true);
    expect(outlined()).toEqual([]);
  });

  it('another rejection (no receiver yet) keeps it installed', async () => {
    sendMessage.mockImplementation(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    pointer('mousemove', $('link'), true);
    pointer('click', $('link'), true);
    await new Promise((r) => setTimeout(r, 0));
    expect(scope[BRIDGE_KEY]).toBeDefined();
  });
});
