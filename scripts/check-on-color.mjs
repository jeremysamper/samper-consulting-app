// ─────────────────────────────────────────────────────────────────────────────
// Texte blanc posé sur un aplat qui s'éclaircit en mode sombre.
//
// En sombre, --accent vaut un aqua clair (#74aec3) : du blanc dessus tombe à
// 2,45:1, sous le seuil de 4,5:1. Les jetons de statut (--danger-strong,
// --danger-text, --success-strong, --success-text) font pire, jusqu'à 1,79:1.
// Chaque aplat a son jeton de texte, qui suit le thème :
//
//   fond var(--accent)        -> texte var(--on-accent)
//   fond var(--danger-fill)   -> texte var(--on-danger)
//   fond var(--success-fill)  -> texte var(--on-success)
//
// Ce contrôle refuse un objet de style (inline, *.styles.js, fabrique) ou une
// règle CSS qui pose à la fois un de ces fonds clairs en sombre et un texte
// blanc littéral (#fff, #ffffff, white, rgb(255, 255, 255)). Une valeur
// conditionnelle compte : `background: actif ? 'var(--accent)' : …` avec
// `color: actif ? '#fff' : …` pose bien du blanc sur l'accent.
//
// Usage :
//   npm run lint:on-color
//   node scripts/check-on-color.mjs [racine]   # défaut : ./src
//
// Sortie non nulle si au moins un site est signalé, ou si rien n'a été lu.
//
// Angles morts assumés : un fond et une couleur posés dans deux objets
// différents puis fusionnés par spread ne sont pas rapprochés ; un style
// construit par concaténation de chaînes non plus.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'src';

// Hors du périmètre de ce contrôle (décisions de Jérémy) : le Spa a son propre
// système visuel, le KDS a son chantier, la FAQ est en pause, la page publique
// de réservation est à part.
const EXCLUS = [
  'modules/spa/', 'modules/kds/', 'modules/faq/', 'reservation/',
];
// Fichiers en attente : modifiés sans commit dans le worktree
// fix/exports-sans-capitales (sharp-greider-871ed9). Leurs sites sont listés
// sans faire échouer le contrôle ; à corriger puis à retirer d'ici quand ce
// worktree sera repris ou abandonné.
const EN_ATTENTE = [
  'modules/planning/Planning.styles.js',
  'modules/factures/Factures.jsx',
];

const FONDS = /var\(--(accent|danger-strong|danger-text|success-strong|success-text)\)/;
const BLANC = /['"`]\s*(#fff|#ffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*['"`]/i;
const BLANC_CSS = /(^|[\s:])(#fff|#ffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))(\s|!|;|$)/i;

const norm = (p) => p.split(path.sep).join('/');
const relatif = (p) => norm(path.relative(ROOT, p));
const exclu = (p) => EXCLUS.some((e) => relatif(p).startsWith(e));
const enAttente = (p) => EN_ATTENTE.includes(relatif(p));

// Neutralise les commentaires JS en gardant longueurs et retours à la ligne.
// Un commentaire ne s'ouvre qu'après un blanc, une accolade, une parenthèse,
// une virgule ou un point-virgule : sinon « accept="image/*" » ou une URL
// ouvriraient un faux commentaire qui aveuglerait toute la suite du fichier.
const AVANT_COMMENTAIRE = /[\s{}();,]/;
function sansCommentairesJs(src) {
  const out = src.split('');
  let i = 0;
  let etat = null;
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (etat === null) {
      const ouvrable = i === 0 || AVANT_COMMENTAIRE.test(src[i - 1]);
      if (ouvrable && c === '/' && c2 === '/') { etat = '//'; out[i] = out[i + 1] = ' '; i += 2; continue; }
      if (ouvrable && c === '/' && c2 === '*') { etat = '/*'; out[i] = out[i + 1] = ' '; i += 2; continue; }
      i++; continue;
    }
    if (etat === '//') {
      if (c === '\n') { etat = null; i++; continue; }
      out[i] = ' '; i++; continue;
    }
    if (c === '*' && c2 === '/') { out[i] = out[i + 1] = ' '; etat = null; i += 2; continue; }
    out[i] = c === '\n' ? '\n' : ' ';
    i++;
  }
  return out.join('');
}

function accoladeFermante(s, ouvre) {
  let p = 0;
  for (let i = ouvre; i < s.length; i++) {
    if (s[i] === '{') p++;
    else if (s[i] === '}') { p--; if (p === 0) return i; }
  }
  return -1;
}

// Éléments de premier niveau d'un objet littéral (clé: valeur, spreads…).
function elements(s, ouvre) {
  const ferme = accoladeFermante(s, ouvre);
  if (ferme < 0) return [];
  const parts = [];
  let p = 0;
  let debut = ouvre + 1;
  for (let i = ouvre; i <= ferme; i++) {
    const c = s[i];
    if (c === '{' || c === '(' || c === '[') p++;
    else if (c === '}' || c === ')' || c === ']') {
      p--;
      if (p === 0) { parts.push(s.slice(debut, i)); break; }
    } else if (c === ',' && p === 1) {
      parts.push(s.slice(debut, i));
      debut = i + 1;
    }
  }
  return parts.map((x) => x.trim()).filter(Boolean);
}

const fichiers = [];
(function parcourir(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (/\.(js|jsx|css)$/.test(e.name)) fichiers.push(p);
  }
})(ROOT);

const sites = [];
let objets = 0;
let fichiersLus = 0;

for (const f of fichiers) {
  if (exclu(f)) continue;
  fichiersLus++;
  const brut = fs.readFileSync(f, 'utf8');
  if (f.endsWith('.css')) {
    // Règles CSS : un bloc de déclarations entre accolades, sans bloc imbriqué.
    const s = brut.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(s))) {
      objets++;
      const decls = m[1].split(';').map((d) => d.trim());
      const fond = decls.some((d) => /^background(-color)?\s*:/.test(d) && FONDS.test(d));
      const blanc = decls.some((d) => /^color\s*:/.test(d) && BLANC_CSS.test(d.replace(/^color\s*:/, ' ')));
      if (fond && blanc) sites.push({ f, ligne: s.slice(0, m.index).split('\n').length });
    }
    continue;
  }
  const s = sansCommentairesJs(brut);
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    const parts = elements(s, i);
    if (!parts.length) continue;
    let fond = false;
    let blanc = false;
    let cles = 0;
    for (const part of parts) {
      const km = /^['"]?([A-Za-z_$][\w$-]*)['"]?\s*:([\s\S]*)$/.exec(part);
      if (!km) continue;
      cles++;
      const [, cle, valeur] = km;
      if ((cle === 'background' || cle === 'backgroundColor') && FONDS.test(valeur)) fond = true;
      if (cle === 'color' && BLANC.test(valeur)) blanc = true;
    }
    if (cles) objets++;
    if (fond && blanc) sites.push({ f, ligne: s.slice(0, i).split('\n').length });
  }
}

const bloquants = sites.filter((x) => !enAttente(x.f));
const attente = sites.filter((x) => enAttente(x.f));
for (const x of bloquants) console.log(`${norm(x.f)}:${x.ligne}  texte blanc sur un aplat clair en sombre : var(--on-accent), var(--on-danger) ou var(--on-success)`);
if (attente.length) {
  console.log(`\nen attente (fichiers modifiés dans un autre worktree, non bloquants) : ${attente.length}`);
  for (const x of attente) console.log(`  ${norm(x.f)}:${x.ligne}`);
}
console.log(`${bloquants.length} site(s) à corriger  [racine : ${ROOT}]`);
console.log(`couverture : ${fichiersLus} fichier(s) lu(s), ${objets} objet(s) de style ou règle(s) examiné(s) ; exclus : ${EXCLUS.join(', ')}`);

if (!fichiersLus || !objets) {
  console.log('rien lu : contrôle sans objet, racine à vérifier');
  process.exitCode = 1;
} else {
  process.exitCode = bloquants.length ? 1 : 0;
}
