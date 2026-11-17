// The three packages of R25 (run after `npm run package`; skipped with a message when dist/ is absent),
// the bundled VS Code extension loaded against the stub `vscode` (run after `npm run build`), and the
// CI workflow that builds and uploads them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { crc32, inflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import * as vscodeStub from '../packages/vscode-extension/src/test/vscode-stub';

const root = new URL('../', import.meta.url);
const PACKAGES = {
  'dist/speed-read-chrome.zip': 'manifest.json',
  'dist/speed-read-firefox.zip': 'manifest.json',
  'dist/speed-read-vscode.vsix': 'extension/package.json',
} as const;

export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  size: number;
  /** The entry's bytes, inflated. */
  data: Buffer;
}

/** Every entry of a zip archive, read from its central directory and inflated through its local header. */
export function readZip(buf: Buffer): ZipEntry[] {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const packed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + packed);
    if (method !== 0 && method !== 8) throw new Error(`unsupported method ${method} for ${name}`);
    entries.push({ name, method, crc, size, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

/** Every file under `dir`, as paths relative to it with `/` separators. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = `${dir}/${name}`;
    return statSync(full).isDirectory() ? filesUnder(full, rel) : [rel];
  });
}

/** File names in a zip archive, from its central directory. */
export function zipEntries(buf: Buffer): string[] {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    names.push(buf.toString('utf8', at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
  }
  return names;
}

const built = existsSync(new URL('dist/', root)) && Object.keys(PACKAGES).some((p) => existsSync(new URL(p, root)));
if (!built) console.warn('tests/package.test.ts: dist/ has no packages; run `npm run package` first. Package checks skipped.');

describe.skipIf(!built)('packages in dist/ (R25)', () => {
  for (const [file, manifest] of Object.entries(PACKAGES)) {
    it(`${file} exists and lists ${manifest}`, () => {
      const path = new URL(file, root);
      expect(existsSync(path), file).toBe(true);
      expect(zipEntries(readFileSync(path))).toContain(manifest);
    });
  }

  it('the VS Code package carries no node_modules', () => {
    expect(zipEntries(readFileSync(new URL('dist/speed-read-vscode.vsix', root))).some((n) => n.includes('node_modules/'))).toBe(false);
  });

  // The browser zips come from a hand-written zip writer (packages/browser-extension/build.mjs).
  for (const target of ['chrome', 'firefox']) {
    it(`dist/speed-read-${target}.zip holds exactly packages/browser-extension/dist/${target}/, every entry inflating to the same bytes with a valid CRC-32 (l-tests-r3)`, () => {
      const entries = readZip(readFileSync(new URL(`dist/speed-read-${target}.zip`, root)));
      const dir = fileURLToPath(new URL(`packages/browser-extension/dist/${target}`, root));
      expect(entries.map((e) => e.name).sort()).toEqual(filesUnder(dir).sort());
      expect(entries.length).toBeGreaterThan(5);
      for (const entry of entries) {
        expect(entry.data.length, `${entry.name} size`).toBe(entry.size);
        expect(crc32(entry.data) >>> 0, `${entry.name} CRC-32`).toBe(entry.crc >>> 0);
        expect(entry.data.equals(readFileSync(`${dir}/${entry.name}`)), `${entry.name} bytes`).toBe(true);
      }
    });
  }

  it('the .vsix holds the manifest, both bundles, the KaTeX stylesheet and fonts and the licence, and no node_modules or source maps (l-tests-r3)', () => {
    const entries = readZip(readFileSync(new URL('dist/speed-read-vscode.vsix', root)));
    const names = entries.map((e) => e.name);
    for (const name of ['extension/package.json', 'extension/dist/extension.js', 'extension/dist/webview.js', 'extension/media/katex/katex.min.css', 'extension/LICENSE.txt']) {
      expect(names, name).toContain(name);
    }
    expect(names.some((n) => /^extension\/media\/katex\/fonts\/KaTeX_[\w-]+\.woff2$/.test(n))).toBe(true);
    expect(names.filter((n) => n.includes('node_modules/'))).toEqual([]);
    expect(names.filter((n) => n.endsWith('.map'))).toEqual([]);
    expect(names.filter((n) => n.startsWith('extension/src/'))).toEqual([]);
    for (const entry of entries) expect(crc32(entry.data) >>> 0, `${entry.name} CRC-32`).toBe(entry.crc >>> 0);
  });
});

const bundle = fileURLToPath(new URL('packages/vscode-extension/dist/extension.js', root));
const bundled = existsSync(bundle);
if (!bundled) console.warn('tests/package.test.ts: packages/vscode-extension/dist/extension.js is absent; run `npm run build` first. Bundle check skipped.');

describe.skipIf(!bundled)('the bundled VS Code extension (l-tests-r4)', () => {
  beforeEach(() => vscodeStub.__stub.reset());

  /** Evaluate the CommonJS bundle with `vscode` resolved to the stub, as the extension host would load it. */
  function load(): { activate(context: unknown): void } {
    const realRequire = createRequire(bundle);
    const module = { exports: {} as Record<string, unknown> };
    const wrapper = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {${readFileSync(bundle, 'utf8')}\n})`, { filename: bundle });
    const require = (id: string) => (id === 'vscode' ? vscodeStub : realRequire(id));
    wrapper(module.exports, require, module, bundle, fileURLToPath(new URL('.', `file://${bundle}`)));
    return module.exports as unknown as { activate(context: unknown): void };
  }

  it('activates and registers the five commands, the CodeLens and the hover provider for Markdown', () => {
    const ext = load();
    expect(typeof ext.activate).toBe('function');
    const subscriptions: { dispose(): void }[] = [];
    ext.activate({ subscriptions, extensionUri: vscodeStub.Uri.file('/ext') });
    const { state } = vscodeStub.__stub;
    expect([...state.commands.keys()].sort()).toEqual(['speedRead.readFile', 'speedRead.readFromCursor', 'speedRead.readFromLine', 'speedRead.readSection', 'speedRead.readSelection']);
    expect(state.codeLensProviders).toHaveLength(1);
    expect(state.hoverProviders).toHaveLength(1);
    expect(state.codeLensProviders[0].selector).toEqual({ language: 'markdown' });
    expect(state.hoverProviders[0].selector).toEqual({ language: 'markdown' });
    expect(subscriptions.length).toBeGreaterThanOrEqual(8);
    const commands = JSON.parse(readFileSync(new URL('packages/vscode-extension/package.json', root), 'utf8')).contributes.commands.map((c: { command: string }) => c.command);
    expect([...state.commands.keys()].sort()).toEqual([...commands].sort());
  });
});

describe('CI workflow (R25)', () => {
  const ci = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

  it('reads the repository only and cancels a superseded run (p5b-r14)', () => {
    expect(ci).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
    expect(ci).toMatch(/^concurrency:\s*\n\s+group:\s*ci-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress:\s*true\s*$/m);
  });

  it('runs on pull requests and on pushes to main', () => {
    expect(ci).toMatch(/^on:\s*\n(?:\s+.*\n)*?\s+pull_request:/m);
    expect(ci).toMatch(/push:\s*\n\s+branches:\s*\[\s*main\s*\]/);
  });

  it('runs the package and bundle checks after the build and package steps (l-tests-r4)', () => {
    const build = ci.indexOf('run: npm run build');
    expect(build).toBeGreaterThan(0);
    expect(ci.indexOf('tests/package.test.ts')).toBeGreaterThan(build);
  });

  it('packages before it checks the packages, then uploads all three or fails', () => {
    const packageStep = ci.indexOf('run: npm run package');
    const check = ci.indexOf('tests/package.test.ts');
    expect(packageStep).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(packageStep);
    const upload = ci.slice(ci.indexOf('actions/upload-artifact'));
    expect(upload.length).toBeGreaterThan(0);
    for (const file of Object.keys(PACKAGES)) expect(upload).toContain(file);
    expect(upload).toMatch(/if-no-files-found:\s*error/);
  });
});
