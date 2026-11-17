import * as vscode from 'vscode';
import { onSettingsChange, readSettings } from './config';
import { ReaderPanel } from './panel';
import { blockStart, findHeadings, hoverable, sectionRange, selectionRange } from './ranges';

const MARKDOWN: vscode.DocumentSelector = { language: 'markdown' };
const READ_FROM_LINE = 'speedRead.readFromLine';

/** CodeLens "▶ Read section" above every Markdown heading (R19). */
export const codeLensProvider: vscode.CodeLensProvider = {
  provideCodeLenses(document) {
    return findHeadings(document.getText()).map(
      (h) => new vscode.CodeLens(new vscode.Range(h.line, 0, h.line, 0), { title: '▶ Read section', command: 'speedRead.readSection', arguments: [h.line] }),
    );
  },
};

/** Hover on headings and paragraph text with a trusted "▶ Speed read from here" command link (R19). */
export const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const text = document.getText();
    if (!hoverable(text, position.line)) return undefined;
    const args = encodeURIComponent(JSON.stringify([blockStart(text, position.line)]));
    const md = new vscode.MarkdownString(`[▶ Speed read from here](command:${READ_FROM_LINE}?${args})`);
    md.isTrusted = { enabledCommands: [READ_FROM_LINE] };
    return new vscode.Hover(md);
  },
};

const lineArg = (value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fallback);

export function activate(context: vscode.ExtensionContext): void {
  const panel = new ReaderPanel(context.extensionUri);

  /** Register a command that reads part of the active editor's document. */
  const command = (id: string, range: (editor: vscode.TextEditor, text: string, ...args: unknown[]) => { startLine: number; endLine?: number }) =>
    vscode.commands.registerCommand(id, (...args: unknown[]) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const { document } = editor;
      panel.show({ document, range: range(editor, document.getText(), ...args), settings: readSettings() });
    });

  context.subscriptions.push(
    panel,
    command('speedRead.readFile', () => ({ startLine: 0 })),
    command('speedRead.readSelection', (editor) => (editor.selection.isEmpty ? { startLine: 0 } : selectionRange(editor.selection))),
    command('speedRead.readFromCursor', (editor, text) => ({ startLine: blockStart(text, editor.selection.active.line) })),
    command('speedRead.readSection', (editor, text, line) =>
      sectionRange(findHeadings(text), lineArg(line, editor.selection.active.line), editor.document.lineCount),
    ),
    command(READ_FROM_LINE, (editor, text, line) => ({ startLine: blockStart(text, lineArg(line, editor.selection.active.line)) })),
    vscode.languages.registerCodeLensProvider(MARKDOWN, codeLensProvider),
    vscode.languages.registerHoverProvider(MARKDOWN, hoverProvider),
    onSettingsChange((settings) => panel.pushSettings(settings)),
  );
}

export function deactivate(): void {}
