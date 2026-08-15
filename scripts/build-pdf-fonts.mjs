// ─────────────────────────────────────────────────────────────────────────────
// Build the static TTF instances that jsPDF embeds in every branded document.
//
// jsPDF parses sfnt (TTF) only: it cannot read woff2, and a VARIABLE font is
// rejected by its TTF parser. The brand families ship as latin-subset woff in
// the @fontsource packages, and a woff file IS an sfnt whose tables are
// individually zlib-compressed, so unwrapping it back to a plain TTF is exact
// and lossless. No conversion tool, no network fetch at build time.
//
// The latin subset is deliberate: it carries the whole French set (accents,
// oe ligature, euro sign) which is all `pdfSafeText` ever lets through, and it
// keeps each embedded face around 25 to 70 KB instead of 150 KB.
//
//   npm run fonts:pdf
//
// Output: public/fonts/*.ttf, committed to the repo so a checkout can build
// without the @fontsource dev dependencies being present.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'public', 'fonts');

const FACES = [
  { src: '@fontsource/lora/files/lora-latin-400-normal.woff', out: 'Lora-Regular.ttf' },
  { src: '@fontsource/lora/files/lora-latin-400-italic.woff', out: 'Lora-Italic.ttf' },
  { src: '@fontsource/poppins/files/poppins-latin-300-normal.woff', out: 'Poppins-Light.ttf' },
  { src: '@fontsource/poppins/files/poppins-latin-500-normal.woff', out: 'Poppins-Medium.ttf' },
];

// woff -> sfnt. Header is 44 bytes, then one 20-byte directory entry per table;
// a table is stored raw when compLength equals origLength, zlib-deflated
// otherwise. The rebuilt sfnt needs its own 12-byte header, a directory sorted
// by tag, and every table aligned on 4 bytes.
function woffToTtf(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('not a woff file');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  const tables = [];
  for (let i = 0; i < numTables; i += 1) {
    const p = 44 + i * 20;
    const compLength = woff.readUInt32BE(p + 8);
    const origLength = woff.readUInt32BE(p + 12);
    const offset = woff.readUInt32BE(p + 4);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? zlib.inflateSync(raw) : raw.subarray(0, origLength);
    if (data.length !== origLength) throw new Error('table length mismatch');
    tables.push({ tag: woff.readUInt32BE(p), checksum: woff.readUInt32BE(p + 16), data });
  }
  tables.sort((a, b) => a.tag - b.tag);

  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);

  const directory = Buffer.alloc(numTables * 16);
  const body = [];
  let offset = 12 + directory.length;
  tables.forEach((t, i) => {
    directory.writeUInt32BE(t.tag, i * 16);
    directory.writeUInt32BE(t.checksum, i * 16 + 4);
    directory.writeUInt32BE(offset, i * 16 + 8);
    directory.writeUInt32BE(t.data.length, i * 16 + 12);
    const padding = (4 - (t.data.length % 4)) % 4;
    body.push(t.data, Buffer.alloc(padding));
    offset += t.data.length + padding;
  });

  return Buffer.concat([header, directory, ...body]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const face of FACES) {
  const src = path.join(rootDir, 'node_modules', ...face.src.split('/'));
  if (!fs.existsSync(src)) {
    throw new Error(`missing source ${face.src}. Run: npm install --no-save @fontsource/lora @fontsource/poppins`);
  }
  const ttf = woffToTtf(fs.readFileSync(src));
  fs.writeFileSync(path.join(outDir, face.out), ttf);
  console.log(`${face.out.padEnd(22)} ${(ttf.length / 1024).toFixed(1)} KB`);
}
