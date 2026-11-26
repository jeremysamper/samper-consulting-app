// Génère la base de la démo publique avec une horloge figée (argv[4], ISO UTC).
import { createServer } from 'file:///C:/Users/jerem/Documents/App-Web/Samper-Consulting-Vite/node_modules/vite/dist/node/index.js';
import { writeFileSync } from 'node:fs';

const root = process.argv[2], out = process.argv[3], fige = process.argv[4];
if (fige) {
  const T = Date.parse(fige);
  const VraieDate = Date;
  class DateFigee extends VraieDate {
    constructor(...a) { if (a.length === 0) super(T); else super(...a); }
    static now() { return T; }
  }
  globalThis.Date = DateFigee;
}
const server = await createServer({ root, configFile: root + '/vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/demo/donnees/index.js');
  const base = m.creerBase();
  writeFileSync(out, JSON.stringify(base));
  console.log('tables', Object.keys(base).length, 'aujourdhui', new Date().toISOString());
} finally { await server.close(); }
