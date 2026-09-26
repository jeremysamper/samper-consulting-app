// Normalisation de recherche : minuscules + sans accents (poivre = poivré) +
// ligatures repliées (bœuf = boeuf). Une seule implémentation pour toute
// l'app, sinon « creme » trouve « Crème brûlée » dans un module et pas
// dans le suivant.
export const normalizeSearch = (s) => String(s || '')
  .toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// Petits mots ignorés dans une requête de plusieurs mots : « confit de
// sanglier » doit trouver « Sanglier confit ». Gardés si la requête ne
// contient qu'eux (chercher « de » reste possible).
const STOP_WORDS = new Set([
  'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'a', 'au', 'aux',
  'et', 'en', 'un', 'une', 'sur', 'avec', 'pour', 'par',
]);

// Pluriel simple : « sangliers » cherche « sanglier », « choux » cherche
// « chou ». Le mot réduit reste contenu dans sa forme plurielle, la
// recherche par sous-chaîne trouve donc les deux.
const singular = (w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

export function searchTokens(query) {
  const words = normalizeSearch(query).split(/[^a-z0-9]+/).filter(Boolean);
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  return (meaningful.length ? meaningful : words).map(singular);
}

// Recherche par mots, dans n'importe quel ordre et n'importe où dans le texte :
// chaque mot de la requête doit apparaître dans au moins un des textes fournis.
// Chercher la requête d'un bloc ratait « confit de sanglier » face à
// « Sanglier confit ».
//
//   const match = makeSearchMatcher(search);
//   plats.filter((p) => match(p.nom, p.description));
//
// Requête vide : tout correspond. match.active dit si une requête est posée.
export function makeSearchMatcher(query) {
  const tokens = searchTokens(query);
  const match = tokens.length
    ? (...texts) => {
      const hay = normalizeSearch(texts.flat().filter(Boolean).join(' '));
      return tokens.every((t) => hay.includes(t));
    }
    : () => true;
  match.active = tokens.length > 0;
  return match;
}

export default normalizeSearch;
