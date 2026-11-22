import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@speed-read/core';
import { migrateFlowDefault, onSettingsChange, readSettings, writeSettings } from './config';
import * as vscode from 'vscode';
import { __stub } from './test/vscode-stub';

beforeEach(() => __stub.reset());

describe('VS Code reading mode setting', () => {
  it('normalizes absent and invalid stored values to flow and reads chunk', () => {
    expect(readSettings().readingMode).toBe('flow');
    __stub.setConfig({ 'speedRead.readingMode': 'chunk' }, false);
    expect(readSettings().readingMode).toBe('chunk');
    __stub.setConfig({ 'speedRead.readingMode': 'unknown' }, false);
    expect(readSettings().readingMode).toBe('flow');
  });

  it('writes the selected value through speedRead.readingMode', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS, readingMode: 'chunk' });
    expect(__stub.state.configWrites).toContainEqual({
      key: 'speedRead.readingMode',
      value: 'chunk',
      target: expect.anything(),
    });
  });

  it('pushes readingMode to onSettingsChange listeners when the configuration changes', () => {
    const seen: string[] = [];
    const sub = onSettingsChange((s) => seen.push(s.readingMode));
    __stub.setConfig({ 'speedRead.readingMode': 'chunk' });
    expect(seen).toEqual(['chunk']);
    sub.dispose();
  });
});

describe('VS Code focus span setting', () => {
  it('reads speedRead.focusChars, clamped, and writes changes', async () => {
    expect(readSettings().focusChars).toBe(20);
    __stub.setConfig({ 'speedRead.focusChars': 99 }, false);
    expect(readSettings().focusChars).toBe(40);
    await writeSettings({ ...DEFAULT_SETTINGS, focusChars: 12 });
    expect(__stub.state.configWrites).toContainEqual({ key: 'speedRead.focusChars', value: 12, target: expect.anything() });
  });
});

describe('the display setting', () => {
  it('is never read from or written to the VS Code configuration', async () => {
    __stub.setConfig({ 'speedRead.display': 'dock' }, false);
    expect(readSettings().display).toBe('overlay');
    await writeSettings({ ...DEFAULT_SETTINGS, display: 'dock', wpm: 350 });
    expect(__stub.state.configWrites.map((w) => w.key)).toEqual(['speedRead.wpm']);
  });
});

describe('migrateFlowDefault', () => {
  const memento = (initial: Record<string, unknown> = {}) => {
    const data = { ...initial };
    return { data, get: <T>(key: string) => data[key] as T | undefined, update: async (key: string, value: unknown) => void (data[key] = value) };
  };
  const FLAG = 'speedRead.migrated.flowDefault';
  const run = (state = memento()) => migrateFlowDefault(vscode.workspace.getConfiguration('speedRead'), state).then(() => state);
  const writes = () => __stub.state.configWrites.filter((w) => w.key === 'speedRead.readingMode');

  it('moves an explicit global chunk to flow in that scope and sets the flag', async () => {
    __stub.setConfig({ 'speedRead.readingMode': 'chunk' }, false);
    const state = await run();
    expect(writes()).toEqual([{ key: 'speedRead.readingMode', value: 'flow', target: vscode.ConfigurationTarget.Global }]);
    expect(state.data[FLAG]).toBe(true);
  });

  it('moves an explicit workspace chunk in the workspace scope', async () => {
    __stub.setConfig({ 'speedRead.readingMode': 'chunk' }, false);
    __stub.state.configScopes['speedRead.readingMode'] = 'workspace';
    await run();
    expect(writes()).toEqual([{ key: 'speedRead.readingMode', value: 'flow', target: vscode.ConfigurationTarget.Workspace }]);
  });

  it('leaves an unset or flow value alone but still sets the flag', async () => {
    const state = await run();
    expect(writes()).toEqual([]);
    expect(state.data[FLAG]).toBe(true);
  });

  it('does nothing once the flag is set, so a later choice of chunk is kept', async () => {
    __stub.setConfig({ 'speedRead.readingMode': 'chunk' }, false);
    await run(memento({ [FLAG]: true }));
    expect(writes()).toEqual([]);
  });
});
