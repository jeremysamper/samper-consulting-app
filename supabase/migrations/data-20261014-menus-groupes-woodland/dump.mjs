import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const nm = 'C:/Users/jerem/Documents/App-Web/Samper-Consulting-Vite/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const pdfjs = await import(pathToFileURL(nm).href);
const [file, pageArg] = process.argv.slice(2);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
const pages = pageArg ? [Number(pageArg)] : Array.from({ length: doc.numPages }, (_, i) => i + 1);
const out = [];
for (const p of pages) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const styles = tc.styles;
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    out.push({ p, x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10, h: Math.round(it.height * 10) / 10, w: Math.round(it.width * 100) / 100, f: styles[it.fontName]?.fontFamily + '|' + it.fontName, s: it.str });
  }
}
console.log(JSON.stringify(out));
