// The README covers install, usage, keys, settings and the known limits (R23, row install-docs).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

/** The text of the section under `heading` (to the next heading of the same or a higher level). */
function section(heading: string): string {
  const level = heading.match(/^#+/)![0].length;
  const start = readme.split('\n').findIndex((line) => line.trim() === heading);
  expect(start, `heading "${heading}"`).toBeGreaterThanOrEqual(0);
  const lines = readme.split('\n').slice(start + 1);
  const end = lines.findIndex((line) => /^#+ /.test(line) && line.match(/^#+/)![0].length <= level);
  return (end < 0 ? lines : lines.slice(0, end)).join('\n');
}

describe('README', () => {
  it('has the sections Install (Chrome, Firefox, VS Code), Usage, Keys, Settings, Offline and text-to-speech, Known limits, Development, License', () => {
    for (const h of ['## Install', '### Chrome', '### Firefox', '### VS Code', '## Usage', '## Keys', '## Settings', '## Offline and text-to-speech', '## Known limits', '## Development', '## License']) {
      section(h);
    }
  });

  it('install steps name the load paths and commands for each target', () => {
    expect(section('### Chrome')).toContain('chrome://extensions');
    expect(section('### Chrome')).toContain('packages/browser-extension/dist/chrome');
    expect(section('### Firefox')).toContain('about:debugging');
    expect(section('### Firefox')).toContain('dist/firefox/manifest.json');
    expect(section('### Firefox')).toContain('xpinstall.signatures.required');
    expect(section('### VS Code')).toContain('code --install-extension dist/speed-read-vscode.vsix');
  });

  it('names every key of R11', () => {
    const keys = section('## Keys');
    for (const key of ['Space', 'Left', 'Right', 'Up', 'Down', '`N`', '`P`', 'Tab', '`E`', 'Esc']) expect(keys, key).toContain(key);
  });

  it('names every setting of R12 with its default, and the page fade', () => {
    const settings = section('## Settings');
    for (const name of ['Speed', 'Words per chunk', 'Characters per chunk', 'Stop at headings', 'Code', 'Tables', 'Math', 'Images and diagrams', 'Display', 'Text-to-speech', 'Page fade']) {
      expect(settings, name).toContain(name);
    }
    for (const value of ['300', 'H1 and H2', '20', '5 s', '3 s', 'Overlay', '32 %']) expect(settings, value).toContain(value);
  });

  it('documents the dial, the floating overlay and the narrow layout', () => {
    const usage = section('## Usage');
    for (const word of ['dial', 'wheel', 'faded', 'narrow']) expect(usage.toLowerCase(), word).toContain(word);
  });

  it('lists the known limits', () => {
    const limits = section('## Known limits').toLowerCase();
    for (const phrase of ['alt+click', 'ancestor', 'inline math', 'mermaid', 'chat panels', 'block', 'frame', 'fixed', 'operator']) {
      expect(limits, phrase).toContain(phrase);
    }
  });
});
