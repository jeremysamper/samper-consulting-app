// ─────────────────────────────────────────────────────────────
// Catégories de plat (rubriques d'une carte).
// SOURCE UNIQUE : la liste vivait en trois exemplaires divergents.
// Le formulaire « Nouveau plat » proposait 9 catégories quand
// Cartes & Recettes n'affichait que 4 onglets en dur : un plat rangé
// en Boissons, Poissons, Viandes, Pâtes & Risottos ou Menus était
// enregistré en base mais n'apparaissait sur aucune carte.
//
// Util pur (ni React ni DOM) : référentiel d'affichage + ordre de
// service, utilisé pour les <select>, les onglets, le regroupement
// des pickers et l'ordre des pages des exports PDF.
// ─────────────────────────────────────────────────────────────

// Ordre de service : c'est aussi l'ordre des onglets et des sections.
export const CATEGORIES_PLAT = [
  'Entrées',
  'Plats',
  'Poissons',
  'Viandes',
  'Pâtes & Risottos',
  'Fromages',
  'Desserts',
  'Boissons',
  'Menus',
];

// Rubrique de repli pour les plats sans catégorie (imports anciens).
export const CATEGORIE_PLAT_DEFAUT = 'Autres';

// Catégorie affichable d'un plat : jamais vide, sinon le plat serait
// filtré hors de toutes les sections et deviendrait invisible.
export const categorieDuPlat = (plat) => (plat?.categorie || '').trim() || CATEGORIE_PLAT_DEFAUT;

// Rang de tri. Les valeurs hors référentiel (texte libre venu d'un
// import) passent après les catégories connues plutôt que d'être perdues.
export const platCatRank = (categorie) => {
  const i = CATEGORIES_PLAT.indexOf(categorie);
  return i === -1 ? CATEGORIES_PLAT.length : i;
};

// Catégories réellement présentes dans une liste de plats, dédupliquées
// et rangées dans l'ordre de service. Alimente les onglets : on n'affiche
// pas d'onglet vide, et aucune catégorie ne peut être oubliée.
export const categoriesPresentes = (plats = []) => {
  const vues = new Set(plats.map(categorieDuPlat));
  return [...vues].sort((a, b) => platCatRank(a) - platCatRank(b) || a.localeCompare(b));
};

// Regroupe des plats par catégorie, dans l'ordre de service.
// Retourne [[categorie, plats], …].
export const grouperParCategorie = (plats = []) => {
  const m = new Map();
  plats.forEach(p => {
    const cat = categorieDuPlat(p);
    if (!m.has(cat)) m.set(cat, []);
    m.get(cat).push(p);
  });
  return [...m.entries()].sort((a, b) => platCatRank(a[0]) - platCatRank(b[0]) || a[0].localeCompare(b[0]));
};
