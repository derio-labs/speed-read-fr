/**
 * The one shim to the extension APIs (spec section 7): Firefox's `browser`, else Chrome's `chrome`,
 * used through promise-returning calls only. The types below are the subset this extension uses.
 */

export interface ExtEvent<F extends (...args: never[]) => unknown> {
  addListener(fn: F): void;
}

export interface Tab {
  id?: number;
  /** Present for pages the extension may see (host permission or activeTab). */
  url?: string;
}

export interface MessageSender {
  tab?: Tab;
}

export interface MenuClickInfo {
  menuItemId: string | number;
  /** 0 (or absent) for the top frame. */
  frameId?: number;
}

export interface ExtApi {
  action: {
    onClicked: ExtEvent<(tab: Tab) => void>;
    setBadgeText(details: { tabId: number; text: string }): Promise<void>;
    setTitle(details: { tabId: number; title: string }): Promise<void>;
  };
  commands: { onCommand: ExtEvent<(command: string, tab?: Tab) => void> };
  contextMenus: {
    create(item: { id: string; title: string; contexts: string[] }): unknown;
    removeAll(): Promise<void>;
    onClicked: ExtEvent<(info: MenuClickInfo, tab?: Tab) => void>;
  };
  permissions: { request(p: { origins: string[] }): Promise<boolean> };
  runtime: {
    onInstalled: ExtEvent<() => void>;
    onMessage: ExtEvent<(message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => unknown>;
    sendMessage(message: unknown): Promise<unknown>;
    getURL(path: string): string;
  };
  scripting: { executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown> };
  storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
  tabs: {
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    query(q: { active?: boolean; currentWindow?: boolean; url?: string[] }): Promise<Tab[]>;
    onUpdated: ExtEvent<(tabId: number, change: { status?: string; url?: string }) => void>;
  };
}

type ExtScope = { browser?: ExtApi; chrome?: ExtApi };

/**
 * An extension API object, not a page element: a named element (`<form id="browser">` with a control
 * named `runtime`) shows through the global but is never its own property, and has no API functions.
 */
const isApi = (value: unknown): value is ExtApi => {
  if (!value || typeof value !== 'object') return false;
  const runtime = (value as { runtime?: unknown }).runtime as { sendMessage?: unknown; getURL?: unknown } | null | undefined;
  return !!runtime && typeof runtime === 'object' && typeof runtime.sendMessage === 'function' && typeof runtime.getURL === 'function';
};

/** `scope[name]` when it is the scope's own property and a real extension API. */
function own(scope: object, name: keyof ExtScope): ExtApi | undefined {
  if (!Object.prototype.hasOwnProperty.call(scope, name)) return undefined;
  const value = (scope as ExtScope)[name];
  return isApi(value) ? value : undefined;
}

/** The extension API of `scope` (the global object by default): Firefox's `browser`, else Chrome's `chrome`. */
export function ext(scope: object = globalThis): ExtApi | undefined {
  return own(scope, 'browser') ?? own(scope, 'chrome');
}
