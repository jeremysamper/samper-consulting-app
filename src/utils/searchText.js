// Normalisation de recherche : minuscules + sans accents (poivre = poivré) +
// ligatures repliées (bœuf = boeuf). Une seule implémentation pour toute
// l'app, sinon « creme » trouve « Crème brûlée » dans un module et pas
// dans le suivant.
export const normalizeSearch = (s) => String(s || '')
  .toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

export default normalizeSearch;
