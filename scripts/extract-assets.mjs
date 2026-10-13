// Pulls the original Ancient Empires 1 resources out of the J2ME jar into
// public/assets/ae1/. The art and maps stay Macrospace's, so they are
// extracted on demand instead of committed.
//
// Usage: bun scripts/extract-assets.mjs [--if-missing] [--jar path/to/AE1-en.jar]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'assets', 'ae1');
const localJar = join(root, 'src-original', 'Java', 'AE1-en.jar');
const remoteJar =
  'https://raw.githubusercontent.com/ancient-empires/games-download/main/Java/AE1-en.jar';

const args = process.argv.slice(2);
const jarFlag = args.indexOf('--jar');
const jarPath = jarFlag >= 0 ? args[jarFlag + 1] : localJar;

if (args.includes('--if-missing') && existsSync(join(outDir, 'manifest.json'))) {
  process.exit(0);
}

/** 1.pak layout: u16 headerSize, u16 count, count × {u16 len, utf8 name, u32 offset, u16 size}. */
export function unpackPak(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint16(0);
  const count = view.getUint16(2);
  const files = {};
  let cursor = 4;
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(cursor);
    cursor += 2;
    const name = new TextDecoder().decode(bytes.subarray(cursor, cursor + nameLength));
    cursor += nameLength;
    const offset = view.getUint32(cursor);
    const size = view.getUint16(cursor + 4);
    cursor += 6;
    files[name] = bytes.subarray(headerSize + offset, headerSize + offset + size);
  }
  return files;
}

async function readJar() {
  if (existsSync(jarPath)) return new Uint8Array(readFileSync(jarPath));
  console.log(`jar not found at ${jarPath}, downloading ${remoteJar}`);
  const response = await fetch(remoteJar);
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

const jar = unzipSync(await readJar());
const pak = jar['1.pak'];
if (!pak) throw new Error('1.pak missing from jar: is this the AE1 jar?');

const files = { ...unpackPak(pak), 'lang.dat': jar['lang.dat'] };
mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(outDir, name), data);
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(Object.keys(files).sort(), null, 1));
console.log(`extracted ${Object.keys(files).length} files to ${outDir}`);
