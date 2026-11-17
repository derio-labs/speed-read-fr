import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: never[]) => unknown;

/** A fake extension API recording listeners and the order of calls. */
function fakeApi() {
  const calls: string[] = [];
  const listeners: Record<string, Listener[]> = {};
  const event = (name: string) => ({ addListener: vi.fn((fn: Listener) => (listeners[name] ??= []).push(fn)) });
  const api = {
    action: { onClicked: event('action') },
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
    runtime: { onInstalled: event('installed'), onMessage: event('message'), sendMessage: vi.fn() },
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
      }),
      query: vi.fn(async () => [{ id: 9 }]),
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
    for (const name of ['action', 'command', 'menu', 'message', 'installed']) expect(fake.listeners[name], name).toHaveLength(1);
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

describe('routing to openReader', () => {
  it('the toolbar button requests host access first, synchronously, then opens auto', async () => {
    fake.fire('action', { id: 3 });
    expect(fake.api.permissions.request).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    expect(fake.calls[0]).toBe('request');
    await settle();
    expect(fake.calls).toEqual(['request', 'inject:3:reader.js', 'send:3:auto']);
  });

  it('the speed-read command requests host access first, synchronously, then opens auto', async () => {
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
