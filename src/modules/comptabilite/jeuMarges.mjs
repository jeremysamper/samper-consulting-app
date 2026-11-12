// Jeu d'essai des marges et du chiffrage, partagé par les tests (serieMarges,
// serieChiffrage, Statistiques) : six produits, sept fiches (une archivée, une
// cachée, une sans prix), cinq plats sur deux cartes (une cachée, une archivée
// en plus), au format de listRecettes, listPlats, listCartes, listProduits.
const prod = (id, nom, uniteRef, prix) => ({ id, nom, uniteRef, prixUnitaire: prix, strategiePrix: 'max', fournisseurs: [{ prixUnitaire: prix, estPrincipal: true }] });
const ing = (nom, quantite, unite, produitId = null, prixUnit = 0) => ({ nom, quantite, unite, produitId, prixUnit });
const rec = (id, nom, portions, prixVente, ingredients, extra = {}) => ({ id, nom, portions, prixVente, ingredients, statut: 'validée', masquee: false, ...extra });
const plat = (id, nom, prixVente, ids, carteIds, extra = {}) => ({ id, nom, prixVente, actif: true, carteIds, recettes: ids.map((recetteId, ordre) => ({ recetteId, role: 'composant', ordre })), ...extra });

export function jeuMarges() {
  const produits = [
    prod('p-boeuf', 'Filet de boeuf', 'kg', 52), prod('p-pdt', 'Pommes de terre', 'kg', 1.8),
    prod('p-beurre', 'Beurre', 'kg', 14.5), prod('p-creme', 'Crème 35 %', 'L', 6.2),
    prod('p-saumon', 'Saumon', 'kg', 38), prod('p-riz', 'Riz carnaroli', 'kg', 4.9),
  ];
  const recettes = [
    rec('r-boeuf', 'Filet de boeuf, sauce au poivre', 4, 48, [ing('Filet de boeuf', 0.72, 'kg', 'p-boeuf'), ing('Beurre', 60, 'g', 'p-beurre'), ing('Crème 35 %', 0.2, 'L', 'p-creme'), ing('Pommes de terre', 0.8, 'kg', 'p-pdt')]),
    rec('r-risotto', 'Risotto au safran', 6, 29, [ing('Riz carnaroli', 0.45, 'kg', 'p-riz'), ing('Beurre', 90, 'g', 'p-beurre'), ing('Safran', 0.5, 'g', null, 12)]),
    rec('r-saumon', 'Saumon mi-cuit', 4, 36, [ing('Saumon', 0.6, 'kg', 'p-saumon'), ing('Beurre', 40, 'g', 'p-beurre')]),
    rec('r-gratin', 'Gratin dauphinois', 10, 0, [ing('Pommes de terre', 1.5, 'kg', 'p-pdt'), ing('Crème 35 %', 0.5, 'L', 'p-creme')]),
    rec('r-tarte', 'Tarte au citron', 8, 14, [ing('Farine', 0.25, 'kg', null, 1.2), ing('Beurre', 150, 'g', 'p-beurre')]),
    rec('r-vieille', 'Ancienne terrine', 10, 12, [ing('Beurre', 100, 'g', 'p-beurre')], { statut: 'archivée' }),
    rec('r-cachee', 'Essai du chef', 2, 22, [ing('Saumon', 0.3, 'kg', 'p-saumon')], { masquee: true }),
  ];
  const cartes = [
    { id: 'c-midi', nom: 'Carte de midi', archive: false, masquee: false },
    { id: 'c-test', nom: 'Carte d\'essai', archive: false, masquee: true },
    { id: 'c-hiver', nom: 'Carte d\'hiver 2025', archive: true, masquee: false },
  ];
  const plats = [
    plat('pl-boeuf', 'Boeuf et gratin', 52, ['r-boeuf', 'r-gratin'], ['c-midi']),
    plat('pl-risotto', 'Risotto', 29, ['r-risotto'], ['c-midi']),
    plat('pl-saumon', 'Saumon', null, ['r-saumon'], ['c-midi', 'c-test']),
    plat('pl-nouveau', 'Plat sans fiche', 25, [], ['c-midi']),
    plat('pl-retire', 'Plat retiré', 30, ['r-tarte'], ['c-midi'], { actif: false }),
  ];
  return { produits, recettes, cartes, plats };
}
