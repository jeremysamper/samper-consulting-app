// ─────────────────────────────────────────────────────────────────────────────
// Chiffrage d'une fiche, d'un plat et d'une carte, sans React ni DOM (testé par
// node --test, chiffrage.test.mjs).
//
// Une seule règle pour deux écrans : le Chiffrage des Outils consultant et les
// Marges de la Comptabilité appellent chiffrerFiche, leurs chiffres sont donc
// les mêmes par construction (au centime près). Le coût matière vient de
// computeCoutMatiere (prix du catalogue, sinon prix noté dans la fiche).
//
// Fiche : coût matière total, coût par portion, food cost (coût par portion
// sur prix de vente), marge brute par portion. Sans prix de vente : food cost
// et marge en % à null, marge brute à 0, comme le Chiffrage l'a toujours
// affiché. Des portions nulles ou négatives donnent un coût par portion de 0.
//
// Plat : une portion de chaque fiche rattachée, sauf une fiche citée comme
// ingrédient (par nom normalisé) d'une autre fiche du même plat : elle est
// déjà comptée chez sa fiche parente. Prix : celui du plat, sinon celui de
// l'unique fiche comptée, sinon aucun (« prix à saisir dans le Chiffrage »).
//
// Carte : somme des coûts sur somme des prix, une portion de chaque plat qui
// a un prix et au moins une fiche, sans pondération par les ventes.
//
// Rien n'est arrondi ici : l'écran arrondit à l'affichage.
// ─────────────────────────────────────────────────────────────────────────────

import { computeCoutMatiere, describePrixIngredient } from '../services/prixResolution.js';
import { normalizeName } from '../services/recipeProductMatching.js';

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const prixPositif = (v) => {
  const n = nombre(v);
  return n != null && n > 0 ? n : null;
};

// Les quatre indicateurs du Chiffrage pour une fiche.
//   → { coutMatiere, coutPortion, foodCost, margeBrute, margeGrossePct }
export function chiffrerFiche(recette, produitIndex) {
  const coutMatiere = computeCoutMatiere(recette?.ingredients, produitIndex);
  const portions = Number(recette?.portions);
  const coutPortion = portions > 0 ? coutMatiere / portions : 0;
  const prixVente = recette?.prixVente;
  return {
    coutMatiere,
    coutPortion,
    foodCost: prixVente ? (coutPortion / prixVente * 100) : null,
    margeBrute: prixVente ? prixVente - coutPortion : 0,
    margeGrossePct: prixVente ? ((prixVente - coutPortion) / prixVente * 100) : null,
  };
}

// Ingrédients nommés qui n'ont aucun prix (ni au catalogue, ni dans la fiche) :
// la fiche est chiffrée sans eux, l'écran le dit.
export function lignesNonChiffrees(recette, produitIndex) {
  return (recette?.ingredients || []).filter((ing) => {
    if (!ing || !String(ing.nom || '').trim()) return false;
    return !(describePrixIngredient(ing, produitIndex).prix > 0);
  });
}

// Fiches d'un plat : celles qui comptent (une portion chacune) et celles déjà
// citées comme ingrédient d'une autre fiche du même plat. `manquantes` : liens
// vers une fiche introuvable (supprimée, ou d'un autre établissement).
//   → { comptees: [recette], citees: [recette], manquantes }
export function fichesDuPlat(plat, recettesParId) {
  const vues = new Set();
  const fiches = [];
  let manquantes = 0;
  (plat?.recettes || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach((lien) => {
    const id = lien?.recetteId;
    if (!id || vues.has(id)) return;
    vues.add(id);
    const r = recettesParId instanceof Map ? recettesParId.get(id) : recettesParId?.[id];
    if (r) fiches.push(r);
    else manquantes += 1;
  });
  const citeePar = (fiche) => {
    const nom = normalizeName(fiche.nom);
    if (!nom) return false;
    return fiches.some(autre => autre !== fiche
      && (autre.ingredients || []).some(ing => normalizeName(ing?.nom) === nom));
  };
  const comptees = [];
  const citees = [];
  fiches.forEach(f => (citeePar(f) ? citees : comptees).push(f));
  return { comptees, citees, manquantes };
}

// Coût d'une portion du plat, son prix et sa marge.
//   → { cout, prix, sourcePrix: 'plat' | 'fiche' | null, foodCost, marge,
//       comptees, citees, manquantes, nonChiffrees }
export function chiffrerPlat(plat, recettesParId, produitIndex) {
  const { comptees, citees, manquantes } = fichesDuPlat(plat, recettesParId);
  const cout = comptees.length
    ? comptees.reduce((s, r) => s + chiffrerFiche(r, produitIndex).coutPortion, 0)
    : null;
  let prix = prixPositif(plat?.prixVente);
  let sourcePrix = prix != null ? 'plat' : null;
  if (prix == null && comptees.length === 1) {
    prix = prixPositif(comptees[0].prixVente);
    sourcePrix = prix != null ? 'fiche' : null;
  }
  const chiffrable = cout != null && prix != null;
  return {
    cout,
    prix,
    sourcePrix,
    foodCost: chiffrable ? (cout / prix * 100) : null,
    marge: chiffrable ? prix - cout : null,
    comptees,
    citees,
    manquantes,
    nonChiffrees: comptees.reduce((n, r) => n + lignesNonChiffrees(r, produitIndex).length, 0),
  };
}

// Une portion de chaque plat de la carte : somme des coûts sur somme des prix.
// Un plat sans fiche ou sans prix n'entre dans aucune des deux sommes.
//   → { cout, prix, foodCost, marge, plats: [{ plat, ...chiffrerPlat }],
//       comptes, sansPrix, sansFiche }
export function chiffrerCarte(plats, recettesParId, produitIndex) {
  const lignes = (plats || []).map(plat => ({ plat, ...chiffrerPlat(plat, recettesParId, produitIndex) }));
  let cout = 0;
  let prix = 0;
  let comptes = 0;
  let sansPrix = 0;
  let sansFiche = 0;
  lignes.forEach((l) => {
    if (l.cout == null) { sansFiche += 1; return; }
    if (l.prix == null) { sansPrix += 1; return; }
    cout += l.cout;
    prix += l.prix;
    comptes += 1;
  });
  return {
    cout: comptes ? cout : null,
    prix: comptes ? prix : null,
    foodCost: comptes && prix > 0 ? (cout / prix * 100) : null,
    marge: comptes ? prix - cout : null,
    plats: lignes,
    comptes,
    sansPrix,
    sansFiche,
  };
}

// Couleur du food cost, comme le Chiffrage : moins de 30 % succès, moins de
// 35 % alerte, sinon danger. Rend le nom du statut, l'écran choisit son jeton.
export function niveauFoodCost(foodCost) {
  if (foodCost == null || !Number.isFinite(foodCost)) return null;
  return foodCost < 30 ? 'succes' : foodCost < 35 ? 'alerte' : 'danger';
}
