/**
 * The one shim to the extension APIs (spec section 7): Firefox's `browser`, else Chrome's `chrome`,
 * used through promise-returning calls only. The types below are the subset this extension uses.
 */

export interface ExtEvent<F extends (...args: never[]) => unknown> {
  addListener(fn: F): void;
}

export interface Tab {
  id?: number;
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
  action: { onClicked: ExtEvent<(tab: Tab) => void> };
  commands: { onCommand: ExtEvent<(command: string, tab?: Tab) => void> };
  contextMenus: {
    create(item: { id: string; title: string; contexts: string[] }): unknown;
    removeAll(): Promise<void>;
    onClicked: ExtEvent<(info: MenuClickInfo, tab?: Tab) => void>;
  };
  permissions: { request(p: { origins: string[] }): Promise<boolean> };
  runtime: {
    onInstalled: ExtEvent<() => void>;
    onMessage: ExtEvent<(message: unknown, sender: MessageSender) => unknown>;
    sendMessage(message: unknown): Promise<unknown>;
  };
  scripting: { executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown> };
  storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
  tabs: {
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    query(q: { active: boolean; currentWindow: boolean }): Promise<Tab[]>;
  };
}

type ExtScope = { browser?: ExtApi; chrome?: ExtApi };

/** An extension API object, not a page element that an `id` made a named property of the global. */
const isApi = (value: unknown): value is ExtApi =>
  !!value && typeof value === 'object' && typeof (value as { runtime?: unknown }).runtime === 'object' && !!(value as { runtime?: unknown }).runtime;

/** The extension API of `scope` (the global object by default), or undefined outside an extension. */
export function ext(scope: object = globalThis): ExtApi | undefined {
  const s = scope as ExtScope;
  if (isApi(s.browser)) return s.browser;
  return isApi(s.chrome) ? s.chrome : undefined;
}
