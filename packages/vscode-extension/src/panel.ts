import * as vscode from 'vscode';
import { normalizeSettings, type Settings } from '@speed-read/core';
import { readSettings, writeSettings } from './config';
import { createNonce, webviewHtml } from './html';
import type { FromWebview, ReadMessage, ToWebview } from './messages';
import { blockStart, type LineRange } from './ranges';

/** What to read: a document and a range (`endLine` absent: to the end). */
export interface ReadRequest {
  document: vscode.TextDocument;
  range: Pick<LineRange, 'startLine'> & { endLine?: number };
  settings: Settings;
}

const dirname = (uri: vscode.Uri) => uri.with({ path: uri.path.replace(/\/[^/]*$/, '') || '/' });

/**
 * The reader: one webview panel beside the editor, reused across commands (spec section 8). The
 * webview reports `ready` once its script runs; a read requested before that is sent then.
 */
export class ReaderPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private ready = false;
  private pending: ReadMessage | null = null;
  /** The document of the current read; null once the panel is disposed. */
  private source: vscode.TextDocument | null = null;
  private lastLine: number | null = null;
  /** The source was edited after the read: its lines no longer match, so the cursor stops following. */
  private stale = false;
  private readonly watchEdits: vscode.Disposable;
  /** Settings writes from the webview, run one after another. */
  private writes: Promise<void> = Promise.resolve();
  private pendingWrites = 0;
  private sentSettings: Settings | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.watchEdits = vscode.workspace.onDidChangeTextDocument((e) => {
      if (this.stale || !this.source || e.contentChanges.length === 0) return;
      if (e.document.uri.toString() !== this.source.uri.toString()) return;
      this.stale = true;
      this.post({ type: 'stale' });
    });
  }

  show({ document, range, settings }: ReadRequest): void {
    const roots = this.resourceRoots(document);
    if (!this.panel) this.panel = this.create(roots);
    else {
      const current = this.panel.webview.options.localResourceRoots ?? [];
      if (roots.map(String).join('\n') !== current.map(String).join('\n')) {
        // New options reload the webview: the read waits for the reloaded page's `ready`.
        this.ready = false;
        this.panel.webview.options = { ...this.panel.webview.options, localResourceRoots: roots };
      }
      this.panel.reveal(undefined, false);
    }
    this.source = document;
    this.lastLine = null;
    this.stale = false;
    const message: ReadMessage = {
      type: 'read',
      markdown: document.getText(),
      startLine: range.startLine,
      ...(range.endLine === undefined ? {} : { endLine: range.endLine }),
      settings,
      format: document.languageId === 'markdown' ? 'markdown' : 'plain',
      ...(document.uri.scheme === 'untitled' ? {} : { baseUri: `${this.panel.webview.asWebviewUri(dirname(document.uri)).toString()}/` }),
    };
    this.post(message);
  }

  /**
   * Push new settings to the open panel. Ignored while the webview's own settings are being written:
   * each key's write fires a change, and pushing those intermediate states would roll the reader back.
   */
  pushSettings(settings: Settings): void {
    if (this.panel && this.pendingWrites === 0) this.post({ type: 'settings', settings });
  }

  /** Queue a write of settings the webview sent; once the queue drains, push only what differs. */
  private queueWrite(settings: Settings) {
    this.pendingWrites++;
    this.sentSettings = normalizeSettings(settings);
    this.writes = this.writes
      .then(() => writeSettings(settings))
      .catch(() => {})
      .then(() => {
        if (--this.pendingWrites > 0) return;
        const now = readSettings();
        if (JSON.stringify(now) !== JSON.stringify(this.sentSettings)) this.pushSettings(now);
      });
  }

  dispose(): void {
    this.watchEdits.dispose();
    this.panel?.dispose();
  }

  /**
   * Post to the webview, or hold the message until it is ready. Only a read is held: it carries the
   * settings, so a settings push before it only updates the held read, and a notice is dropped.
   */
  private post(message: ToWebview) {
    if (this.ready) void this.panel?.webview.postMessage(message);
    else if (message.type === 'read') this.pending = message;
    else if (message.type === 'settings' && this.pending?.type === 'read') this.pending = { ...this.pending, settings: message.settings };
  }

  /**
   * Re-read the edited source from the block at the current position: the source editor's cursor,
   * which VS Code moved along with the edits, else the line the webview last read.
   */
  private reread(line: unknown) {
    const document = this.source;
    if (!document || document.isClosed) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === document.uri.toString());
    const at = editor ? editor.selection.active.line : Number.isInteger(line) && (line as number) >= 0 ? (line as number) : 0;
    this.show({ document, range: { startLine: blockStart(document.getText(), at) }, settings: readSettings() });
  }

  private resourceRoots(document: vscode.TextDocument): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')];
    if (document.uri.scheme !== 'untitled') roots.push(dirname(document.uri));
    for (const folder of vscode.workspace.workspaceFolders ?? []) roots.push(folder.uri);
    return roots;
  }

  private create(localResourceRoots: vscode.Uri[]): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      'speedRead.reader',
      'Speed Read',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots },
    );
    const { webview } = panel;
    webview.html = webviewHtml({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')).toString(),
      katexCssUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'katex', 'katex.min.css')).toString(),
    });
    webview.onDidReceiveMessage((message: FromWebview) => this.receive(message));
    panel.onDidDispose(() => {
      if (this.panel !== panel) return;
      this.panel = null;
      this.ready = false;
      this.pending = null;
      this.source = null;
      this.lastLine = null;
    });
    return panel;
  }

  /**
   * Cursor follow (R21): put the source editor's cursor at the start of `line` and reveal it. The
   * selection is set on the editor object, so focus stays in the webview; a closed document, an
   * editor no longer visible or a disposed panel is ignored, and the cursor stays where it was.
   */
  private follow(line: unknown) {
    const source = this.source?.uri.toString();
    if (!source || this.stale || typeof line !== 'number' || !Number.isInteger(line) || line < 0 || line === this.lastLine) return;
    const editor = vscode.window.visibleTextEditors.find((e) => !e.document.isClosed && e.document.uri.toString() === source);
    if (!editor || line >= editor.document.lineCount) return;
    this.lastLine = line;
    const start = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(start, start);
    editor.revealRange(new vscode.Range(start, start), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private receive(message: FromWebview) {
    switch (message?.type) {
      case 'ready':
        this.ready = true;
        if (this.pending) {
          const pending = this.pending;
          this.pending = null;
          this.post(pending);
        }
        break;
      case 'settings':
        if (message.settings && typeof message.settings === 'object' && !Array.isArray(message.settings)) this.queueWrite(message.settings);
        break;
      case 'position':
        this.follow(message.line);
        break;
      case 'reread':
        this.reread(message.line);
        break;
      case 'close':
        this.panel?.dispose();
        break;
    }
  }
}
