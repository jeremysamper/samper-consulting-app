// Marchandise de la démo (lot 4a, migration 20261122b_lot4a_commande_base,
// version réduite du 23.11.2026) : des pertes reliées au catalogue et à la
// mise en place, une liste J+1 et quelques lignes d'ingrédient à relier.
// La Commande V1 et les règles de Ventes POS sont retirées : le module
// Commande reste celui de la production.
// Le front déjà en ligne ne lit aucune colonne neuve ; celles ajoutées aux
// tables qu'il lit (pertes, mise en place, fiches) ne changent rien à ce qu'il
// affiche.
import { ETAB, aujourdhui, jour, jourSemaine, instant } from './base.js';
import { PRODUITS, PRODUIT } from './catalogue.js';

// 1 = lundi à 7 = dimanche, comme isodow.
export const jourIso = (isoJour) => jourSemaine(isoJour) || 7;

// ── Pertes ───────────────────────────────────────────────────────────────────

const PRODUIT_PAR_NOM = Object.fromEntries(PRODUITS.map((pr) => [pr.nom, pr.id]));

// Colonnes du lot 4a sur les pertes de la démo, plus trois déclarations pour
// que les produits fréquents aient un ordre. La dernière perte (« Beurre
// blanc ») devient un « jeté » de la mise en place du soir.
export function pertesLot4a(pertes, mepItems) {
  const beurreBlanc = mepItems.find((i) => i.recette_id === 'r-beurre-blanc');
  const enrichies = pertes.map((p) => ({ produit_id: PRODUIT_PAR_NOM[p.produit] || null, recette_id: null, mep_item_id: null, source: 'saisie', ...p }));
  const derniere = enrichies.find((p) => p.produit === 'Beurre blanc');
  if (derniere && beurreBlanc) Object.assign(derniere, { recette_id: 'r-beurre-blanc', mep_item_id: beurreBlanc.id, source: 'mep' });
  const ajout = (id, d, cle, quantite, unite, valeur, motif, par) => ({
    id, etablissement_id: ETAB, date: jour(d), produit: PRODUIT[cle].nom, categorie: PRODUIT[cle].categorie, quantite, unite,
    valeur_unit: valeur, motif, declare_par: par, valide: true, valide_par: 'demo-chef', commentaire: null,
    created_at: instant(jour(d), '22:10'), updated_at: instant(jour(d), '22:10'),
    produit_id: PRODUIT[cle].id, recette_id: null, mep_item_id: null, source: 'frequent',
  });
  return enrichies.concat([
    ajout('pe-lot4a-1', -4, 'creme', 1, 'l', 7.2, 'DLC dépassée', 'demo-cuisinier'),
    ajout('pe-lot4a-2', -9, 'creme', 2, 'l', 7.2, 'DLC dépassée', 'demo-cuis-2'),
    ajout('pe-lot4a-3', -7, 'fera', 0.3, 'kg', 56, 'Erreur de préparation', 'demo-cuisinier'),
  ]);
}

// ── Mise en place ────────────────────────────────────────────────────────────

const MEP_J1 = '00000000-0000-4000-8000-0000000000f3';

// Colonnes du lot 4a sur les listes existantes, et la liste de demain
// pré-remplie par les ventes et la prévision (origine « prevision »).
export function mepLot4a(listes, items) {
  const demain = jour(1);
  const listesEnrichies = listes.map((l) => ({ poste: null, modele_id: null, origine: 'manuel', base_calcul: null, ...l }));
  const itemsEnrichis = items.map((i) => ({ quantite_suggeree: null, origine: 'manuel', ...i }));
  listesEnrichies.push({
    id: MEP_J1, etablissement_id: ETAB, nom: 'Mise en place de demain', date_service: demain, created_by: 'demo-chef',
    created_at: instant(aujourdhui(), '15:00'), poste: 'Chaud', modele_id: '00000000-0000-4000-8000-0000000002a1', origine: 'prevision',
    base_calcul: { jours_ventes: 14, jour_semaine: jourIso(demain), couverts_prevus: 42, couverts_reference: 35 },
  });
  [
    ['veloute-courge', 'Velouté de courge', 6, 'l', true],
    ['sauce-poivre', 'Sauce au poivre', 2, 'l', false],
    ['gratin', 'Gratin dauphinois', 3, 'plaques', false],
  ].forEach(([r, label, quantite, unite, congelable], i) => itemsEnrichis.push({
    id: `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`, liste_id: MEP_J1, recette_id: 'r-' + r, label,
    quantite, unite, congelable, fait: false, fait_par: null, fait_at: null, ordre: i, created_at: instant(aujourdhui(), '15:00'),
    quantite_suggeree: quantite, origine: 'ventes',
  }));
  return { mep_listes: listesEnrichies, mep_items: itemsEnrichis };
}

// ── Catalogue : lignes d'ingrédient à relier ────────────────────────────────

// Trois lignes « échalote » et deux lignes d'herbes saisies à la main, sans
// produit, avec leurs suggestions (même forme qu'en production :
// matchSuggestions [{ nom, produitId, confidence }], needsReview).
export function ingredientsARelier(recettes) {
  const graphies = { 'p-echalote': ['Échalote', 'échalotes', 'Echalotes ciselées'], 'p-herbes': ['Persil', 'Ciboulette fraîche'] };
  const vus = { 'p-echalote': 0, 'p-herbes': 0 };
  return recettes.map((r) => {
    let change = false;
    const ingredients = (r.ingredients || []).map((x) => {
      const liste = graphies[x.produitId];
      if (!liste || vus[x.produitId] >= liste.length) return x;
      const nom = liste[vus[x.produitId]];
      const pr = PRODUITS.find((p) => p.id === x.produitId);
      vus[x.produitId] += 1;
      change = true;
      const { produitId, ...reste } = x;
      return { ...reste, nom, needsReview: true, matchSuggestions: [{ nom: pr.nom, produitId, confidence: 80 }] };
    });
    return change ? { ...r, ingredients } : r;
  });
}
