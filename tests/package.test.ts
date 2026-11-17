// The three packages of R25 (run after `npm run package`; skipped with a message when dist/ is absent),
// and the CI workflow that builds and uploads them.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const PACKAGES = {
  'dist/speed-read-chrome.zip': 'manifest.json',
  'dist/speed-read-firefox.zip': 'manifest.json',
  'dist/speed-read-vscode.vsix': 'extension/package.json',
} as const;

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
