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
  it('yields one "▶ Read section" lens per heading invoking speedRead.readSection with its line', () => {
    const [{ selector, provider }] = __stub.state.codeLensProviders;
    expect(selector).toEqual({ language: 'markdown' });
    const lenses = provider.provideCodeLenses(__stub.document(TEXT));
    expect(lenses.map((l: vscode.CodeLens) => [l.range.start.line, l.command?.title, l.command?.command, l.command?.arguments])).toEqual([
      [0, '▶ Read section', 'speedRead.readSection', [0]],
      [5, '▶ Read section', 'speedRead.readSection', [5]],
      [11, '▶ Read section', 'speedRead.readSection', [11]],
    ]);
  });
});

describe('hover', () => {
  const hover = (line: number, character = 2) => {
    const [{ selector, provider }] = __stub.state.hoverProviders;
    expect(selector).toEqual({ language: 'markdown' });
    return provider.provideHover(__stub.document(TEXT), new Position(line, character)) as vscode.Hover | undefined;
  };
  const link = (line: number) => `[▶ Speed read from here](command:speedRead.readFromLine?${encodeURIComponent(JSON.stringify([line]))})`;

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
    expect(msg).toEqual({ ...base, startLine: 0, baseUri: 'https://stub.vscode-cdn.net/work/notes/' });
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
    expect(await run('speedRead.readSection', 5)).toMatchObject({ startLine: 5, endLine: 10 });
    expect(await run('speedRead.readSection', 0)).toMatchObject({ startLine: 0, endLine: 12 });
  });

  it('readFromLine(line): from that block to the end', async () => {
    __stub.editor(doc());
    const msg = await run('speedRead.readFromLine', 3);
    expect(msg.startLine).toBe(2);
    expect(msg).not.toHaveProperty('endLine');
  });

  it('reuses one panel and reveals it beside the editor', async () => {
    __stub.editor(doc());
    await run('speedRead.readFile');
    await vscode.commands.executeCommand('speedRead.readFromLine', 5);
    await tick();
    expect(__stub.state.panels).toHaveLength(1);
    expect(lastRead().startLine).toBe(5);
    expect(panel().revealed).toContainEqual({ column: vscode.ViewColumn.Beside, preserveFocus: false });
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

  it('does nothing without an active editor', async () => {
    await vscode.commands.executeCommand('speedRead.readFile');
    expect(__stub.state.panels).toHaveLength(0);
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
