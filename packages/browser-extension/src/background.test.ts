import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: never[]) => unknown;

/** A fake extension API recording listeners and the order of calls. */
function fakeApi(base = 'moz-extension://abc/') {
  const calls: string[] = [];
  const listeners: Record<string, Listener[]> = {};
  const event = (name: string) => ({ addListener: vi.fn((fn: Listener) => (listeners[name] ??= []).push(fn)) });
  const api = {
    action: {
      onClicked: event('action'),
      setBadgeText: vi.fn(async (_d: { tabId: number; text: string }) => {}),
      setTitle: vi.fn(async (_d: { tabId: number; title: string }) => {}),
    },
    commands: { onCommand: event('command') },
    contextMenus: {
      create: vi.fn((item: { id: string }) => calls.push(`menu:${item.id}`)),
      removeAll: vi.fn(async () => {
        calls.push('removeAll');
      }),
      onClicked: event('menu'),
    },
    permissions: {
      request: vi.fn(async () => {
        calls.push('request');
        return true;
      }),
    },
    runtime: { onInstalled: event('installed'), onMessage: event('message'), sendMessage: vi.fn(), getURL: vi.fn((path: string) => base + path) },
    scripting: {
      executeScript: vi.fn(async (o: { target: { tabId: number }; files: string[] }) => {
        calls.push(`inject:${o.target.tabId}:${o.files.join(',')}`);
        return [];
      }),
    },
    storage: { local: { get: vi.fn(), set: vi.fn() } },
    tabs: {
      sendMessage: vi.fn(async (tabId: number, m: { mode: string }) => {
        calls.push(`send:${tabId}:${m.mode}`);
        return { ok: true } as unknown;
      }),
      query: vi.fn(async (_q: { active?: boolean; url?: string[] }): Promise<{ id?: number; url?: string }[]> => [{ id: 9 }]),
      onUpdated: event('updated'),
    },
  };
  const fire = (name: string, ...args: unknown[]) => (listeners[name] ?? []).map((fn) => (fn as (...a: unknown[]) => unknown)(...args));
  return { api, calls, listeners, fire };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
let fake: ReturnType<typeof fakeApi>;

beforeEach(async () => {
  vi.resetModules();
  fake = fakeApi();
  (globalThis as Record<string, unknown>).chrome = fake.api;
  await import('./background');
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
  delete (globalThis as Record<string, unknown>).__speedReadTest;
});

describe('registration', () => {
  it('registers every listener at top level, once', () => {
    for (const name of ['action', 'command', 'menu', 'message', 'installed', 'updated']) expect(fake.listeners[name], name).toHaveLength(1);
  });

  it('creates the two context-menu items on install', async () => {
    fake.fire('installed');
    await settle();
    const items = fake.api.contextMenus.create.mock.calls.map(([item]) => item);
    expect(items).toEqual([
      { id: 'speed-read-selection', title: 'Speed read selection', contexts: ['selection'] },
      { id: 'speed-read-from-here', title: 'Speed read from here', contexts: ['page', 'link', 'image'] },
    ]);
    expect(fake.calls.indexOf('removeAll')).toBeLessThan(fake.calls.indexOf('menu:speed-read-selection'));
  });
});

describe('permission request (p3-r17): Firefox only', () => {
  beforeEach(async () => {
    vi.resetModules();
    fake = fakeApi('chrome-extension://abc/');
    (globalThis as Record<string, unknown>).chrome = fake.api;
    await import('./background');
  });

  it('in Chrome the toolbar button and the command never call permissions.request', async () => {
    fake.fire('action', { id: 3 });
    fake.fire('command', 'speed-read', { id: 4 });
    await settle();
    expect(fake.api.permissions.request).not.toHaveBeenCalled();
    expect(fake.calls).toEqual(['inject:3:reader.js', 'send:3:auto', 'inject:4:reader.js', 'send:4:auto']);
  });
});

describe('routing to openReader', () => {
  it('in Firefox the toolbar button requests host access first, synchronously, then opens auto', async () => {
    fake.fire('action', { id: 3 });
    expect(fake.api.permissions.request).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    expect(fake.calls[0]).toBe('request');
    await settle();
    expect(fake.calls).toEqual(['request', 'inject:3:reader.js', 'send:3:auto']);
  });

  it('in Firefox the speed-read command requests host access first, synchronously, then opens auto', async () => {
    fake.fire('command', 'speed-read', { id: 4 });
    expect(fake.calls[0]).toBe('request');
    await settle();
    expect(fake.calls).toEqual(['request', 'inject:4:reader.js', 'send:4:auto']);
  });

  it('the command without a tab uses the active tab', async () => {
    fake.fire('command', 'speed-read');
    await settle();
    expect(fake.calls).toEqual(['request', 'inject:9:reader.js', 'send:9:auto']);
  });

  it('ignores other commands', async () => {
    fake.fire('command', 'other', { id: 4 });
    await settle();
    expect(fake.api.scripting.executeScript).not.toHaveBeenCalled();
  });

  it.each([
    ['speed-read-selection', 'selection'],
    ['speed-read-from-here', 'from-here'],
  ])('the menu item %s opens %s', async (menuItemId, mode) => {
    fake.fire('menu', { menuItemId, frameId: 0 }, { id: 5 });
    await settle();
    expect(fake.calls).toEqual(['inject:5:reader.js', `send:5:${mode}`]);
  });

  it.each(['speed-read-selection', 'speed-read-from-here'])('the menu item %s in a subframe reads the top page main content', async (menuItemId) => {
    fake.fire('menu', { menuItemId, frameId: 4 }, { id: 5 });
    await settle();
    expect(fake.calls).toEqual(['inject:5:reader.js', 'send:5:main']);
  });

  it('a hover message opens from-block in the sender tab', async () => {
    fake.fire('message', { type: 'read-from-hover' }, { tab: { id: 6 } });
    fake.fire('message', { type: 'other' }, { tab: { id: 6 } });
    fake.fire('message', { type: 'read-from-hover' }, {});
    await settle();
    expect(fake.calls).toEqual(['inject:6:reader.js', 'send:6:from-block']);
  });

  it('a failed injection (a page scripts cannot reach) does not throw out of the handler', async () => {
    fake.api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));
    fake.fire('action', { id: 7 });
    await settle();
    expect(fake.api.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe('openReader', () => {
  it('injects reader.js every time, then sends the mode', async () => {
    const { openReader } = (globalThis as unknown as { __speedReadTest: { openReader(tab: number, mode: string): Promise<void> } }).__speedReadTest;
    await openReader(2, 'auto');
    await openReader(2, 'from-here');
    expect(fake.calls).toEqual(['inject:2:reader.js', 'send:2:auto', 'inject:2:reader.js', 'send:2:from-here']);
  });

  it('keeps no module-level per-tab state', () => {
    const source = readFileSync(fileURLToPath(new URL('./background.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/^(let|var)\s/m);
    expect(source).not.toMatch(/new (Map|Set|WeakMap)\b/);
  });
});

describe('a reader that cannot open (l-errors-r1)', () => {
  const lastBadge = (tabId: number) => fake.api.action.setBadgeText.mock.calls.filter(([d]) => d.tabId === tabId).at(-1)?.[0].text;
  const lastTitle = (tabId: number) => fake.api.action.setTitle.mock.calls.filter(([d]) => d.tabId === tabId).at(-1)?.[0].title;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it.each(['chrome://extensions/', 'about:addons', 'https://chromewebstore.google.com/detail/x', 'https://addons.mozilla.org/en-US/firefox/', 'view-source:https://example.com/'])(
    'on a page no extension may script (%s) it sets a badge and title for that tab, and warns nothing',
    async (url) => {
      fake.api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents of the page'));
      fake.fire('action', { id: 7, url });
      await settle();
      expect(lastBadge(7)).toBe('!');
      expect(lastTitle(7)).toBe("Speed Read: Can't read this page");
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('with no URL known, a refused injection is judged by the error text (the PDF viewer)', async () => {
    fake.api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents of url "https://example.com/a.pdf". Extension manifest must request permission to access this host.'));
    fake.fire('menu', { menuItemId: 'speed-read-from-here', frameId: 0 }, { id: 5 });
    await settle();
    expect(lastBadge(5)).toBe('!');
    expect(warn).not.toHaveBeenCalled();
  });

  it('any other failure is a console warning with its context, and no badge', async () => {
    fake.api.tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));
    fake.fire('action', { id: 8, url: 'https://example.com/' });
    await settle();
    expect(lastBadge(8)).not.toBe('!');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toMatch(/tab 8.*auto.*example\.com/);
    expect(String(warn.mock.calls[0][1])).toMatch(/Receiving end/);
  });

  it("the reader's own failure, reported back in its reply, is warned with its cause", async () => {
    fake.api.tabs.sendMessage.mockResolvedValueOnce({ ok: false, error: 'No readable content' });
    fake.fire('action', { id: 8, url: 'https://example.com/' });
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][1])).toMatch(/No readable content/);
    expect(lastBadge(8)).not.toBe('!');
  });

  it('the badge is cleared on the next successful open', async () => {
    fake.api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));
    fake.fire('action', { id: 7, url: 'chrome://newtab/' });
    await settle();
    expect(lastBadge(7)).toBe('!');
    fake.fire('action', { id: 7, url: 'https://example.com/' });
    await settle();
    expect(lastBadge(7)).toBe('');
    expect(lastTitle(7)).toBe('Speed read (Alt+Shift+R)');
  });

  it('the badge is cleared when the tab navigates', async () => {
    fake.api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));
    fake.fire('action', { id: 7, url: 'chrome://newtab/' });
    await settle();
    fake.fire('updated', 7, { status: 'loading', url: 'https://example.com/' });
    expect(lastBadge(7)).toBe('');
    expect(lastTitle(7)).toBe('Speed read (Alt+Shift+R)');
  });
});

describe('content script in tabs open before install (l-errors-r9)', () => {
  it('on install injects content.js into every open http(s) tab, skipping tabs that refuse', async () => {
    fake.api.tabs.query.mockImplementation(async (q: { url?: string[] }) => (q.url ? [{ id: 1 }, { id: 2 }, { id: 3 }] : [{ id: 9 }]));
    fake.api.scripting.executeScript.mockImplementation(async (o: { target: { tabId: number }; files: string[] }) => {
      if (o.target.tabId === 2) throw new Error('Cannot access contents of the page');
      fake.calls.push(`inject:${o.target.tabId}:${o.files.join(',')}`);
      return [];
    });
    fake.fire('installed');
    await settle();
    await settle();
    expect(fake.api.tabs.query).toHaveBeenCalledWith({ url: ['http://*/*', 'https://*/*'] });
    expect(fake.calls.filter((c) => c.startsWith('inject:'))).toEqual(['inject:1:content.js', 'inject:3:content.js']);
  });

  it('a failing tab query does not throw out of the install handler', async () => {
    fake.api.tabs.query.mockRejectedValueOnce(new Error('no'));
    fake.fire('installed');
    await settle();
    expect(fake.api.contextMenus.create).toHaveBeenCalledTimes(2);
  });
});
