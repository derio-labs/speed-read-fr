import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DEFAULT_SETTINGS } from '@speed-read/core';
import { notificationText, ReaderPanel } from './panel';
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

describe('panel reuse', () => {
  const reads = () => panel.webview.posted.filter((m) => m.type === 'read');

  it('a document in another folder changes the resource roots: the webview reloads and the read waits for its ready', () => {
    const other = __stub.document('x', { path: '/elsewhere/b.md' });
    reader.show({ document: other as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
    expect(panel.webview.reloads).toBe(1);
    expect(reads()).toHaveLength(1);
    panel.webview.receive({ type: 'ready' });
    expect(reads()).toHaveLength(2);
    expect(reads()[1].markdown).toBe('x');
  });

  it('a settings push while the reload is pending updates the held read instead of replacing it', () => {
    const other = __stub.document('x', { path: '/elsewhere/b.md' });
    reader.show({ document: other as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
    reader.pushSettings({ ...DEFAULT_SETTINGS, wpm: 410 });
    panel.webview.receive({ type: 'ready' });
    expect(panel.webview.posted.at(-1)).toMatchObject({ type: 'read', markdown: 'x', settings: { wpm: 410 } });
  });

  it('a host that does not reload on the options change: the held read is posted anyway after 1.5 s (l-tests-r6)', () => {
    vi.useFakeTimers();
    try {
      __stub.state.webviewReloadsOnOptions = false;
      const other = __stub.document('x', { path: '/elsewhere/b.md' });
      reader.show({ document: other as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
      expect(panel.webview.reloads).toBe(0);
      vi.advanceTimersByTime(1499);
      expect(reads()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(reads()).toHaveLength(2);
      expect(reads()[1].markdown).toBe('x');
      // A late ready (a slow reload after all) posts the same read again, with the same id.
      panel.webview.receive({ type: 'ready' });
      expect(reads()).toHaveLength(3);
      expect(reads()[2].id).toBe(reads()[1].id);
      // Later messages go straight through.
      panel.webview.receive({ type: 'ready' });
      expect(reads()).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a host that reloads: the ready within 1.5 s posts the read once, and the fallback stays quiet', () => {
    vi.useFakeTimers();
    try {
      const other = __stub.document('x', { path: '/elsewhere/b.md' });
      reader.show({ document: other as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
      expect(panel.webview.reloads).toBe(1);
      vi.advanceTimersByTime(300);
      panel.webview.receive({ type: 'ready' });
      expect(reads()).toHaveLength(2);
      vi.advanceTimersByTime(5000);
      expect(reads()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a document in the same folder is posted at once, without a reload', () => {
    const sibling = __stub.document('y', { path: '/work/notes/c.md' });
    reader.show({ document: sibling as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
    expect(panel.webview.reloads).toBe(0);
    expect(reads()).toHaveLength(2);
  });
});

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

describe('document edited after the read (snapshot)', () => {
  const posted = () => panel.webview.posted;

  it('stops cursor follow and tells the webview, once', () => {
    panel.webview.receive({ type: 'position', line: 2 });
    __stub.changeDocument(editor.document, 'inserted\n' + TEXT);
    __stub.changeDocument(editor.document, 'inserted twice\n' + TEXT);
    expect(posted().filter((m) => m.type === 'stale')).toHaveLength(1);
    panel.webview.receive({ type: 'position', line: 4 });
    expect(at(editor)).toEqual([2, 0, 2, 0]);
  });

  it('ignores events with no content change and edits to other documents', () => {
    __stub.changeDocument(editor.document, TEXT, 0);
    __stub.changeDocument(__stub.document('other', { path: '/work/notes/o.md' }), 'changed');
    expect(posted().filter((m) => m.type === 'stale')).toHaveLength(0);
    panel.webview.receive({ type: 'position', line: 4 });
    expect(at(editor)).toEqual([4, 0, 4, 0]);
  });

  it('re-reads the edited document from the block at the current position, and follows again', () => {
    panel.webview.receive({ type: 'position', line: 4 });
    // VS Code shifts the caret with the edit: two lines inserted above it.
    __stub.changeDocument(editor.document, 'new\n\n' + TEXT);
    editor.selection = new Selection(new Position(6, 0), new Position(6, 0));
    panel.webview.receive({ type: 'reread', line: 4 });
    const read = posted().filter((m) => m.type === 'read').at(-1);
    expect(read).toMatchObject({ markdown: 'new\n\n' + TEXT, startLine: 6 });
    expect(read).not.toHaveProperty('endLine');
    panel.webview.receive({ type: 'position', line: 8 });
    expect(at(editor)).toEqual([8, 0, 8, 0]);
  });

  it('re-reads from the line the webview sends when the source editor is not visible', () => {
    __stub.changeDocument(editor.document, TEXT + '\n\nmore');
    __stub.state.visibleTextEditors.length = 0;
    panel.webview.receive({ type: 'reread', line: 5 });
    expect(posted().filter((m) => m.type === 'read').at(-1)).toMatchObject({ startLine: 6 });
  });
});

describe('re-read of a closed source (l-errors-r8)', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('reopens the document by its URI and reads it', async () => {
    const doc = editor.document;
    doc.isClosed = true;
    __stub.state.visibleTextEditors.length = 0;
    const reopened = { ...doc, isClosed: false, getText: () => TEXT + '\n\nmore' };
    __stub.state.files.set(doc.uri.toString(), reopened);
    __stub.state.textDocuments.length = 0;
    panel.webview.receive({ type: 'reread', line: 4 });
    await settle();
    expect(panel.webview.posted.filter((m) => m.type === 'read').at(-1)).toMatchObject({ markdown: TEXT + '\n\nmore', startLine: 4 });
    expect(__stub.state.errorMessages).toEqual([]);
  });

  it('when it cannot be reopened, says why and tells the webview the source is closed', async () => {
    editor.document.isClosed = true;
    __stub.state.textDocuments.length = 0;
    panel.webview.receive({ type: 'reread', line: 4 });
    await settle();
    expect(__stub.state.errorMessages).toEqual(["Speed Read: couldn't open /work/notes/doc.md: cannot open file:///work/notes/doc.md"]);
    expect(panel.webview.posted.at(-1)).toEqual({ type: 'notice', text: 'Source document is closed' });
  });
});

describe('a refused settings write (l-errors-r4)', () => {
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  };
  afterEach(() => {
    __stub.state.updateError = undefined;
  });

  it('warns once per run of failures, tells the webview, and clears the note after the next good write', async () => {
    __stub.state.updateError = new Error('Unable to write into user settings');
    panel.webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 410 } });
    await settle();
    panel.webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 420 } });
    await settle();
    expect(__stub.state.warningMessages).toEqual(["Speed Read: couldn't save settings: Unable to write into user settings"]);
    expect(panel.webview.posted.filter((m) => m.type === 'save-status')).toEqual([
      { type: 'save-status', ok: false },
      { type: 'save-status', ok: false },
    ]);
    __stub.state.updateError = undefined;
    panel.webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 430 } });
    await settle();
    expect(panel.webview.posted.filter((m) => m.type === 'save-status').at(-1)).toEqual({ type: 'save-status', ok: true });
    __stub.state.updateError = new Error('again');
    panel.webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 440 } });
    await settle();
    expect(__stub.state.warningMessages).toHaveLength(2);
  });
});

describe('a webview that could not render', () => {
  it('shows its error with showErrorMessage', () => {
    panel.webview.receive({ type: 'error', message: 'boom' });
    expect(__stub.state.errorMessages).toEqual(['Speed Read could not render this document: boom']);
  });
});

describe('untrusted text in notifications (l-security-r7)', () => {
  const LINK = '[Fix](command:workbench.action.terminal.sendSequence?x)';
  const safe = (m: string) => {
    expect(m).not.toContain('](');
    expect(m).not.toMatch(/[[\]()`]/);
  };

  it('notificationText removes link syntax, collapses line breaks and caps the length', () => {
    safe(notificationText(`a ${LINK} \`code\``));
    expect(notificationText('one\n\n  two\r\nthree')).toBe('one two three');
    const long = notificationText('x'.repeat(500));
    expect(long.length).toBeLessThanOrEqual(200);
    expect(notificationText(undefined)).toBe('');
  });

  it('the webview error message cannot carry a command link', () => {
    panel.webview.receive({ type: 'error', message: `boom ${LINK}\nsecond line` });
    expect(__stub.state.errorMessages).toHaveLength(1);
    safe(__stub.state.errorMessages[0]);
    expect(__stub.state.errorMessages[0]).not.toContain('\n');
    expect(__stub.state.errorMessages[0]).toMatch(/^Speed Read could not render this document: boom /);
  });

  it('a refused settings write cannot carry a command link', async () => {
    __stub.state.updateError = new Error(`denied ${LINK}`);
    try {
      panel.webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 410 } });
      for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
      expect(__stub.state.warningMessages).toHaveLength(1);
      safe(__stub.state.warningMessages[0]);
    } finally {
      __stub.state.updateError = undefined;
    }
  });

  it('a hostile closed source path cannot carry a command link on Re-read', async () => {
    const doc = __stub.document('text', { path: `/work/${LINK}/doc.md` });
    reader.show({ document: doc as unknown as vscode.TextDocument, range: { startLine: 0 }, settings: DEFAULT_SETTINGS });
    doc.isClosed = true;
    __stub.state.textDocuments.length = 0;
    panel.webview.receive({ type: 'reread', line: 0 });
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(__stub.state.errorMessages).toHaveLength(1);
    safe(__stub.state.errorMessages[0]);
  });
});
