// Build the VS Code extension (spec sections 8 and 12).
//   node build.mjs              -> dist/extension.js (extension host, CJS, `vscode` external),
//                                  dist/webview.js (webview, IIFE), media/katex/ (KaTeX CSS and fonts)
//   node build.mjs --package    -> also <repo>/dist/speed-read-vscode.vsix (vsce --no-dependencies)
// Everything, the core, markdown-it, KaTeX and Mermaid included, is bundled by esbuild, so the
// .vsix carries no node_modules and the webview loads nothing from outside the extension.
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pkg = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(pkg, '../..');
const require = createRequire(import.meta.url);
export const VSIX = path.join(repo, 'dist', 'speed-read-vscode.vsix');

export async function buildVscodeExtension({ packageVsix = false } = {}) {
  const dist = path.join(pkg, 'dist');
  const media = path.join(pkg, 'media');
  await rm(dist, { recursive: true, force: true });
  await rm(media, { recursive: true, force: true });
  const common = { bundle: true, legalComments: 'none', logLevel: 'warning', minify: true };
  await Promise.all([
    build({
      ...common,
      entryPoints: [path.join(pkg, 'src/extension.ts')],
      outfile: path.join(dist, 'extension.js'),
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['vscode'],
    }),
    build({
      ...common,
      entryPoints: [path.join(pkg, 'src/webview/main.ts')],
      outfile: path.join(dist, 'webview.js'),
      platform: 'browser',
      format: 'iife',
      target: 'chrome120',
    }),
  ]);
  const katexDist = path.join(path.dirname(require.resolve('katex/package.json')), 'dist');
  await mkdir(path.join(media, 'katex'), { recursive: true });
  await cp(path.join(katexDist, 'katex.min.css'), path.join(media, 'katex', 'katex.min.css'));
  await cp(path.join(katexDist, 'fonts'), path.join(media, 'katex', 'fonts'), { recursive: true });
  if (packageVsix) {
    await mkdir(path.dirname(VSIX), { recursive: true });
    const vsce = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
    await promisify(execFile)(process.execPath, [vsce, 'package', '--no-dependencies', '-o', VSIX], { cwd: pkg });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  await buildVscodeExtension({ packageVsix: process.argv.includes('--package') });
  console.log(`vscode extension built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
