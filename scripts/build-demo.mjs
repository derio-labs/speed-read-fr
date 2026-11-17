// Bundle the core demo page (tests/demo/demo.ts -> tests/demo/dist/demo.js) with esbuild.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildDemo() {
  await build({
    entryPoints: [path.join(root, 'tests/demo/demo.ts')],
    outfile: path.join(root, 'tests/demo/dist/demo.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    logLevel: 'warning',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDemo();
}
