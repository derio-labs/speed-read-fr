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

describe('README content pinned by the review (p5b-r13)', () => {
  it('the offline and text-to-speech section states the voice rules', () => {
    const tts = section('## Offline and text-to-speech');
    for (const phrase of ['off by default', '**local**', '**network**', 'No offline voice installed', 'This voice needs a network connection', 'Speech failed: showing text only']) {
      expect(tts, phrase).toContain(phrase);
    }
  });

  it('states every default of R12 and R29 in the settings table', () => {
    const settings = section('## Settings');
    const row = (name: string) => settings.split('\n').find((l) => l.startsWith(`| ${name} |`)) ?? '';
    expect(row('Speed')).toContain('300 WPM');
    expect(row('Words per chunk')).toContain('| 3 |');
    expect(row('Characters per chunk')).toContain('20');
    expect(row('Stop at headings')).toContain('H1 and H2');
    for (const kind of ['Code', 'Tables', 'Math']) expect(row(kind)).toMatch(/Stop \(Dwell: 5 s\)/);
    expect(row('Images and diagrams')).toContain('3 s');
    expect(row('Display')).toContain('Overlay');
    expect(row('Page fade')).toContain('32 %');
    expect(row('Text-to-speech')).toContain('Off');
  });

  it('names the Firefox minimum version the manifest requires', () => {
    const manifest = JSON.parse(readFileSync(new URL('../packages/browser-extension/manifest.firefox.json', import.meta.url), 'utf8'));
    const min = String(manifest.browser_specific_settings.gecko.strict_min_version).replace(/\.0$/, '');
    expect(section('### Firefox')).toContain(`Firefox ${min} or later`);
  });

  it('names both layout thresholds and the wheel exceptions', () => {
    const usage = section('## Usage');
    expect(usage).toContain('1180 px');
    expect(usage).toContain('900 px');
    expect(usage).toContain('outline card');
    expect(usage.toLowerCase()).toContain('zoom');
  });
});
