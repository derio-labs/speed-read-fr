/**
 * A stub of the parts of the `vscode` API the extension uses, for unit tests (Vitest aliases
 * `vscode` to this file). It records what the extension does; `__stub` drives and inspects it.
 * There is no VS Code in the build environment: the real host is an operator walk.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Listener<T> = (e: T) => unknown;

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  };
  fire(e: T) {
    for (const l of [...this.listeners]) l(e);
  }
  dispose() {
    this.listeners = [];
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  static file(p: string) {
    return new Uri('file', p);
  }
  static parse(value: string) {
    const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(value);
    if (!m) throw new Error(`stub Uri.parse: ${value}`);
    return new Uri(m[1], m[2]);
  }
  static joinPath(base: Uri, ...parts: string[]) {
    return new Uri(base.scheme, [base.path.replace(/\/$/, ''), ...parts].join('/'));
  }
  with(change: { path?: string }) {
    return new Uri(this.scheme, change.path ?? this.path);
  }
  get fsPath() {
    return this.path;
  }
  toString() {
    return `${this.scheme}://${this.path}`;
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    this.start = typeof a === 'number' ? new Position(a, b as number) : a;
    this.end = typeof a === 'number' ? new Position(c as number, d as number) : (b as Position);
  }
  get isEmpty() {
    return this.start.line === this.end.line && this.start.character === this.end.character;
  }
}

export class Selection extends Range {
  constructor(
    readonly anchor: Position,
    readonly active: Position,
  ) {
    super(anchor, active);
  }
}

export class MarkdownString {
  isTrusted?: boolean | { enabledCommands: string[] };
  constructor(public value = '') {}
  appendMarkdown(text: string) {
    this.value += text;
    return this;
  }
}

export class Hover {
  constructor(
    readonly contents: MarkdownString,
    readonly range?: Range,
  ) {}
}

export class CodeLens {
  constructor(
    readonly range: Range,
    readonly command?: { title: string; command: string; arguments?: unknown[] },
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export interface StubDocument {
  uri: Uri;
  languageId: string;
  isClosed: boolean;
  lineCount: number;
  getText(): string;
}

export interface StubEditor {
  document: StubDocument;
  selection: Selection;
  revealed: Range[];
  revealRange(range: Range, type?: TextEditorRevealType): void;
}

export interface StubPanel {
  viewType: string;
  title: string;
  showOptions: unknown;
  options: any;
  webview: {
    html: string;
    options: any;
    /** Times VS Code reloaded the webview because its options changed (the page then reports ready again). */
    reloads: number;
    cspSource: string;
    posted: any[];
    postMessage(message: unknown): Promise<boolean>;
    onDidReceiveMessage: EventEmitter<any>['event'];
    asWebviewUri(uri: Uri): Uri;
    /** Test helper: a message from the webview. */
    receive(message: unknown): void;
  };
  revealed: unknown[];
  disposed: boolean;
  reveal(column?: ViewColumn, preserveFocus?: boolean): void;
  onDidDispose: EventEmitter<void>['event'];
  dispose(): void;
}

function createState() {
  return {
    commands: new Map<string, (...args: any[]) => any>(),
    codeLensProviders: [] as { selector: unknown; provider: any }[],
    hoverProviders: [] as { selector: unknown; provider: any }[],
    panels: [] as StubPanel[],
    config: {} as Record<string, unknown>,
    configWrites: [] as { key: string; value: unknown; target: unknown }[],
    /** Keys whose effective value comes from a workspace or workspace-folder setting. */
    configScopes: {} as Record<string, 'workspace' | 'workspaceFolder'>,
    /** Test hook, called after each configuration write. */
    onUpdate: undefined as undefined | ((key: string, value: unknown) => void),
    configChanged: new EventEmitter<{ affectsConfiguration(section: string): boolean }>(),
    visibleTextEditors: [] as StubEditor[],
    activeTextEditor: undefined as StubEditor | undefined,
    workspaceFolders: [] as { uri: Uri; name: string; index: number }[],
    textDocuments: [] as StubDocument[],
    /** Documents `openTextDocument` can open that are not open yet. */
    files: new Map<string, StubDocument>(),
    activeEditorChanged: new EventEmitter<StubEditor | undefined>(),
    infoMessages: [] as string[],
    focusCalls: 0,
  };
}

let state = createState();

function fireConfigChange(values: Record<string, unknown>) {
  Object.assign(state.config, values);
  state.configChanged.fire({ affectsConfiguration: (s: string) => Object.keys(values).some((k) => k === s || k.startsWith(`${s}.`)) });
}

export const window = {
  get activeTextEditor() {
    return state.activeTextEditor;
  },
  get visibleTextEditors() {
    return state.visibleTextEditors;
  },
  createWebviewPanel(viewType: string, title: string, showOptions: unknown, options: any): StubPanel {
    const received = new EventEmitter<any>();
    const disposed = new EventEmitter<void>();
    let webviewOptions = options;
    const panel: StubPanel = {
      viewType,
      title,
      showOptions,
      options,
      webview: {
        html: '',
        get options() {
          return webviewOptions;
        },
        set options(next) {
          // Real VS Code reloads the webview when its options change.
          if (JSON.stringify(next) !== JSON.stringify(webviewOptions)) panel.webview.reloads++;
          webviewOptions = next;
        },
        reloads: 0,
        cspSource: 'https://stub.vscode-cdn.net',
        posted: [],
        async postMessage(message) {
          panel.webview.posted.push(message);
          return true;
        },
        onDidReceiveMessage: received.event,
        asWebviewUri: (uri) => new (Uri as any)('https', `stub.vscode-cdn.net${uri.path}`),
        receive: (message) => received.fire(message),
      },
      revealed: [],
      disposed: false,
      reveal(column, preserveFocus) {
        panel.revealed.push({ column, preserveFocus });
      },
      onDidDispose: disposed.event,
      dispose() {
        if (panel.disposed) return;
        panel.disposed = true;
        disposed.fire();
      },
    };
    state.panels.push(panel);
    return panel;
  },
  showTextDocument() {
    state.focusCalls++;
  },
  onDidChangeActiveTextEditor: (listener: Listener<StubEditor | undefined>) => state.activeEditorChanged.event(listener),
  async showInformationMessage(message: string) {
    state.infoMessages.push(message);
    return undefined;
  },
};

export const workspace = {
  get workspaceFolders() {
    return state.workspaceFolders;
  },
  get textDocuments() {
    return state.textDocuments.filter((d) => !d.isClosed);
  },
  async openTextDocument(uri: Uri) {
    const doc = state.textDocuments.find((d) => d.uri.toString() === uri.toString()) ?? state.files.get(uri.toString());
    if (!doc) throw new Error(`cannot open ${uri.toString()}`);
    if (!state.textDocuments.includes(doc)) state.textDocuments.push(doc);
    return doc;
  },
  getConfiguration(section?: string) {
    const prefix = section ? `${section}.` : '';
    return {
      get: (key: string, fallback?: unknown) => (prefix + key in state.config ? state.config[prefix + key] : fallback),
      /** The effective value lives in the scope `configScopes` names (global by default). */
      inspect(key: string) {
        const value = state.config[prefix + key];
        const scope = state.configScopes[prefix + key] ?? 'global';
        return { key: prefix + key, [`${scope}Value`]: value };
      },
      async update(key: string, value: unknown, target?: unknown) {
        state.configWrites.push({ key: prefix + key, value, target });
        await Promise.resolve();
        // Like VS Code: each write fires a configuration change event.
        fireConfigChange({ [prefix + key]: value });
        state.onUpdate?.(prefix + key, value);
      },
    };
  },
  onDidChangeConfiguration: (listener: Listener<{ affectsConfiguration(section: string): boolean }>) => state.configChanged.event(listener),
};

export const languages = {
  registerCodeLensProvider(selector: unknown, provider: unknown) {
    state.codeLensProviders.push({ selector, provider });
    return { dispose() {} };
  },
  registerHoverProvider(selector: unknown, provider: unknown) {
    state.hoverProviders.push({ selector, provider });
    return { dispose() {} };
  },
};

export const commands = {
  registerCommand(id: string, fn: (...args: any[]) => any) {
    state.commands.set(id, fn);
    return { dispose: () => state.commands.delete(id) };
  },
  async executeCommand(id: string, ...args: unknown[]) {
    const fn = state.commands.get(id);
    if (!fn) throw new Error(`command not registered: ${id}`);
    return fn(...args);
  },
};

/** Test-side controls. */
export const __stub = {
  reset() {
    state = createState();
  },
  get state() {
    return state;
  },
  /** An open text document (in `workspace.textDocuments`), or with `open: false` one only `openTextDocument` finds. */
  document(text: string, { path = '/work/notes/doc.md', languageId = 'markdown', open = true } = {}): StubDocument {
    const doc = { uri: Uri.file(path), languageId, isClosed: false, lineCount: text.split('\n').length, getText: () => text };
    if (open) state.textDocuments.push(doc);
    else state.files.set(doc.uri.toString(), doc);
    return doc;
  },
  /** Focus moves to the webview: VS Code then reports no active text editor. */
  focusWebview() {
    state.activeTextEditor = undefined;
    state.activeEditorChanged.fire(undefined);
  },
  /** An editor showing `doc`, visible and (by default) active, with the cursor at `line`. */
  editor(doc: StubDocument, { line = 0, active = true, selection }: { line?: number; active?: boolean; selection?: Selection } = {}): StubEditor {
    const editor: StubEditor = {
      document: doc,
      selection: selection ?? new Selection(new Position(line, 0), new Position(line, 0)),
      revealed: [],
      revealRange(range) {
        editor.revealed.push(range);
      },
    };
    state.visibleTextEditors.push(editor);
    if (active) {
      state.activeTextEditor = editor;
      state.activeEditorChanged.fire(editor);
    }
    return editor;
  },
  setConfig(values: Record<string, unknown>, fire = true) {
    if (fire) fireConfigChange(values);
    else Object.assign(state.config, values);
  },
};
