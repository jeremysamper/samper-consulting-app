// ─────────────────────────────────────────────────────────────────────────────
// Hausses de prix fournisseur, calculées à la lecture depuis l'historique des
// prix (table produit_prix_historique, un relevé daté de la facture par prix
// enregistré), sans table de plus. Fonctions pures, testées par
// haussesPrix.test.mjs ; la lecture est dans useHaussesPrix.js.
//
// Une hausse se juge par produit ET par fournisseur : deux fournisseurs d'un
// même produit qui alternent ne font pas une hausse à chaque facture.
//   nouveau  dernier prix relevé dans la période (30 jours par défaut)
//   ancien   dernier prix relevé avant la période ; sans relevé d'avant, le
//            premier de la période. Un seul relevé, sans précédent : premier
//            prix, jamais une hausse.
//   écart    (nouveau - ancien) / ancien, signalé dès SEUIL_ECART_PCT, le seuil
//            de la lecture des factures (scanFactureLogic.js).
//
// Comparaison à unité égale seulement. Un prix de l'historique est en CHF par
// unité de base (g, ml ou pcs) : unite_cond du relevé, ou à défaut l'unité de
// référence du produit (un prix saisi à la main l'est dans cette unité). Deux
// unités convertibles (g et kg) passent par convertPrix (un prix se divise par
// le facteur de quantité) ; deux unités qui ne se convertissent pas (g et pcs)
// sont un changement d'unité, jamais une hausse. Le conditionnement ne compte
// pas : le prix par unité de base ne dépend pas de la taille du colis.
// ─────────────────────────────────────────────────────────────────────────────

import { SEUIL_ECART_PCT } from './scan/scanFactureLogic.js';
import {
  buildProduitIndex, computeCoutMatiere, convertPrix, describePrixIngredient, resolvePrixProduit,
} from '../../services/prixResolution.js';

export const JOURS_PAR_DEFAUT = 30;
export { SEUIL_ECART_PCT };

const JOUR = /^\d{4}-\d{2}-\d{2}/;

// Premier jour de la période : aujourd'hui compris, `jours` jours en tout.
export function debutPeriode(aujourdhui, jours = JOURS_PAR_DEFAUT) {
  const [a, m, j] = String(aujourdhui).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j - (jours - 1))).toISOString().slice(0, 10);
}

const prixDe = (r) => {
  const n = Number(r?.prixUnitaire);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Ordre des relevés d'un même produit : la date de la facture, puis l'heure
// d'enregistrement (deux factures du même jour), puis l'identifiant.
const ordre = (a, b) => String(a.releveLe).slice(0, 10).localeCompare(String(b.releveLe).slice(0, 10))
  || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  || String(a.id || '').localeCompare(String(b.id || ''));

// Hausses de la période, de la plus forte à la plus faible.
//   releves  [{ id, produitId, fournisseurId, fournisseurNom, prixUnitaire, uniteCond, releveLe, createdAt }]
//   produits ceux de l'établissement (listProduits) : nom et unité de
//            référence ; un relevé d'un produit absent est ignoré
export function haussesPrix(releves, produits, { aujourdhui, jours = JOURS_PAR_DEFAUT, seuilPct = SEUIL_ECART_PCT } = {}) {
  if (!aujourdhui) return [];
  const debut = debutPeriode(aujourdhui, jours);
  const fin = String(aujourdhui).slice(0, 10);
  const index = buildProduitIndex(produits);

  const groupes = new Map();
  (releves || []).forEach((r) => {
    if (!r?.produitId || !index.has(r.produitId) || !JOUR.test(String(r.releveLe || '')) || prixDe(r) == null) return;
    const cle = `${r.produitId}::${r.fournisseurId || ''}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(r);
  });

  const sortie = [];
  groupes.forEach((liste) => {
    liste.sort(ordre);
    const jour = (r) => String(r.releveLe).slice(0, 10);
    const premier = liste.findIndex((r) => jour(r) >= debut && jour(r) <= fin);
    if (premier < 0) return;
    let dernier = premier;
    liste.forEach((r, i) => { if (jour(r) >= debut && jour(r) <= fin) dernier = i; });
    const nouveau = liste[dernier];
    const ancien = premier > 0 ? liste[premier - 1] : (dernier > premier ? liste[premier] : null);
    if (!ancien) return; // premier prix connu : rien à comparer

    const produit = index.get(nouveau.produitId);
    const uniteRef = produit.uniteRef || 'g';
    const unite = nouveau.uniteCond || uniteRef;
    const uniteAncien = ancien.uniteCond || uniteRef;
    const prixAncien = convertPrix(prixDe(ancien), uniteAncien, unite);
    if (prixAncien == null || !(prixAncien > 0)) return; // changement d'unité
    const prixNouveau = prixDe(nouveau);
    // Arrondi au millionième : 1.00 puis 1.15 vaut 15 %, pas 14,999999.
    const ecartPct = Math.round(((prixNouveau - prixAncien) / prixAncien) * 100 * 1e6) / 1e6;
    if (ecartPct < seuilPct) return;

    sortie.push({
      cle: `${nouveau.produitId}::${nouveau.fournisseurId || ''}`,
      produitId: nouveau.produitId,
      produitNom: produit.nom || '',
      fournisseurId: nouveau.fournisseurId || null,
      fournisseurNom: nouveau.fournisseurNom || ancien.fournisseurNom || '',
      unite,
      ancien: prixAncien,
      nouveau: prixNouveau,
      ecartPct,
      depuis: jour(ancien),
      le: jour(nouveau),
    });
  });
  return sortie.sort((a, b) => b.ecartPct - a.ecartPct || a.produitNom.localeCompare(b.produitNom));
}

// Prix d'affichage : CHF le kg ou le litre plutôt que des millièmes de CHF le
// gramme ; la pièce reste la pièce.
const AFFICHAGE = { g: { unite: 'kg', libelle: 'le kg' }, ml: { unite: 'L', libelle: 'le litre' }, pcs: { unite: 'pcs', libelle: 'la pièce' } };

export function prixAffiche(prix, unite) {
  const a = AFFICHAGE[unite];
  if (!a) return { prix, libelle: unite ? `par ${unite}` : '' };
  const converti = convertPrix(prix, unite, a.unite);
  return { prix: converti == null ? prix : converti, libelle: a.libelle };
}

// Index qui rend le produit au prix donné (stratégie manuelle), les autres
// inchangés : computeCoutMatiere ne lit l'index que par get().
const indexAuPrix = (index, produit, prix) => ({
  get: (id) => (id === produit.id ? { ...produit, strategiePrix: 'manuel', prixUnitaireManuel: prix } : index.get(id)),
});

// Effet d'une hausse sur les fiches qui utilisent le produit directement
// (ingrédient lié par produitId), par le calcul du coût matière de
// prixResolution.js : coût de la fiche au nouveau prix moins son coût à
// l'ancien. Fiches archivées et cachées exclues (Cartes & Recettes ne les
// montre pas). Les sous-recettes ne sont pas dépliées.
//
//   suitCatalogue  le prix retenu au catalogue pour ce produit est le nouveau
//                  prix : les fiches l'ont déjà pris. Faux quand le prix
//                  retenu vient d'un autre fournisseur ou d'une saisie : le
//                  coût des fiches n'a pas bougé, l'effet n'est pas donné.
//   fiches         [{ id, nom, deltaParPortion, deltaPct, chiffrable }], de la
//                  plus touchée à la moins touchée ; chiffrable faux quand une
//                  ligne ne se convertit pas (produit au kg, fiche en pièces)
export function effetsSurFiches(hausse, recettes, produits) {
  const index = buildProduitIndex(produits);
  const produit = hausse && index.get(hausse.produitId);
  if (!produit) return { suitCatalogue: false, fiches: [] };
  const uniteRef = produit.uniteRef || 'g';
  const nouveauRef = convertPrix(hausse.nouveau, hausse.unite, uniteRef);
  const ancienRef = convertPrix(hausse.ancien, hausse.unite, uniteRef);
  const retenu = resolvePrixProduit(produit);
  const suitCatalogue = nouveauRef != null && Math.abs(retenu - nouveauRef) <= Math.max(1e-9, nouveauRef * 0.005);

  const fiches = (recettes || [])
    .filter((r) => r && r.statut !== 'archivée' && r.masquee !== true
      && (r.ingredients || []).some((i) => i && i.produitId === produit.id))
    .map((r) => {
      const base = { id: r.id, nom: r.nom || '', deltaParPortion: null, deltaPct: null, chiffrable: false };
      if (nouveauRef == null || ancienRef == null) return base;
      const lignes = (r.ingredients || []).filter((i) => i && i.produitId === produit.id);
      if (lignes.some((i) => describePrixIngredient(i, index).source !== 'catalogue')) return base;
      const avant = computeCoutMatiere(r.ingredients, indexAuPrix(index, produit, ancienRef));
      const apres = computeCoutMatiere(r.ingredients, indexAuPrix(index, produit, nouveauRef));
      const delta = apres - avant;
      const portions = Number(r.portions) > 0 ? Number(r.portions) : null;
      return {
        ...base,
        chiffrable: portions != null,
        deltaParPortion: portions ? delta / portions : null,
        deltaPct: avant > 0 ? (delta / avant) * 100 : null,
      };
    })
    .sort((a, b) => (b.deltaPct ?? -1) - (a.deltaPct ?? -1) || a.nom.localeCompare(b.nom));
  return { suitCatalogue, fiches };
}
