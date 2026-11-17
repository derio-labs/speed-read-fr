/**
 * background.js (spec section 7, R13): the toolbar button, the Alt+Shift+R command, the two
 * context-menu items and the Alt-hover message each route to one `openReader`. Listeners are
 * registered at top level so an unloaded service worker or event page is woken for them, and no
 * per-tab state is kept: every open injects reader.js again, which guards itself.
 */
import { ext, type ExtApi, type Tab } from './ext';
import { HOVER_MESSAGE, type ReadMessage, type ReadMode } from './shared';

const api = ext() as ExtApi;

const MENU_MODES: Record<string, ReadMode> = {
  'speed-read-selection': 'selection',
  'speed-read-from-here': 'from-here',
};

export async function openReader(tabId: number, mode: ReadMode): Promise<void> {
  await api.scripting.executeScript({ target: { tabId }, files: ['reader.js'] });
  const message: ReadMessage = { mode };
  await api.tabs.sendMessage(tabId, message);
}

/** Open, swallowing what a page scripts cannot reach (a browser page, a store page) rejects with. */
function open(tabId: number | undefined, mode: ReadMode): void {
  if (tabId === undefined) return;
  openReader(tabId, mode).catch(() => {});
}

/**
 * Firefox accepts `permissions.request` only while the user-input handler runs, so it is the
 * handler's first statement with nothing awaited before it. Granted or not, the reader opens:
 * `activeTab` covers the current tab.
 */
function requestHostAccess(): void {
  api.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
}

async function activeTabId(tab?: Tab): Promise<number | undefined> {
  if (tab?.id !== undefined) return tab.id;
  const [active] = await api.tabs.query({ active: true, currentWindow: true });
  return active?.id;
}

api.runtime.onInstalled.addListener(() => {
  api.contextMenus
    .removeAll()
    .catch(() => {})
    .then(() => {
      api.contextMenus.create({ id: 'speed-read-selection', title: 'Speed read selection', contexts: ['selection'] });
      api.contextMenus.create({ id: 'speed-read-from-here', title: 'Speed read from here', contexts: ['page', 'link', 'image'] });
    });
});

api.action.onClicked.addListener((tab) => {
  requestHostAccess();
  open(tab.id, 'auto');
});

api.commands.onCommand.addListener((command, tab) => {
  requestHostAccess();
  if (command !== 'speed-read') return;
  void activeTabId(tab).then((id) => open(id, 'auto'));
});

api.contextMenus.onClicked.addListener((info, tab) => {
  const mode = MENU_MODES[String(info.menuItemId)];
  if (mode) open(tab?.id, mode);
});

api.runtime.onMessage.addListener((message, sender) => {
  if ((message as { type?: string } | null)?.type === HOVER_MESSAGE.type) open(sender.tab?.id, 'from-block');
});

// For the browser-level tests: the handler every entry point routes to, callable from the worker.
(globalThis as Record<string, unknown>).__speedReadTest = { openReader };
