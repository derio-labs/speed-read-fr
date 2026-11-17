import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { DEFAULT_SETTINGS } from '@speed-read/core';
import { ReaderPanel } from './panel';
import { __stub, Position, Selection, type StubEditor, type StubPanel } from './test/vscode-stub';

const TEXT = ['# Title', '', 'one', '', 'two', '', 'three'].join('\n');

let reader: ReaderPanel;
let editor: StubEditor;
let panel: StubPanel;

beforeEach(() => {
  __stub.reset();
  const doc = __stub.document(TEXT);
  editor = __stub.editor(doc, { line: 0 });
  reader = new ReaderPanel(vscode.Uri.file('/ext'));
  reader.show({ document: doc as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
  panel = __stub.state.panels[0];
  panel.webview.receive({ type: 'ready' });
});

const at = (e: StubEditor) => [e.selection.active.line, e.selection.active.character, e.selection.anchor.line, e.selection.anchor.character];

describe('cursor follow (R21)', () => {
  it('moves the selection to the start of the line and reveals it, without focusing the editor', () => {
    editor.selection = new Selection(new Position(0, 3), new Position(0, 5));
    panel.webview.receive({ type: 'position', line: 4 });
    expect(at(editor)).toEqual([4, 0, 4, 0]);
    expect(editor.revealed).toHaveLength(1);
    expect(editor.revealed[0].start.line).toBe(4);
    expect(__stub.state.focusCalls).toBe(0);
  });

  it('does nothing for a repeated identical line', () => {
    panel.webview.receive({ type: 'position', line: 2 });
    editor.selection = new Selection(new Position(6, 1), new Position(6, 1));
    panel.webview.receive({ type: 'position', line: 2 });
    expect(at(editor)).toEqual([6, 1, 6, 1]);
    expect(editor.revealed).toHaveLength(1);
  });

  it('leaves the selection where it is when the panel is disposed', () => {
    panel.webview.receive({ type: 'position', line: 6 });
    panel.dispose();
    expect(at(editor)).toEqual([6, 0, 6, 0]);
    panel.webview.receive({ type: 'position', line: 2 });
    expect(at(editor)).toEqual([6, 0, 6, 0]);
  });

  it('ignores a message for a document that was closed', () => {
    editor.document.isClosed = true;
    __stub.state.visibleTextEditors.length = 0;
    panel.webview.receive({ type: 'position', line: 4 });
    expect(at(editor)).toEqual([0, 0, 0, 0]);
    expect(editor.revealed).toHaveLength(0);
  });

  it('follows in a visible editor of the document that is not the active one', () => {
    __stub.state.activeTextEditor = undefined;
    panel.webview.receive({ type: 'position', line: 4 });
    expect(at(editor)).toEqual([4, 0, 4, 0]);
  });

  it('ignores lines outside the document and malformed messages', () => {
    panel.webview.receive({ type: 'position', line: 99 });
    panel.webview.receive({ type: 'position', line: -1 });
    panel.webview.receive({ type: 'position', line: '3' });
    expect(at(editor)).toEqual([0, 0, 0, 0]);
  });

  it('follows the newly read document after a second read', () => {
    const other = __stub.document('a\n\nb', { path: '/work/notes/other.md' });
    const otherEditor = __stub.editor(other);
    reader.show({ document: other as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
    panel.webview.receive({ type: 'position', line: 2 });
    expect(at(otherEditor)).toEqual([2, 0, 2, 0]);
    expect(at(editor)).toEqual([0, 0, 0, 0]);
  });
});
