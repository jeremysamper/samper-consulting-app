import { normalizeUnit, parseQuantity, toAppUnit } from '../import/UnitParser.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Coller une liste » de l'éditeur de fiches : une ligne par ingrédient,
// quantité devant ou derrière le nom, unité facultative.
//   « 200 g farine », « 200g de farine », « farine 200 g », « Farine : 0,5 kg »,
//   « 3 œufs » (3 pcs), « sel » (quantité 0), « - 1/2 c.s. sel » (puce retirée)
// Unités et quantités : le dictionnaire de l'import (UnitParser), ramené aux
// unités de l'éditeur (cl -> ml, dl -> ml, mg -> g…).
// ─────────────────────────────────────────────────────────────────────────────

const NOMBRE = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[¼½¾⅓⅔]`;
const DEVANT = new RegExp(String.raw`^(${NOMBRE})\s*(.*)$`);
const DERRIERE = new RegExp(String.raw`^(.*?)[\s:,;=-]+(${NOMBRE})\s*([^\d\s][^\s]*(?:\s[^\d\s][^\s]*)?)?$`);

const nettoyer = (ligne) => String(ligne || '')
  .replace(/^\s*(?:[-*•\u00B7]+|\d+[.)])\s+/, '')
  .replace(/\s+/g, ' ')
  .trim();

const sansDe = (s) => s.replace(/^(?:de\s+|d['’]\s*)/i, '').trim();

// Unité en tête de `reste` (un ou deux mots : « g », « c. s. », « cuillère à soupe »).
function uniteEnTete(reste) {
  const mots = reste.split(' ');
  for (let n = Math.min(3, mots.length); n >= 1; n--) {
    const u = normalizeUnit(mots.slice(0, n).join(' '));
    if (u && u !== 'qsp') return { unite: u, suite: mots.slice(n).join(' ') };
  }
  return null;
}

function ligneVers(nom, quantite, unite) {
  const app = toAppUnit(unite, quantite);
  const propre = sansDe(nom).replace(/[\s:,;=-]+$/, '').trim();
  if (!propre) return null;
  return { nom: propre.charAt(0).toUpperCase() + propre.slice(1), quantite: app.quantity, unite: app.unit };
}

export function lireLigne(brute) {
  const ligne = nettoyer(brute);
  if (!ligne) return null;

  const d = ligne.match(DEVANT);
  if (d) {
    const q = parseQuantity(d[1]);
    const reste = (d[2] || '').trim();
    if (q != null && reste) {
      const u = uniteEnTete(reste);
      if (u && u.suite) return ligneVers(u.suite, q, u.unite);
      // Pas d'unité : un compte (« 3 œufs »).
      if (!u) return ligneVers(reste, q, 'unité');
    }
  }

  const f = ligne.match(DERRIERE);
  if (f && f[1]) {
    const q = parseQuantity(f[2]);
    const uniteBrute = (f[3] || '').trim();
    const u = uniteBrute ? normalizeUnit(uniteBrute) : 'unité';
    if (q != null && u && u !== 'qsp') return ligneVers(f[1], q, u);
  }

  return ligneVers(ligne, 0, 'g');
}

export function lireListe(texte) {
  return String(texte || '').split(/\r?\n/).map(lireLigne).filter(Boolean);
}
