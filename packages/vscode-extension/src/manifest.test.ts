import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@speed-read/core';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vscodeignore = readFileSync(new URL('../.vscodeignore', import.meta.url), 'utf8');

/** `{ a: { b: 1 } }` -> `{ 'a.b': 1 }`; arrays and null are leaves. */
function flatten(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, name));
    else out[name] = v;
  }
  return out;
}

const COMMANDS = ['speedRead.readFile', 'speedRead.readSelection', 'speedRead.readFromCursor', 'speedRead.readSection', 'speedRead.readFromLine'];

describe('VS Code extension manifest', () => {
  it('has the publishing fields', () => {
    expect(pkg.publisher).toEqual(expect.any(String));
    expect(pkg.repository?.url ?? pkg.repository).toMatch(/github\.com/);
    expect(pkg.license).toBe('MIT');
    expect(pkg.engines?.vscode).toMatch(/^\^1\.\d+\.\d+$/);
    expect(pkg.main).toBe('./dist/extension.js');
  });

  it('contributes the five commands', () => {
    const ids = pkg.contributes.commands.map((c: { command: string }) => c.command);
    expect(ids.sort()).toEqual([...COMMANDS].sort());
    // The palette shows "category: title", so a title must not repeat the category.
    expect(pkg.contributes.commands.map((c: { title: string; category: string }) => [c.category, c.title])).toEqual([
      ['Speed Read', 'Read File'],
      ['Speed Read', 'Read Selection'],
      ['Speed Read', 'Read From Cursor'],
      ['Speed Read', 'Read Section'],
      ['Speed Read', 'Read From Line'],
    ]);
  });

  it('hides the line-argument commands from the palette', () => {
    const hidden = (pkg.contributes.menus?.commandPalette ?? []).filter((m: { when: string }) => m.when === 'false').map((m: { command: string }) => m.command);
    expect(hidden.sort()).toEqual(['speedRead.readFromLine', 'speedRead.readSection']);
  });

  it('binds Alt+Shift+R in Markdown editors: selection when there is one, else the file', () => {
    const bindings = pkg.contributes.keybindings.filter((k: { key: string }) => k.key === 'alt+shift+r');
    expect(bindings).toHaveLength(2);
    const byCommand = Object.fromEntries(bindings.map((k: { command: string; when: string }) => [k.command, k.when]));
    expect(byCommand['speedRead.readSelection']).toBe('editorTextFocus && editorLangId == markdown && editorHasSelection');
    expect(byCommand['speedRead.readFile']).toBe('editorTextFocus && editorLangId == markdown && !editorHasSelection');
  });

  it('activates on Markdown', () => {
    expect(pkg.activationEvents).toContain('onLanguage:markdown');
  });

  it('has a speedRead.* configuration property for every setting, defaulting to DEFAULT_SETTINGS', () => {
    const props = pkg.contributes.configuration.properties as Record<string, { default: unknown; description?: string; markdownDescription?: string }>;
    const expected = flatten(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
    expect(Object.keys(props).sort()).toEqual(Object.keys(expected).map((k) => `speedRead.${k}`).sort());
    for (const [key, value] of Object.entries(expected)) {
      expect(props[`speedRead.${key}`].default, key).toEqual(value);
      expect(props[`speedRead.${key}`].description ?? props[`speedRead.${key}`].markdownDescription, key).toEqual(expect.any(String));
    }
  });

  it('contributes the Reading mode selector with the chunk default', () => {
    const readingMode = pkg.contributes.configuration.properties['speedRead.readingMode'];
    expect(readingMode).toMatchObject({ type: 'string', enum: ['chunk', 'flow'], default: 'chunk' });
    expect(readingMode.description).toMatch(/reading mode/i);
  });

  it('packages only dist, media, package.json, README.md and LICENSE', () => {
    const lines = vscodeignore.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines).toEqual(['**', '!dist/**', '!media/**', '!package.json', '!README.md', '!LICENSE']);
  });
});

describe('bundled KaTeX (l-security-r4)', () => {
  const lock = JSON.parse(readFileSync(new URL('../../../package-lock.json', import.meta.url), 'utf8')) as { packages: Record<string, { version?: string }> };
  const root = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  const atLeast = (version: string, min: number[]) => {
    const parts = version.split('.').map(Number);
    for (let i = 0; i < min.length; i++) if (parts[i] !== min[i]) return parts[i] > min[i];
    return true;
  };

  it('is pinned to a version outside GHSA-238p-pmpm-9mq7 (fixed in 0.18.2), for the webview and for Mermaid alike', () => {
    expect(pkg.devDependencies.katex).toMatch(/^\d+\.\d+\.\d+$/);
    expect(atLeast(pkg.devDependencies.katex, [0, 18, 2])).toBe(true);
    expect(root.overrides?.katex).toBe(pkg.devDependencies.katex);
    const copies = Object.entries(lock.packages).filter(([path]) => /(^|\/)node_modules\/katex$/.test(path));
    expect(copies.map(([, entry]) => entry.version)).toEqual([pkg.devDependencies.katex]);
  });
});
