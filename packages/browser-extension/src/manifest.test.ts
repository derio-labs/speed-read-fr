import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(readFileSync(path.join(pkg, file), 'utf8'));
const chrome = read('manifest.chrome.json');
const firefox = read('manifest.firefox.json');

describe.each([
  ['chrome', chrome],
  ['firefox', firefox],
])('%s manifest', (_name, m) => {
  it('is Manifest V3 with the toolbar action and the speed-read command', () => {
    expect(m.manifest_version).toBe(3);
    expect(m.action).toBeTypeOf('object');
    expect(Object.keys(m.commands)).toEqual(['speed-read']);
    expect(m.commands['speed-read'].suggested_key.default).toBe('Alt+Shift+R');
  });

  it('asks for exactly storage, contextMenus, scripting, activeTab and all urls', () => {
    expect([...m.permissions].sort()).toEqual(['activeTab', 'contextMenus', 'scripting', 'storage']);
    expect(m.host_permissions).toEqual(['<all_urls>']);
    expect(m.optional_permissions).toBeUndefined();
  });

  it('has one always-on content script at document_idle', () => {
    expect(m.content_scripts).toEqual([{ matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_idle' }]);
  });

  it('loosens no content security policy and names no remote URL', () => {
    expect(m.content_security_policy).toBeUndefined();
    const text = JSON.stringify(m);
    expect(text).not.toMatch(/https?:\/\//);
    expect(m.web_accessible_resources).toBeUndefined();
  });
});

describe('per-browser background', () => {
  it('Chrome uses a service worker', () => {
    expect(chrome.background).toEqual({ service_worker: 'background.js' });
    expect(chrome.browser_specific_settings).toBeUndefined();
  });

  it('Firefox uses background scripts and a gecko id with strict_min_version 128.0', () => {
    expect(firefox.background).toEqual({ scripts: ['background.js'] });
    expect(firefox.browser_specific_settings.gecko.id).toMatch(/\S+@\S+/);
    expect(firefox.browser_specific_settings.gecko.strict_min_version).toBe('128.0');
  });
});

describe('build output', () => {
  const dist = path.join(pkg, 'dist');
  beforeAll(() => {
    execFileSync(process.execPath, [path.join(pkg, 'build.mjs')], { cwd: pkg, stdio: 'pipe' });
    execFileSync(process.execPath, [path.join(pkg, 'build.mjs'), '--test'], { cwd: pkg, stdio: 'pipe' });
  }, 60_000);

  it('the production build has no test hook and a closed shadow root', () => {
    const background = readFileSync(path.join(dist, 'chrome', 'background.js'), 'utf8');
    const reader = readFileSync(path.join(dist, 'chrome', 'reader.js'), 'utf8');
    expect(background).not.toContain('__speedReadTest');
    expect(reader).toMatch(/mode: "closed"/);
    expect(reader).not.toMatch(/mode: "open"/);
  });

  it('the test build, in its own directory, has the hook and an open shadow root', () => {
    const testDist = path.join(pkg, 'dist-test', 'chrome');
    expect(readFileSync(path.join(testDist, 'background.js'), 'utf8')).toContain('__speedReadTest');
    expect(readFileSync(path.join(testDist, 'reader.js'), 'utf8')).toMatch(/mode: "open"/);
    expect(existsSync(path.join(pkg, 'dist-test', 'firefox'))).toBe(false);
  });

  it.each(['chrome', 'firefox'])('dist/%s holds the manifest, the three scripts and icons', (target) => {
    const dir = path.join(dist, target);
    for (const file of ['manifest.json', 'background.js', 'content.js', 'reader.js']) expect(existsSync(path.join(dir, file)), file).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest).toEqual(target === 'chrome' ? chrome : firefox);
    for (const icon of Object.values<string>(manifest.icons)) {
      const bytes = readFileSync(path.join(dir, icon));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    }
  });

  it('the two builds have byte-identical scripts', () => {
    const js = (target: string) => readdirSync(path.join(dist, target)).filter((f) => f.endsWith('.js')).sort();
    expect(js('chrome')).toEqual(js('firefox'));
    for (const file of js('chrome')) {
      expect(readFileSync(path.join(dist, 'chrome', file)).equals(readFileSync(path.join(dist, 'firefox', file))), file).toBe(true);
    }
  });
});
