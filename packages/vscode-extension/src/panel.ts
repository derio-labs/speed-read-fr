import * as vscode from 'vscode';
import type { Settings } from '@speed-read/core';
import { writeSettings } from './config';
import { createNonce, webviewHtml } from './html';
import type { FromWebview, ReadMessage, ToWebview } from './messages';
import type { LineRange } from './ranges';

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
  private pending: ToWebview | null = null;
  private source: vscode.Uri | null = null;
  private lastLine: number | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

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
    this.source = document.uri;
    this.lastLine = null;
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

  /** Push new settings to the open panel. */
  pushSettings(settings: Settings): void {
    if (this.panel) this.post({ type: 'settings', settings });
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private post(message: ToWebview) {
    if (this.ready) void this.panel?.webview.postMessage(message);
    else this.pending = message;
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
    const source = this.source?.toString();
    if (!source || typeof line !== 'number' || !Number.isInteger(line) || line < 0 || line === this.lastLine) return;
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
        if (message.settings && typeof message.settings === 'object' && !Array.isArray(message.settings)) void writeSettings(message.settings);
        break;
      case 'position':
        this.follow(message.line);
        break;
      case 'close':
        this.panel?.dispose();
        break;
    }
  }
}
