// ─────────────────────────────────────────────────────────────────────────────
// Couleurs illisibles pour la capture PDF dans les feuilles de style.
//
// L'export d'une vue (exportElementToPdf, elementToBlobPDF) passe par
// html2canvas 1.4, qui lit les styles calculés et s'arrête net sur une fonction
// de couleur qu'il ne connaît pas :
//
//   « Attempting to parse an unsupported color function "oklab" »
//
// color-mix() se calcule en oklab(...), oklch() reste oklch(...) : une seule
// déclaration de ce genre dans une règle qui touche la zone capturée suffit à
// faire échouer tout l'export (constaté le 16.10.2026 : deux filets en
// color-mix() de la règle « Plus de carrés » cassaient les exports du Planning,
// des Pertes, du HACCP, des Factures et des allergènes).
//
// Une DÉFINITION de variable (--x: oklch(...)) reste permise : la capture
// redéclare les jetons en hex sur .pdf-render-root (THEME_VAR_OVERRIDES de
// src/design/brandTokens.js), à condition que le jeton y figure. Une propriété
// ordinaire qui pose la fonction elle-même ne peut pas être rattrapée ainsi :
// c'est elle que ce contrôle refuse.
//
// Usage :
//   npm run lint:capture
//   node scripts/check-capture-colors.mjs [racine]   # défaut : ./src
//
// Sortie non nulle si au moins une déclaration est signalée, ou si aucune
// feuille n'a été lue (un zéro sans feuille lue ne prouve rien).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'src';
const FONCTIONS = /\b(color-mix|oklch|oklab|lab|lch)\(/g;

// Neutralise les commentaires en gardant longueurs et retours à la ligne, pour
// que les index et les numéros de ligne restent ceux de la source.
function sansCommentaires(src) {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const fin = src.indexOf('*/', i + 2);
      const stop = fin === -1 ? src.length : fin + 2;
      for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' ';
      i = stop;
      continue;
    }
    i++;
  }
  return out.join('');
}

const feuilles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.css')) feuilles.push(p);
  }
})(ROOT);

const signalements = [];
let vues = 0;

for (const fichier of feuilles) {
  const s = sansCommentaires(fs.readFileSync(fichier, 'utf8'));
  FONCTIONS.lastIndex = 0;
  let m;
  while ((m = FONCTIONS.exec(s))) {
    vues++;
    // Dans un sélecteur ou un prélude de règle @ (le prochain délimiteur est
    // une accolade ouvrante), ce n'est pas une valeur : rien à capturer.
    const suite = s.slice(m.index).search(/[{};]/);
    if (suite !== -1 && s[m.index + suite] === '{') continue;
    // Début de la déclaration : après le dernier ; { ou } qui précède.
    let debut = m.index;
    while (debut > 0 && !';{}'.includes(s[debut - 1])) debut--;
    const declaration = s.slice(debut, m.index);
    const propriete = declaration.split(':')[0].trim();
    if (propriete.startsWith('--')) continue;
    const ligne = s.slice(0, m.index).split('\n').length;
    signalements.push({ fichier, ligne, propriete, fonction: m[1] });
  }
}

for (const r of signalements) {
  console.log(`${r.fichier}:${r.ligne}  ${r.propriete} pose ${r.fonction}() : illisible pour html2canvas, passer par un jeton (--x) redéclaré en hex pour la capture`);
}
console.log(`${signalements.length} déclaration(s) à corriger  [racine : ${ROOT}]`);
console.log(`couverture : ${feuilles.length} feuille(s) lue(s), ${vues} fonction(s) de couleur vue(s), définitions de variables comprises`);

if (!feuilles.length) {
  console.log('aucune feuille lue : contrôle sans objet, racine à vérifier');
  process.exitCode = 1;
} else {
  process.exitCode = signalements.length ? 1 : 0;
}
