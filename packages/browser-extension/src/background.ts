/**
 * background.js (spec section 7, R13): the toolbar button, the Alt+Shift+R command, the two
 * context-menu items and the Alt-hover message each route to one `openReader`. Listeners are
 * registered at top level so an unloaded service worker or event page is woken for them, and no
 * per-tab state is kept: every open injects reader.js again, which guards itself.
 */
import { ext, type ExtApi, type Tab } from './ext';
import { HOVER_MESSAGE, type ReadMessage, type ReadMode, type ReadReply } from './shared';

const api = ext() as ExtApi;

const MENU_MODES: Record<string, ReadMode> = {
  'speed-read-selection': 'selection',
  'speed-read-from-here': 'from-here',
};

/** The toolbar title of the manifest, restored when a tab's notice is cleared. */
export const DEFAULT_TITLE = 'Speed read (Alt+Shift+R)';
export const FORBIDDEN_TITLE = "Speed Read: Can't read this page";
export const FORBIDDEN_BADGE = '!';

/** The reader answered that it could not read the page; `cause` is its error message. */
export class ReaderFailed extends Error {}

export async function openReader(tabId: number, mode: ReadMode): Promise<void> {
  await api.scripting.executeScript({ target: { tabId }, files: ['reader.js'] });
  const message: ReadMessage = { mode };
  const reply = (await api.tabs.sendMessage(tabId, message)) as ReadReply | undefined;
  if (reply && reply.ok === false) throw new ReaderFailed(reply.error);
}

/** Schemes no extension may script: browser pages, other extensions, the source viewer. */
const FORBIDDEN_SCHEME = /^(chrome|chrome-extension|chrome-search|chrome-untrusted|edge|brave|opera|vivaldi|about|moz-extension|resource|view-source|devtools|data|blob|javascript):/i;
/** Stores where injection is refused. */
const FORBIDDEN_HOSTS = ['chrome.google.com', 'chromewebstore.google.com', 'microsoftedge.microsoft.com', 'addons.mozilla.org', 'accounts-static.cdn.mozilla.net'];
/** What a refused injection says (Chrome and Firefox), e.g. on the PDF viewer or a page without host access. */
const FORBIDDEN_ERROR = /cannot access|cannot be scripted|extensions gallery|missing host permission|must request permission|permission to access|cannot script|cannot inject|frame with id 0 is showing error page/i;

/** Whether the page is one no extension may read: by its URL when known, else by the error text. */
export function isForbidden(url: string | undefined, error: unknown): boolean {
  if (error instanceof ReaderFailed) return false;
  if (url) {
    if (FORBIDDEN_SCHEME.test(url)) return true;
    try {
      const { hostname, pathname } = new URL(url);
      if (FORBIDDEN_HOSTS.includes(hostname) && (hostname !== 'chrome.google.com' || pathname.startsWith('/webstore'))) return true;
    } catch {
      // Not a URL: judged by the error.
    }
  }
  return FORBIDDEN_ERROR.test(String((error as Error | null)?.message ?? error));
}

/** Show (or clear) the tab's "can't read this page" notice on the toolbar button. */
function notice(tabId: number, on: boolean): void {
  api.action.setBadgeText({ tabId, text: on ? FORBIDDEN_BADGE : '' })?.catch?.(() => {});
  api.action.setTitle({ tabId, title: on ? FORBIDDEN_TITLE : DEFAULT_TITLE })?.catch?.(() => {});
}

/**
 * Open the reader. A page that cannot be scripted (a browser page, a store page, the PDF viewer)
 * gets a short notice on the toolbar button for that tab; any other failure is a warning with its
 * cause, never silence.
 */
function open(tabId: number | undefined, mode: ReadMode, url?: string): Promise<void> {
  if (tabId === undefined) return Promise.resolve();
  return openReader(tabId, mode).then(
    () => notice(tabId, false),
    (error: unknown) => {
      if (isForbidden(url, error)) notice(tabId, true);
      else console.warn(`Speed Read: could not open the reader (tab ${tabId}, mode ${mode}${url ? `, ${url}` : ''}):`, error);
    },
  );
}

/**
 * Chrome does not run content scripts in tabs that were open before the extension was installed or
 * updated: inject content.js there (it guards itself against a second copy). Tabs that refuse are skipped.
 */
async function injectContent(): Promise<void> {
  const tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => [] as Tab[]);
  await Promise.all(
    tabs.map((tab) => (tab.id === undefined ? undefined : api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => undefined))),
  );
}

/**
 * Firefox only (spec section 13, p3-r17): Firefox accepts `permissions.request` only while the
 * user-input handler runs, so it is the handler's first statement with nothing awaited before it.
 * Chrome is never asked: the toolbar press and the command already grant the tab through
 * `activeTab`, and a request there would prompt on every press. Granted or not, the reader opens.
 */
const IS_FIREFOX = api.runtime.getURL('').startsWith('moz-extension:');

function requestHostAccess(): void {
  if (IS_FIREFOX) api.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
}

async function activeTab(tab?: Tab): Promise<Tab | undefined> {
  if (tab?.id !== undefined) return tab;
  const [active] = await api.tabs.query({ active: true, currentWindow: true });
  return active;
}

api.runtime.onInstalled.addListener(() => {
  api.contextMenus
    .removeAll()
    .catch(() => {})
    .then(() => {
      api.contextMenus.create({ id: 'speed-read-selection', title: 'Speed read selection', contexts: ['selection'] });
      api.contextMenus.create({ id: 'speed-read-from-here', title: 'Speed read from here', contexts: ['page', 'link', 'image'] });
    });
  void injectContent();
});

api.action.onClicked.addListener((tab) => {
  requestHostAccess();
  void open(tab.id, 'auto', tab.url);
});

api.commands.onCommand.addListener((command, tab) => {
  requestHostAccess();
  if (command !== 'speed-read') return;
  void activeTab(tab).then((active) => open(active?.id, 'auto', active?.url));
});

api.contextMenus.onClicked.addListener((info, tab) => {
  const mode = MENU_MODES[String(info.menuItemId)];
  if (!mode) return;
  // The reader runs in the top frame only: a menu used inside a frame reads the page's main content.
  void open(tab?.id, info.frameId ? 'main' : mode, tab?.url);
});

api.runtime.onMessage.addListener((message, sender) => {
  if ((message as { type?: string } | null)?.type === HOVER_MESSAGE.type) void open(sender.tab?.id, 'from-block', sender.tab?.url);
});

// A navigation clears the tab's notice: the next page may well be readable.
api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || change.url !== undefined) notice(tabId, false);
});

// For the browser-level tests only (absent from the packaged build): the handler every entry point
// routes to, callable from the worker.
if (__SR_TEST__) (globalThis as Record<string, unknown>).__speedReadTest = { openReader };
