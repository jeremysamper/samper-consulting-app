import { normalizeSearch } from '../../utils/searchText.js';

// ─────────────────────────────────────────────────────────────────────────────
// Catégories de caisse (caisse_categories, migration v4).
//
// La caisse range ses produits dans SES catégories, sans jamais écrire
// plats.categorie (donnée de Cartes & Recettes). Tant que la maison n'a créé
// aucune catégorie, celles du code servent : la migration ne sème rien.
//
// Où va un produit, dans l'ordre :
//   1. la catégorie choisie par la maison (caisse_boutons.categorie_id) ;
//   2. la catégorie de caisse qui porte le même nom que plats.categorie
//      (Entrées, Plats, Desserts retombent ainsi à leur place) ;
//   3. « Boissons à trier » pour plats.categorie = Boissons ;
//   4. « Autres » pour le reste.
// Relevé en base le 10.11.2026 : Entrées, Plats, Desserts, Boissons (68 au
// Rucher), puis des catégories maison (Apéritifs, Gâteaux, Stations...).
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIES_DEFAUT = [
  { nom: 'Entrées', picto: null },
  { nom: 'Plats', picto: null },
  { nom: 'Desserts', picto: 'gateau' },
  { nom: 'Boissons chaudes', picto: null },
  { nom: 'Softs', picto: 'verre' },
  { nom: 'Alcools', picto: 'verre' },
  { nom: 'Vins', picto: 'verre' },
  { nom: 'Autres', picto: null },
];

export const ID_TOUT = '_tout';
export const ID_A_TRIER = '_boissons';
export const ID_AUTRES = '_autres';
const PREFIXE_DEFAUT = 'defaut:';

const cle = (s) => normalizeSearch(s).trim();

// « Autres » reçoit tout ce que la maison n'a pas rangé. Ses produits gardent
// à l'écran leur regroupement d'origine (plats.categorie : Apéritifs,
// Fromages, Stations...), en sous-titres : une maison aux nombreuses
// catégories de carte ne se retrouve pas devant un seul tas. Rend null quand
// il n'y a rien à sous-titrer.
export function sousGroupesAutres(categorie) {
  if (!categorie || (categorie.id !== ID_AUTRES && cle(categorie.nom) !== cle('Autres'))) return null;
  const groupes = new Map();
  categorie.articles.forEach((a) => {
    const origine = a.categorie || 'Plats';
    if (!groupes.has(origine)) groupes.set(origine, []);
    groupes.get(origine).push(a);
  });
  if (groupes.size < 2) return null;
  return [...groupes.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([titre, articles]) => ({ titre, articles }));
}

export const estCategorieDefaut = (id) => String(id || '').startsWith(PREFIXE_DEFAUT);
export const estCategorieVirtuelle = (id) => id === ID_A_TRIER || id === ID_AUTRES;

// Les catégories en vigueur : celles de la maison, sinon celles du code.
export function categoriesEnVigueur(categoriesMaison) {
  const maison = [...(categoriesMaison || [])]
    .sort((a, b) => (a.ordre - b.ordre) || String(a.nom).localeCompare(String(b.nom)));
  if (maison.length) return maison;
  return CATEGORIES_DEFAUT.map((c, i) => ({
    id: PREFIXE_DEFAUT + c.nom, nom: c.nom, ordre: i, couleur: null, picto: c.picto, actif: true, defaut: true,
  }));
}

// Range les articles. Rend :
//   categories : toutes les catégories (masquées et vides comprises), chacune
//                avec ses articles dans l'ordre réglé ;
//   onglets    : celles que la grille montre (actives, non vides) ;
//   parArticle : id d'article -> catégorie.
export function rangerArticles({ articles, boutons, categoriesMaison }) {
  const cats = categoriesEnVigueur(categoriesMaison).map((c) => ({ ...c, articles: [] }));
  const parId = new Map(cats.map((c) => [c.id, c]));
  const parNom = new Map(cats.map((c) => [cle(c.nom), c]));
  const aTrier = { id: ID_A_TRIER, nom: 'Boissons à trier', ordre: 9998, couleur: null, picto: 'verre', actif: true, virtuelle: true, articles: [] };
  const autres = parNom.get(cle('Autres'))
    || { id: ID_AUTRES, nom: 'Autres', ordre: 9999, couleur: null, picto: null, actif: true, virtuelle: true, articles: [] };

  const parArticle = new Map();
  (articles || []).forEach((a, rang) => {
    const b = boutons?.[a.id];
    const origine = a.categorie || 'Plats';
    const cible = (b?.categorie_id && parId.get(b.categorie_id))
      || parNom.get(cle(origine))
      || (cle(origine) === cle('Boissons') ? aTrier : autres);
    cible.articles.push({ article: a, ordre: b?.ordre ?? null, rang });
    parArticle.set(a.id, cible);
  });

  // « Boissons à trier » se place juste avant « Autres » quand celle-ci ferme
  // la liste, sinon en fin : le fourre-tout reste le dernier onglet.
  const toutes = [...cats];
  if (aTrier.articles.length) {
    const dernier = toutes[toutes.length - 1];
    if (dernier && dernier === autres) toutes.splice(toutes.length - 1, 0, aTrier);
    else toutes.push(aTrier);
  }
  if (autres.virtuelle && autres.articles.length) toutes.push(autres);
  toutes.forEach((c) => {
    c.articles = c.articles
      .sort((x, y) => ((x.ordre ?? 1e9) - (y.ordre ?? 1e9)) || (x.rang - y.rang))
      .map((x) => x.article);
  });

  return {
    categories: toutes,
    onglets: toutes.filter((c) => c.actif !== false && c.articles.length > 0),
    parArticle,
  };
}
