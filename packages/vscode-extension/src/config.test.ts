import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@speed-read/core';
import { readSettings, writeSettings } from './config';
import { __stub } from './test/vscode-stub';

beforeEach(() => __stub.reset());

describe('VS Code reading mode setting', () => {
  it('normalizes absent and invalid stored values to chunk and reads flow', () => {
    expect(readSettings().readingMode).toBe('chunk');
    __stub.setConfig({ 'speedRead.readingMode': 'flow' }, false);
    expect(readSettings().readingMode).toBe('flow');
    __stub.setConfig({ 'speedRead.readingMode': 'unknown' }, false);
    expect(readSettings().readingMode).toBe('chunk');
  });

  it('writes the selected value through speedRead.readingMode', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS, readingMode: 'flow' });
    expect(__stub.state.configWrites).toContainEqual({
      key: 'speedRead.readingMode',
      value: 'flow',
      target: expect.anything(),
    });
  });
});
