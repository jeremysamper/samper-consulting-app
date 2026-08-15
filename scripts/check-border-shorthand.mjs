// ─────────────────────────────────────────────────────────────────────────────
// Détection du mélange « raccourci de bordure + propriété longue de couleur »
// dans les styles inline.
//
// React n'avertit que si la propriété longue APPARAÎT ou DISPARAÎT d'un rendu à
// l'autre alors qu'un raccourci reste posé sur le même nœud :
//
//   base   : { border: '1px solid var(--border)' }        ← raccourci
//   actif  : { borderColor: 'var(--accent)' }             ← propriété longue
//   usage  : {{ ...base, ...(actif ? styleActif : {}) }}  ← elle disparaît
//
//   « Removing a style property during rerender (borderColor) when a
//     conflicting property is set (border) can lead to styling bugs. »
//
// Le correctif est toujours le même : dans la BASE, remplacer le raccourci par
// borderWidth / borderStyle / borderColor. Rendu identique, plus d'avertissement.
//
// Une couleur présente dans TOUTES les branches ne déclenche rien : l'ordre des
// clés suffit. Le script raisonne donc côté par côté (haut/droite/bas/gauche) et
// branche par branche, comme React qui développe tout en propriétés longues
// avant de comparer.
//
// Usage :
//   npm run lint:borders
//   node scripts/check-border-shorthand.mjs [racine]   # défaut : ./src
//   SCAN_DEBUG=<fragment de chemin>                    # détaille l'index d'un fichier
//
// Sortie non nulle si au moins un site est signalé (utilisable en garde-fou).
//
// Angles morts assumés, listés en fin de rapport :
//   - `style={variable}` : sans objet littéral sur place, rien à analyser.
//   - `...style` venant d'une prop de composant (Card, Btn, Input). La base de
//     Card pose `border` en raccourci : un appelant qui lui passerait un
//     borderColor conditionnel reproduirait le motif sans être vu ici. Aucun
//     appelant ne le fait aujourd'hui (vérifié à la main).
//   - paramètres de fonction (renderAlertPanel(panelStyle, headerStyle, …)).
//
// Le compte de couverture en fin de rapport sert à cela : un résultat vide n'a
// de valeur que si l'indexation a réellement résolu ses références.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'src';

// ─── côtés couverts par chaque propriété ─────────────────────────────────────
const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
const SHORTHANDS = {
  border: SIDES,
  borderTop: ['Top'], borderRight: ['Right'], borderBottom: ['Bottom'], borderLeft: ['Left'],
};
const LONGHANDS = {
  borderColor: SIDES,
  borderTopColor: ['Top'], borderRightColor: ['Right'],
  borderBottomColor: ['Bottom'], borderLeftColor: ['Left'],
};

// ─── assainissement : neutralise les commentaires ────────────────────────────
//
// Volontairement, les chaînes ne sont PAS vidées. Suivre les quotes demanderait
// un vrai parseur : dans du JSX français, l'apostrophe de « L'établissement »
// est du texte, pas une ouverture de chaîne, et la traiter comme telle
// désynchronise tout le fichier. L'analyse ci-dessous ne lit que des références
// explicites (`...ns.prop`) et des clés en début d'élément, jamais des
// identifiants glanés au fil du texte : le contenu des chaînes est sans effet.
// Seules les accolades des commentaires pourraient fausser l'équilibrage.
//
// Les longueurs et les retours à la ligne sont conservés : les index et les
// numéros de ligne restent ceux de la source.
function sanitize(src) {
  const out = src.split('');
  let i = 0;
  let state = null;
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === null) {
      // `://` d'une URL n'ouvre pas un commentaire
      if (c === '/' && c2 === '/' && src[i - 1] !== ':') { state = '//'; out[i] = out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = '/*'; out[i] = out[i + 1] = ' '; i += 2; continue; }
      i++; continue;
    }
    if (state === '//') {
      if (c === '\n') { state = null; i++; continue; }
      out[i] = ' '; i++; continue;
    }
    // bloc /* */
    if (c === '*' && c2 === '/') { out[i] = out[i + 1] = ' '; state = null; i += 2; continue; }
    out[i] = c === '\n' ? '\n' : ' ';
    i++;
  }
  return out.join('');
}

function matchBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Découpe un objet littéral en ses éléments de premier niveau. */
function splitTopLevel(s, open) {
  const close = matchBrace(s, open);
  if (close < 0) return null;
  const parts = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i <= close; i++) {
    const c = s[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (depth === 0) { parts.push(s.slice(start, i)); break; }
    } else if (c === ',' && depth === 1) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  return { close, parts: parts.map((p) => p.trim()).filter(Boolean) };
}

/** Propriétés de bordure posées au premier niveau d'un objet littéral. */
function borderPropsOf(s, open) {
  const split = splitTopLevel(s, open);
  const props = new Set();
  if (!split) return props;
  for (const part of split.parts) {
    const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(part);
    if (m && (SHORTHANDS[m[1]] || LONGHANDS[m[1]])) props.add(m[1]);
  }
  return props;
}

// ─── inventaire des fichiers ─────────────────────────────────────────────────
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
})(ROOT);

// ─── index : objets de style et feuilles de style, par fichier ───────────────
// objects : nom -> Set(propriétés de bordure)        (const dropZone = {…})
// sheets  : nom -> Map(propriété -> Set(propriétés)) (const pls = { tab: {…} })
const index = new Map();

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return path.relative('.', cand);
  }
  return null;
}

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const s = sanitize(raw);
  const objects = new Map();
  const sheets = new Map();

  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    const open = s.indexOf('{', m.index + m[0].length - 1);
    const split = splitTopLevel(s, open);
    if (!split) continue;

    // Tout objet est indexé, même sans bordure : cela permet de distinguer
    // « trouvé, aucune bordure » de « référence non résolue ».
    objects.set(m[1], borderPropsOf(s, open));

    // ses propriétés objet forment-elles une feuille de style ?
    const sheet = new Map();
    let cursor = open + 1;
    for (const part of split.parts) {
      const at = s.indexOf(part, cursor);
      if (at < 0) continue;
      cursor = at + part.length;
      const km = /^([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(part);
      if (!km) continue;
      sheet.set(km[1], borderPropsOf(s, s.indexOf('{', at + km[0].length - 1)));
    }
    if (sheet.size) sheets.set(m[1], sheet);
  }

  // imports nommés et par défaut, lus sur la source brute (chemins en chaîne)
  const imports = new Map();
  const importRe = /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
  let im;
  while ((im = importRe.exec(raw))) {
    const target = resolveImport(file, im[3]);
    if (!target) continue;
    if (im[1]) imports.set(im[1], { file: target, name: 'default' });
    if (im[2]) {
      for (const piece of im[2].split(',')) {
        const nm = piece.trim().split(/\s+as\s+/);
        const exported = nm[0].trim();
        const local = (nm[1] || nm[0]).trim();
        if (exported) imports.set(local, { file: target, name: exported });
      }
    }
  }

  index.set(file, { objects, sheets, imports });

  if (process.env.SCAN_DEBUG && file.includes(process.env.SCAN_DEBUG)) {
    console.error(`[debug] ${file}`);
    console.error('  feuilles :', [...sheets.entries()].map(([k, v]) => `${k}(${v.size})`).join(' '));
    console.error('  objets   :', [...objects.keys()].join(' '));
    console.error('  imports  :', [...imports.entries()].map(([k, v]) => `${k}<-${v.name}@${v.file}`).join(' '));
  }
}

/** Résout `ns.prop` ou `ident` vers l'ensemble de ses propriétés de bordure. */
function resolveRef(file, text) {
  const parts = text.split('.');
  const info = index.get(file);
  if (!info) return null;

  if (parts.length >= 2) {
    const [ns, prop] = parts;
    const local = info.sheets.get(ns);
    if (local && local.has(prop)) return local.get(prop);
    const imp = info.imports.get(ns);
    if (imp) {
      const target = index.get(imp.file);
      const sheet = target && target.sheets.get(imp.name === 'default' ? ns : imp.name);
      if (sheet && sheet.has(prop)) return sheet.get(prop);
    }
    return null;
  }

  const name = parts[0];
  if (info.objects.has(name)) return info.objects.get(name);
  const imp = info.imports.get(name);
  if (imp) {
    const target = index.get(imp.file);
    const key = imp.name === 'default' ? name : imp.name;
    if (target && target.objects.has(key)) return target.objects.get(key);
  }
  return null;
}

function matchParen(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

function topLevelIndex(s, token) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '{' || c === '[') d++;
    else if (c === ')' || c === '}' || c === ']') d--;
    else if (d === 0 && s.startsWith(token, i)) {
      if (token === '?' && (s[i + 1] === '.' || s[i + 1] === '?')) continue; // ?. et ??
      return i;
    }
  }
  return -1;
}

function topLevelColon(s, from) {
  let d = 0;
  let pending = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '{' || c === '[') d++;
    else if (c === ')' || c === '}' || c === ']') d--;
    else if (d === 0 && c === '?' && s[i + 1] !== '.' && s[i + 1] !== '?') pending++;
    else if (d === 0 && c === ':') {
      if (pending === 0) return i;
      pending--;
    }
  }
  return -1;
}

/** Sépare un spread conditionnel en ses branches. Rend null s'il est inconditionnel. */
function branchesOf(expr) {
  let e = expr.trim();
  while (e.startsWith('(') && matchParen(e, 0) === e.length - 1) e = e.slice(1, -1).trim();

  const q = topLevelIndex(e, '?');
  if (q >= 0) {
    const colon = topLevelColon(e, q + 1);
    if (colon > 0) return [e.slice(q + 1, colon).trim(), e.slice(colon + 1).trim()];
  }
  // `cond && objet` : la branche alternative est vide
  const amp = topLevelIndex(e, '&&');
  if (amp >= 0) return [e.slice(amp + 2).trim(), '{}'];
  return null;
}

/** Références rencontrées dans les style={{…}}, pour mesurer la couverture. */
const auditedRefs = [];

/** Propriétés de bordure apportées par une branche (objet littéral ou référence). */
function propsOfBranch(file, text) {
  const t = text.trim();
  if (!t || t === 'null' || t === 'undefined' || t === '{}') return new Set();
  if (t.startsWith('{')) return borderPropsOf(t, 0);
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(t)) {
    const resolved = resolveRef(file, t);
    auditedRefs.push({ file, ref: t, ok: !!resolved });
    return resolved || new Set();
  }
  return new Set();
}

// ─── analyse des expressions style={{ … }} ───────────────────────────────────
const findings = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const s = sanitize(raw);
  const re = /style\s*=\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    let i = m.index + m[0].length; // juste après l'accolade JSX
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '{') continue; // style={variable} : rien à analyser ici
    const split = splitTopLevel(s, i);
    if (!split) continue;
    const line = s.slice(0, m.index).split(/\r?\n/).length;

    const shortAlways = {};   // côté -> raccourci toujours posé
    const longAlways = {};    // côté -> propriété longue toujours posée
    const longVariable = {};  // côté -> propriété longue parfois absente

    // À côté égal, on retient le raccourci le plus spécifique : borderBottom
    // parle mieux que border quand les deux sont posés.
    const note = (bag, side, prop) => {
      const cur = bag[side];
      if (!cur) { bag[side] = prop; return; }
      const span = (p) => (SHORTHANDS[p] || LONGHANDS[p] || []).length;
      if (span(prop) < span(cur)) bag[side] = prop;
    };

    for (const part of split.parts) {
      if (part.startsWith('...')) {
        const expr = part.slice(3);
        const branches = branchesOf(expr);
        if (!branches) {
          for (const p of propsOfBranch(file, expr)) {
            for (const side of SHORTHANDS[p] || []) note(shortAlways, side, p);
            for (const side of LONGHANDS[p] || []) note(longAlways, side, p);
          }
        } else {
          const sets = branches.map((b) => propsOfBranch(file, b));
          for (const side of SIDES) {
            for (const bag of sets) {
              for (const p of bag) {
                if ((SHORTHANDS[p] || []).includes(side)) note(shortAlways, side, p);
              }
            }
            const longIn = sets.map((bag) => [...bag].find((p) => (LONGHANDS[p] || []).includes(side)));
            if (longIn.every(Boolean)) note(longAlways, side, longIn[0]);
            else if (longIn.some(Boolean)) note(longVariable, side, longIn.find(Boolean));
          }
        }
        continue;
      }
      // clé: valeur -> la clé est posée à tous les rendus
      const km = /^([A-Za-z_$][\w$]*)\s*:/.exec(part);
      if (!km) continue;
      for (const side of SHORTHANDS[km[1]] || []) note(shortAlways, side, km[1]);
      for (const side of LONGHANDS[km[1]] || []) note(longAlways, side, km[1]);
    }

    for (const side of SIDES) {
      if (shortAlways[side] && longVariable[side] && !longAlways[side]) {
        findings.push({
          file,
          line,
          short: shortAlways[side],
          long: longVariable[side],
          expr: raw.slice(m.index, m.index + 150).replace(/\s+/g, ' '),
        });
      }
    }
  }
}

// une seule ligne par site, même si les quatre côtés sont touchés
const seen = new Set();
const uniques = findings.filter((f) => {
  const k = `${f.file}:${f.line}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

uniques.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
for (const f of uniques) {
  console.log(`${f.file}:${f.line}  ${f.short} (raccourci) vs ${f.long} (parfois absente)`);
  console.log(`    ${f.expr}\n`);
}

// Couverture : un résultat vide ne vaut que si l'indexation a réellement vu
// quelque chose. Le compte ci-dessous rend le zéro vérifiable.
let nSheets = 0;
let nStyles = 0;
for (const info of index.values()) {
  nSheets += info.sheets.size;
  for (const sheet of info.sheets.values()) nStyles += sheet.size;
  nStyles += info.objects.size;
}
const nRefsOk = auditedRefs.filter((r) => r.ok).length;
const nRefsKo = auditedRefs.length - nRefsOk;

console.log(`${uniques.length} site(s) à risque  [racine : ${ROOT}]`);
console.log(
  `couverture : ${files.length} fichiers, ${nSheets} feuilles, ${nStyles} objets de style, `
  + `${nRefsOk}/${auditedRefs.length} références résolues dans les style={{…}}`
);
if (nRefsKo) {
  const ko = [...new Set(auditedRefs.filter((r) => !r.ok).map((r) => `${r.ref}  (${r.file})`))];
  console.log('\nréférences non résolues, angles morts à vérifier à la main :');
  for (const r of ko) console.log(`  ${r}`);
}

process.exitCode = uniques.length ? 1 : 0;
