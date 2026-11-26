// Couverture de la démo publique (/demo, src/demo/).
//
// La démo monte la vraie application sur un Supabase simulé. Quand un lot
// ajoute une table, une fonction RPC ou une Edge Function et oublie la démo,
// rien ne casse à la compilation : la table est lue vide, la RPC répond
// « Cette action n'est pas disponible dans la démo. », la fonction répond
// « Ce service n'est pas disponible dans la démo. ». La démo prend du retard
// en silence. Ce contrôle, branché sur `npm run lint`, refuse ce retard.
//
// Il suit les imports depuis l'entrée de la démo (src/demo/main.jsx), donc
// tout ce que la démo peut afficher et rien d'autre (les pages publiques de
// réservation, de commande et de chambre ont leur propre entrée). Puis :
//   1. chaque table lue ou écrite est une clé de la base de démo
//      (creerBase, src/demo/donnees/index.js). Une table qui doit rester vide
//      dans la démo y entre avec une liste vide ;
//   2. chaque RPC appelée a son cas dans RPC (src/demo/rpc.js), ou figure dans
//      RPC_HORS_DEMO avec la raison de son absence ;
//   3. chaque Edge Function appelée a sa réponse dans repondreFonction
//      (src/demo/fauxSupabase.js), ou figure dans FONCTIONS_HORS_DEMO ;
//   4. un appel dont le nom n'est pas écrit en clair (`.from(table)`,
//      `.rpc(nom)`) est déclaré dans RELAIS avec le motif qui retrouve ses noms.
//
// Usage : npm run lint:demo
// Sortie non nulle dès qu'une table, une RPC, une fonction ou un appel n'est
// pas couvert.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerBase } from '../src/demo/donnees/index.js';
import { RPC_DEMO, RPC_HORS_DEMO } from '../src/demo/rpc.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dossierDemo = join(racine, 'src', 'demo');
const ENTREE = join(dossierDemo, 'main.jsx');

// Edge Functions qui ne répondent jamais dans la démo, avec la raison. Elles
// reçoivent la réponse générique « Ce service n'est pas disponible ».
const FONCTIONS_HORS_DEMO = {};

// Appels dont le nom passe par une variable. `fichier` porte l'appel
// dynamique ; `motif` retrouve les noms réellement passés (chaque nom entre
// apostrophes du premier groupe), dans ce fichier seulement, ou dans tous les
// fichiers suivis si `partout` (un hook exporté).
const RELAIS = [
  { fichier: 'src/hooks/useFacturationGroupes.js', type: 'table', motif: /\blireTable\(\s*('[a-z0-9_]+')/g },
  { fichier: 'src/modules/comptabilite/comptaService.js', type: 'table', partout: true, motif: /\buseTableCompta\(\s*('[a-z0-9_]+')/g },
  { fichier: 'src/modules/demarrage/demarrageService.js', type: 'table', motif: /\bidsDe\(\s*('[a-z0-9_]+')/g },
  { fichier: 'src/modules/demarrage/exempleService.js', type: 'table', motif: /\bORDRE_EFFACEMENT\s*=\s*\[([^\]]*)\]/g },
  { fichier: 'src/modules/hebergement/hotelData.js', type: 'table', partout: true, motif: /\buseTableHotel\(\s*('[a-z0-9_]+')/g },
  { fichier: 'src/modules/spa/spaData.js', type: 'table', partout: true, motif: /\buseSpaTable\(\s*('[a-z0-9_]+')/g },
  { fichier: 'src/services/personneService.js', type: 'rpc', motif: /\bappelerRpc\(\s*('[a-z0-9_]+')/g },
  { fichier: 'src/modules/planning/echanges.js', type: 'rpc', motif: /\bappeler\(\s*('[a-z0-9_]+')/g },
];

// `.from(x)` d'un type natif n'est pas une table.
const NATIFS = new Set(['Array', 'Buffer', 'Uint8Array', 'Uint16Array', 'Int16Array', 'Float32Array', 'Float64Array', 'Object', 'Set', 'Map', 'Promise']);

const relatif = (chemin) => relative(racine, chemin).replace(/\\/g, '/');
const ligneDe = (texte, index) => texte.slice(0, index).split('\n').length;

function resoudre(depuis, cible) {
  const brut = resolve(dirname(depuis), cible.split('?')[0]);
  for (const c of [brut, ...['.js', '.jsx', '.ts', '.tsx', '.mjs'].map((e) => brut + e), join(brut, 'index.js'), join(brut, 'index.jsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// Fichiers atteints depuis l'entrée de la démo, par imports relatifs
// (statiques, dynamiques et de bord).
function suivre(entree) {
  const vus = new Set();
  const pile = [entree];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const texte = readFileSync(f, 'utf8');
    for (const m of texte.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (!/\.(m?js|jsx|ts|tsx)$|\/[^./]+$|^\.{1,2}\/[^.]*$/.test(m[1].split('?')[0])) continue;
      const cible = resoudre(f, m[1]);
      if (cible && !vus.has(cible)) pile.push(cible);
    }
  }
  return [...vus];
}

const tables = new Map();
const rpcs = new Map();
const fonctions = new Map();
const dynamiques = [];
const noter = (carte, nom, ou) => { if (!carte.has(nom)) carte.set(nom, ou); };

const suivis = suivre(ENTREE);
const appli = suivis.filter((f) => !f.startsWith(dossierDemo) && !/\.test\./.test(f));

for (const chemin of appli) {
  const texte = readFileSync(chemin, 'utf8');
  const rel = relatif(chemin);
  const relaisIci = RELAIS.filter((r) => r.fichier === rel).map((r) => r.type);

  // Constantes de nom : const TABLE = 'absences'.
  const constantes = new Map();
  for (const m of texte.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([a-z][a-z0-9_]*)['"]/g)) constantes.set(m[1], m[2]);

  for (const m of texte.matchAll(/\.from\(\s*(?:['"`]([a-z][a-z0-9_]*)['"`]|([A-Za-z_$][\w$]*))\s*\)/g)) {
    const avant = texte.slice(Math.max(0, m.index - 80), m.index).replace(/\s+/g, '');
    if (/storage$/.test(avant)) continue;
    if (NATIFS.has((avant.match(/([A-Za-z_$][\w$]*)$/) || [])[1])) continue;
    const ou = `${rel}:${ligneDe(texte, m.index)}`;
    const nom = m[1] || constantes.get(m[2]);
    if (nom) noter(tables, nom, ou);
    else if (!relaisIci.includes('table')) dynamiques.push(`${ou} : .from(${m[2]})`);
  }
  for (const m of texte.matchAll(/\.rpc\(\s*(?:['"`]([a-z][a-z0-9_]*)['"`]|([A-Za-z_$][\w$]*))\s*[,)]/g)) {
    const ou = `${rel}:${ligneDe(texte, m.index)}`;
    const nom = m[1] || constantes.get(m[2]);
    if (nom) noter(rpcs, nom, ou);
    else if (!relaisIci.includes('rpc')) dynamiques.push(`${ou} : .rpc(${m[2]})`);
  }
  for (const m of texte.matchAll(/functions\.invoke\(\s*['"`]([a-z0-9-]+)['"`]|functions\/v1\/([a-z0-9-]+)/g)) {
    noter(fonctions, m[1] || m[2], `${rel}:${ligneDe(texte, m.index)}`);
  }
  for (const r of RELAIS) {
    if (!r.partout && r.fichier !== rel) continue;
    for (const m of texte.matchAll(r.motif)) {
      for (const n of m[1].matchAll(/'([a-z0-9_]+)'/g)) noter(r.type === 'rpc' ? rpcs : tables, n[1], `${rel}:${ligneDe(texte, m.index)}`);
    }
  }
}

const problemes = [];
for (const r of RELAIS) {
  if (!appli.some((f) => relatif(f) === r.fichier)) problemes.push(`relais ${r.fichier} : fichier absent ou plus atteint par la démo, retirer l'entrée de RELAIS.`);
}

const base = new Set([...Object.keys(creerBase()), ...Object.keys(creerBase({ maisons: 2 }))]);
const rpcDemo = new Set(RPC_DEMO);
const faux = readFileSync(join(dossierDemo, 'fauxSupabase.js'), 'utf8');
const fonctionsDemo = new Set([...faux.matchAll(/nom === '([a-z0-9-]+)'/g)].map((m) => m[1]));

for (const [nom, ou] of [...tables].sort()) {
  if (!base.has(nom)) problemes.push(`table ${nom} (${ou}) : absente de la base de démo. Ajouter ses lignes dans src/demo/donnees/, ou une liste vide dans creerBase.`);
}
for (const [nom, ou] of [...rpcs].sort()) {
  if (!rpcDemo.has(nom) && !RPC_HORS_DEMO[nom]) problemes.push(`rpc ${nom} (${ou}) : sans cas dans RPC (src/demo/rpc.js). L'écrire, ou la déclarer dans RPC_HORS_DEMO avec sa raison.`);
}
for (const nom of RPC_DEMO) {
  if (RPC_HORS_DEMO[nom]) problemes.push(`rpc ${nom} : à la fois dans RPC et dans RPC_HORS_DEMO.`);
}
for (const [nom, ou] of [...fonctions].sort()) {
  if (!fonctionsDemo.has(nom) && !FONCTIONS_HORS_DEMO[nom]) problemes.push(`fonction ${nom} (${ou}) : sans réponse dans repondreFonction (src/demo/fauxSupabase.js). L'écrire, ou la déclarer dans FONCTIONS_HORS_DEMO.`);
}
for (const d of dynamiques) problemes.push(`appel dynamique non déclaré ${d} : l'ajouter à RELAIS (scripts/check-demo-coverage.mjs).`);

// Garde de l'instrument : un graphe d'imports qui ne trouve presque rien est
// un contrôle cassé, pas une démo couverte.
if (appli.length < 100 || tables.size < 50) {
  console.error(`lint:demo : contrôle cassé, ${appli.length} fichiers suivis et ${tables.size} tables trouvées depuis ${relatif(ENTREE)}.`);
  process.exit(1);
}

console.log(`lint:demo : ${appli.length} fichiers suivis depuis ${relatif(ENTREE)} ; ${tables.size} tables, ${rpcs.size} RPC, ${fonctions.size} fonctions appelées ; base de démo : ${base.size} tables, ${rpcDemo.size} RPC simulées, ${Object.keys(RPC_HORS_DEMO).length} déclarées hors démo.`);
if (problemes.length) {
  console.error(`\n${problemes.length} trou(s) dans la démo :`);
  for (const p of problemes) console.error(`  ${p}`);
  process.exit(1);
}
console.log('lint:demo : la démo couvre tout ce que l\'application appelle.');
