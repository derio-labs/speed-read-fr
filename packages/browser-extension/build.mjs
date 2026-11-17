// Build the Chrome and Firefox extensions from one source tree (spec section 7, R18).
//   node build.mjs              -> dist/chrome, dist/firefox
//   node build.mjs --package    -> also <repo>/dist/speed-read-chrome.zip and speed-read-firefox.zip
// The JS is bundled once and copied into both targets, so the two builds' scripts are identical;
// only the manifest differs. Icons are generated PNGs; nothing is fetched.
import { build } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

const pkg = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(pkg, '../..');
const dist = path.join(pkg, 'dist');
const TARGETS = ['chrome', 'firefox'];
const ENTRIES = { background: 'src/background.ts', content: 'src/content.ts', reader: 'src/reader-entry.ts' };
const ICON_SIZES = [16, 32, 48, 128];

/** A square icon: a rounded dark tile with three bars (the chunk) and an orange pivot mark. */
function iconPng(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.min(Math.max(x + 0.5, r), size - r);
      const cy = Math.min(Math.max(y + 0.5, r), size - r);
      const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
      if (!inside) continue;
      let c = [31, 41, 55];
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      if (v > 0.44 && v < 0.56 && u > 0.16 && u < 0.84) c = [243, 244, 246];
      if (u > 0.46 && u < 0.56 && v > 0.26 && v < 0.74) c = [249, 115, 22];
      px.set([...c, 255], i);
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A deflated zip of `files` ({ name, data }), with a fixed timestamp so builds are reproducible. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

async function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

export async function buildExtension({ packageZips = false } = {}) {
  await rm(dist, { recursive: true, force: true });
  const bundle = path.join(dist, '.bundle');
  await build({
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([name, file]) => [name, path.join(pkg, file)])),
    outdir: bundle,
    bundle: true,
    format: 'iife',
    target: ['chrome120', 'firefox128'],
    legalComments: 'none',
    logLevel: 'warning',
  });
  for (const target of TARGETS) {
    const out = path.join(dist, target);
    await mkdir(path.join(out, 'icons'), { recursive: true });
    for (const name of Object.keys(ENTRIES)) await copyFile(path.join(bundle, `${name}.js`), path.join(out, `${name}.js`));
    await copyFile(path.join(pkg, `manifest.${target}.json`), path.join(out, 'manifest.json'));
    await copyFile(path.join(pkg, 'LICENSE'), path.join(out, 'LICENSE'));
    for (const size of ICON_SIZES) await writeFile(path.join(out, 'icons', `icon-${size}.png`), iconPng(size));
  }
  await rm(bundle, { recursive: true, force: true });
  if (packageZips) {
    await mkdir(path.join(repo, 'dist'), { recursive: true });
    for (const target of TARGETS) {
      const dir = path.join(dist, target);
      const files = await Promise.all((await listFiles(dir)).map(async (name) => ({ name, data: await readFile(path.join(dir, name)) })));
      await writeFile(path.join(repo, 'dist', `speed-read-${target}.zip`), zip(files));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildExtension({ packageZips: process.argv.includes('--package') });
}
