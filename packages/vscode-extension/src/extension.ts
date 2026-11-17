import * as vscode from 'vscode';
import { onSettingsChange, readSettings } from './config';
import { couldNotOpen, ReaderPanel } from './panel';
import { blockStart, findHeadings, hoverable, sectionRange, selectionRange } from './ranges';

const MARKDOWN: vscode.DocumentSelector = { language: 'markdown' };
const READ_SECTION = 'speedRead.readSection';
const READ_FROM_LINE = 'speedRead.readFromLine';
const NO_SOURCE = 'Speed Read: open a file to read.';

/** CodeLens "▶ Read section" above every Markdown heading (R19); it names its document and line. */
export const codeLensProvider: vscode.CodeLensProvider = {
  provideCodeLenses(document) {
    const uri = document.uri.toString();
    return findHeadings(document.getText()).map(
      (h) => new vscode.CodeLens(new vscode.Range(h.line, 0, h.line, 0), { title: '▶ Read section', command: READ_SECTION, arguments: [uri, h.line] }),
    );
  },
};

/** Hover on headings and paragraph text with a trusted "▶ Speed read from here" command link (R19). */
export const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const text = document.getText();
    if (!hoverable(text, position.line)) return undefined;
    const args = encodeURIComponent(JSON.stringify([document.uri.toString(), blockStart(text, position.line)]));
    const md = new vscode.MarkdownString(`[▶ Speed read from here](command:${READ_FROM_LINE}?${args})`);
    md.isTrusted = { enabledCommands: [READ_FROM_LINE] };
    return new vscode.Hover(md);
  },
};

const isLine = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

interface Source {
  document: vscode.TextDocument;
  /** The editor, when the read comes from one (its selection and cursor). */
  editor?: vscode.TextEditor;
}

type Range = { startLine: number; endLine?: number };

export function activate(context: vscode.ExtensionContext): void {
  const panel = new ReaderPanel(context.extensionUri);

  // The last text editor that had focus: while the reader has focus there is no active text editor.
  let lastEditor = vscode.window.activeTextEditor;
  const trackEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) lastEditor = editor;
  });

  function sourceEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor ?? lastEditor;
    return editor && !editor.document.isClosed ? editor : undefined;
  }

  /**
   * The document named by a lens or hover argument, opened when needed. One that cannot be opened
   * (deleted or moved since the lens or hover was shown) is reported with its path and the cause.
   */
  async function namedDocument(uri: string): Promise<vscode.TextDocument | null> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
    if (open) return open;
    let path = uri;
    try {
      const parsed = vscode.Uri.parse(uri);
      path = parsed.scheme === 'file' ? parsed.fsPath : uri;
      return await vscode.workspace.openTextDocument(parsed);
    } catch (error) {
      void vscode.window.showErrorMessage(couldNotOpen(path, error));
      return null;
    }
  }

  function read(source: Source | undefined, range: (source: Source, text: string) => Range) {
    if (!source) {
      void vscode.window.showInformationMessage(NO_SOURCE);
      return;
    }
    const { document } = source;
    panel.show({ document, range: range(source, document.getText()), settings: readSettings() });
  }

  const cursorLine = (source: Source) => source.editor?.selection.active.line ?? 0;

  /** A palette command: reads from the active (or last) source editor. */
  const editorCommand = (id: string, range: (source: Source, text: string) => Range) =>
    vscode.commands.registerCommand(id, () => {
      const editor = sourceEditor();
      read(editor && { document: editor.document, editor }, range);
    });

  /** A lens or hover command: `(uri, line)` names the document; a bare `(line)` uses the source editor. */
  const lineCommand = (id: string, range: (source: Source, text: string, line: number) => Range) =>
    vscode.commands.registerCommand(id, async (first?: unknown, second?: unknown) => {
      let source: Source | undefined;
      let line: number | undefined;
      if (typeof first === 'string') {
        const document = await namedDocument(first);
        if (!document) return;
        source = { document };
        line = isLine(second) ? second : undefined;
      } else {
        const editor = sourceEditor();
        source = editor && { document: editor.document, editor };
        line = isLine(first) ? first : undefined;
      }
      read(source, (s, text) => range(s, text, line ?? cursorLine(s)));
    });

  context.subscriptions.push(
    panel,
    trackEditor,
    editorCommand('speedRead.readFile', () => ({ startLine: 0 })),
    editorCommand('speedRead.readSelection', ({ editor }) => (!editor || editor.selection.isEmpty ? { startLine: 0 } : selectionRange(editor.selection))),
    editorCommand('speedRead.readFromCursor', (source, text) => ({ startLine: blockStart(text, cursorLine(source)) })),
    lineCommand(READ_SECTION, ({ document }, text, line) => sectionRange(findHeadings(text), line, document.lineCount)),
    lineCommand(READ_FROM_LINE, (_source, text, line) => ({ startLine: blockStart(text, line) })),
    vscode.languages.registerCodeLensProvider(MARKDOWN, codeLensProvider),
    vscode.languages.registerHoverProvider(MARKDOWN, hoverProvider),
    onSettingsChange((settings) => panel.pushSettings(settings)),
  );
}

export function deactivate(): void {}
