import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { DEFAULT_SETTINGS } from '@speed-read/core';
import { activate } from './extension';
import { __stub, Position, Selection, type StubPanel } from './test/vscode-stub';

const TEXT = [
  '# Title', //            0
  '', //                   1
  'Intro paragraph', //    2
  'continues here.', //    3
  '', //                   4
  '## Part one', //        5
  '', //                   6
  '```sh', //              7
  '# not a heading', //    8
  '```', //                9
  '', //                  10
  '## Part two', //       11
  'last', //              12
].join('\n');

const context = () => ({ subscriptions: [] as { dispose(): unknown }[], extensionUri: vscode.Uri.file('/ext') });
const tick = () => new Promise((r) => setTimeout(r, 0));

let ctx: ReturnType<typeof context>;

beforeEach(() => {
  __stub.reset();
  ctx = context();
  activate(ctx as unknown as vscode.ExtensionContext);
});

const panel = (): StubPanel => __stub.state.panels.at(-1)!;
const lastRead = () => panel().webview.posted.filter((m) => m.type === 'read').at(-1);

/** Run a command and let the webview report ready, so the read message is posted. */
async function run(command: string, ...args: unknown[]) {
  await vscode.commands.executeCommand(command, ...args);
  panel().webview.receive({ type: 'ready' });
  await tick();
  return lastRead();
}

describe('CodeLens', () => {
  it('yields one "▶ Read section" lens per heading invoking speedRead.readSection with the document and its line', () => {
    const [{ selector, provider }] = __stub.state.codeLensProviders;
    expect(selector).toEqual({ language: 'markdown' });
    const lenses = provider.provideCodeLenses(__stub.document(TEXT));
    expect(lenses.map((l: vscode.CodeLens) => [l.range.start.line, l.command?.title, l.command?.command, l.command?.arguments])).toEqual([
      [0, '▶ Read section', 'speedRead.readSection', ['file:///work/notes/doc.md', 0]],
      [5, '▶ Read section', 'speedRead.readSection', ['file:///work/notes/doc.md', 5]],
      [11, '▶ Read section', 'speedRead.readSection', ['file:///work/notes/doc.md', 11]],
    ]);
  });
});

describe('hover', () => {
  const hover = (line: number, character = 2) => {
    const [{ selector, provider }] = __stub.state.hoverProviders;
    expect(selector).toEqual({ language: 'markdown' });
    return provider.provideHover(__stub.document(TEXT), new Position(line, character)) as vscode.Hover | undefined;
  };
  const link = (line: number) => `[▶ Speed read from here](command:speedRead.readFromLine?${encodeURIComponent(JSON.stringify(['file:///work/notes/doc.md', line]))})`;

  it('on a heading: a trusted link reading from the heading', () => {
    const h = hover(5)!;
    const md = h.contents as unknown as vscode.MarkdownString;
    expect(md.value).toBe(link(5));
    expect(md.isTrusted).toEqual({ enabledCommands: ['speedRead.readFromLine'] });
  });

  it('on paragraph text: a link reading from the paragraph start', () => {
    expect((hover(3)!.contents as unknown as vscode.MarkdownString).value).toBe(link(2));
  });

  it('nothing inside fenced code or on blank lines', () => {
    expect(hover(7)).toBeUndefined();
    expect(hover(8)).toBeUndefined();
    expect(hover(9)).toBeUndefined();
    expect(hover(1)).toBeUndefined();
  });
});

describe('commands', () => {
  const doc = () => __stub.document(TEXT);
  const base = { type: 'read', markdown: TEXT, format: 'markdown', settings: DEFAULT_SETTINGS };

  it('readFile: the whole file, in a panel beside the editor', async () => {
    __stub.editor(doc());
    const msg = await run('speedRead.readFile');
    expect(msg).toEqual({ ...base, startLine: 0, baseUri: 'https://stub.vscode-cdn.net/work/notes/', id: expect.any(Number) });
    expect(panel().showOptions).toMatchObject({ viewColumn: vscode.ViewColumn.Beside });
    expect(panel().options).toMatchObject({ enableScripts: true });
  });

  it('readSelection: the selection widened to whole lines; an empty selection reads the file', async () => {
    __stub.editor(doc(), { selection: new Selection(new Position(2, 4), new Position(3, 1)) });
    expect(await run('speedRead.readSelection')).toMatchObject({ startLine: 2, endLine: 3 });
    __stub.state.activeTextEditor!.selection = new Selection(new Position(3, 2), new Position(3, 2));
    const msg = await run('speedRead.readSelection');
    expect(msg.startLine).toBe(0);
    expect(msg).not.toHaveProperty('endLine');
  });

  it('readFromCursor: from the first line of the block holding the cursor to the end', async () => {
    __stub.editor(doc(), { line: 3 });
    const msg = await run('speedRead.readFromCursor');
    expect(msg.startLine).toBe(2);
    expect(msg).not.toHaveProperty('endLine');
  });

  it('readSection(line): the heading to the line before the next same-or-higher heading', async () => {
    __stub.editor(doc());
    expect(await run('speedRead.readSection', 'file:///work/notes/doc.md', 5)).toMatchObject({ startLine: 5, endLine: 10 });
    expect(await run('speedRead.readSection', 'file:///work/notes/doc.md', 0)).toMatchObject({ startLine: 0, endLine: 12 });
  });

  it('readFromLine(line): from that block to the end', async () => {
    __stub.editor(doc());
    const msg = await run('speedRead.readFromLine', 'file:///work/notes/doc.md', 3);
    expect(msg.startLine).toBe(2);
    expect(msg).not.toHaveProperty('endLine');
  });

  it('reuses one panel and reveals it in the column it is in', async () => {
    __stub.editor(doc());
    await run('speedRead.readFile');
    await vscode.commands.executeCommand('speedRead.readFromLine', 'file:///work/notes/doc.md', 5);
    await tick();
    expect(__stub.state.panels).toHaveLength(1);
    expect(lastRead().startLine).toBe(5);
    expect(panel().revealed).toEqual([{ column: undefined, preserveFocus: false }]);
  });

  it('sends a non-Markdown file as plain prose', async () => {
    __stub.editor(__stub.document('plain words\n# not markdown', { path: '/work/a.txt', languageId: 'plaintext' }));
    expect(await run('speedRead.readFile')).toMatchObject({ format: 'plain', markdown: 'plain words\n# not markdown' });
  });

  it('sends the configured settings', async () => {
    __stub.setConfig({ 'speedRead.wpm': 450, 'speedRead.code.mode': 'skip' }, false);
    __stub.editor(doc());
    const msg = await run('speedRead.readFile');
    expect(msg.settings).toEqual({ ...DEFAULT_SETTINGS, wpm: 450, code: { mode: 'skip', dwellSeconds: 5 } });
  });

  it('with no source editor at all: no panel, an information message', async () => {
    await vscode.commands.executeCommand('speedRead.readFile');
    expect(__stub.state.panels).toHaveLength(0);
    expect(__stub.state.infoMessages).toEqual(['Speed Read: open a file to read.']);
  });

  it('lens and hover commands read the document they name, while the reader has focus', async () => {
    __stub.editor(doc());
    const other = __stub.document('# Other\n\ntext', { path: '/work/notes/other.md' });
    __stub.focusWebview();
    expect(await run('speedRead.readSection', other.uri.toString(), 0)).toMatchObject({ markdown: '# Other\n\ntext', startLine: 0, endLine: 2 });
    expect(await run('speedRead.readFromLine', 'file:///work/notes/doc.md', 3)).toMatchObject({ markdown: TEXT, startLine: 2 });
  });

  it('opens a named document that is not open yet', async () => {
    const closed = __stub.document('para', { path: '/work/notes/closed.md', open: false });
    expect(await run('speedRead.readFromLine', closed.uri.toString(), 0)).toMatchObject({ markdown: 'para', startLine: 0 });
  });

  it('a named document that cannot be opened (deleted or moved) says so, with its path and the cause (l-errors-r7)', async () => {
    await vscode.commands.executeCommand('speedRead.readFromLine', 'file:///work/notes/gone.md', 0);
    await tick();
    expect(__stub.state.infoMessages).toEqual([]);
    expect(__stub.state.errorMessages).toEqual(["Speed Read: couldn't open /work/notes/gone.md: cannot open file:///work/notes/gone.md"]);
    expect(__stub.state.panels).toHaveLength(0);
  });

  it('a hostile path cannot put a command link into the notification (l-security-r7)', async () => {
    const hostile = 'file:///work/[Fix](command:workbench.action.terminal.sendSequence?x)/notes.md';
    await vscode.commands.executeCommand('speedRead.readFromLine', hostile, 0);
    await tick();
    expect(__stub.state.errorMessages).toHaveLength(1);
    const [message] = __stub.state.errorMessages;
    expect(message).not.toContain('](');
    expect(message).not.toMatch(/\[[^\]]*\]\s*\(\s*command:/);
    expect(message).not.toMatch(/[[\]()`]/);
    expect(message).toMatch(/^Speed Read: couldn't open /);
  });

  it('palette commands fall back to the last source editor while the reader has focus', async () => {
    __stub.editor(doc(), { line: 3 });
    __stub.focusWebview();
    expect((await run('speedRead.readFromCursor')).startLine).toBe(2);
    expect(__stub.state.infoMessages).toEqual([]);
  });

  it('does not fall back to an editor whose document was closed', async () => {
    const editor = __stub.editor(doc());
    __stub.focusWebview();
    editor.document.isClosed = true;
    await vscode.commands.executeCommand('speedRead.readFile');
    expect(__stub.state.panels).toHaveLength(0);
    expect(__stub.state.infoMessages).toHaveLength(1);
  });

  it('registers every command and provider on the context', () => {
    expect([...__stub.state.commands.keys()].sort()).toEqual(
      ['speedRead.readFile', 'speedRead.readFromCursor', 'speedRead.readFromLine', 'speedRead.readSection', 'speedRead.readSelection'],
    );
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(7);
  });
});

describe('panel HTML', () => {
  const csp = (html: string) => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];

  it('writes exactly the spec CSP with a fresh nonce per panel, and nonced script', async () => {
    __stub.editor(__stub.document(TEXT));
    await run('speedRead.readFile');
    const first = panel().webview.html;
    const nonce = /'nonce-([A-Za-z0-9]+)'/.exec(first)![1];
    expect(nonce.length).toBeGreaterThanOrEqual(16);
    expect(csp(first)).toBe(
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src https://stub.vscode-cdn.net 'unsafe-inline'; font-src https://stub.vscode-cdn.net; img-src https://stub.vscode-cdn.net data:`,
    );
    expect(first).toContain(`<script nonce="${nonce}" src="https://stub.vscode-cdn.net/ext/dist/webview.js"></script>`);
    expect(first).toContain('href="https://stub.vscode-cdn.net/ext/media/katex/katex.min.css"');
    expect(first.match(/<script/g)).toHaveLength(1);
    panel().dispose();
    await run('speedRead.readFile');
    const second = /'nonce-([A-Za-z0-9]+)'/.exec(panel().webview.html)![1];
    expect(second).not.toBe(nonce);
  });

  it('limits localResourceRoots to dist, media, the document folder and workspace folders', async () => {
    __stub.state.workspaceFolders.push({ uri: vscode.Uri.file('/work'), name: 'work', index: 0 });
    __stub.editor(__stub.document(TEXT));
    await run('speedRead.readFile');
    const roots = panel().webview.options.localResourceRoots.map((u: vscode.Uri) => u.toString());
    expect(roots).toEqual(['file:///ext/dist', 'file:///ext/media', 'file:///work/notes', 'file:///work']);
  });
});

describe('settings', () => {
  beforeEach(async () => {
    __stub.editor(__stub.document(TEXT));
    await run('speedRead.readFile');
  });

  it('writes a settings message from the webview back to speedRead.* (changed keys only)', async () => {
    panel().webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 520, table: { mode: 'dwell', dwellSeconds: 8 } } });
    await tick();
    expect(__stub.state.configWrites.map((w) => [w.key, w.value, w.target])).toEqual([
      ['speedRead.wpm', 520, vscode.ConfigurationTarget.Global],
      ['speedRead.table.mode', 'dwell', vscode.ConfigurationTarget.Global],
      ['speedRead.table.dwellSeconds', 8, vscode.ConfigurationTarget.Global],
    ]);
  });

  const pushes = () => panel().webview.posted.filter((m) => m.type === 'settings');
  const settle = async () => {
    for (let i = 0; i < 20; i++) await tick();
  };

  it('serialises the writes and pushes no intermediate settings back while they run', async () => {
    panel().webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 400, chunkWords: 2 } });
    panel().webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 500, chunkWords: 2 } });
    await settle();
    expect(__stub.state.configWrites.map((w) => [w.key, w.value])).toEqual([
      ['speedRead.wpm', 400],
      ['speedRead.chunkWords', 2],
      ['speedRead.wpm', 500],
    ]);
    expect(__stub.state.config['speedRead.wpm']).toBe(500);
    expect(pushes()).toEqual([]);
  });

  it('pushes once after the writes when the configuration ended up different from what the webview sent', async () => {
    __stub.state.onUpdate = () => {
      __stub.state.onUpdate = undefined;
      __stub.setConfig({ 'speedRead.imageDwellSeconds': 9 });
    };
    panel().webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 520, chunkWords: 4 } });
    await settle();
    expect(pushes()).toEqual([{ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 520, chunkWords: 4, imageDwellSeconds: 9 } }]);
  });

  it('writes each key to the scope its effective value comes from', async () => {
    __stub.state.configScopes['speedRead.wpm'] = 'workspace';
    __stub.state.configScopes['speedRead.chunkWords'] = 'workspaceFolder';
    __stub.setConfig({ 'speedRead.wpm': 300, 'speedRead.chunkWords': 3 }, false);
    panel().webview.receive({ type: 'settings', settings: { ...DEFAULT_SETTINGS, wpm: 333, chunkWords: 4, chunkChars: 30 } });
    await settle();
    expect(__stub.state.configWrites.map((w) => [w.key, w.target])).toEqual([
      ['speedRead.wpm', vscode.ConfigurationTarget.Workspace],
      ['speedRead.chunkWords', vscode.ConfigurationTarget.WorkspaceFolder],
      ['speedRead.chunkChars', vscode.ConfigurationTarget.Global],
    ]);
  });

  it('ignores a malformed settings message', async () => {
    panel().webview.receive({ type: 'settings', settings: 'nope' });
    await tick();
    expect(__stub.state.configWrites).toEqual([]);
  });

  it('pushes configuration changes to the open panel', async () => {
    __stub.setConfig({ 'speedRead.chunkWords': 5 });
    await tick();
    expect(panel().webview.posted.at(-1)).toEqual({ type: 'settings', settings: { ...DEFAULT_SETTINGS, chunkWords: 5 } });
  });

  it('closes the panel when the reader is closed', () => {
    panel().webview.receive({ type: 'close' });
    expect(panel().disposed).toBe(true);
  });
});
