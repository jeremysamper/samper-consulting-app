// ─────────────────────────────────────────────────────────────
// scanFactureLogic - rapprochement des lignes d'un document fournisseur
// avec le catalogue produits, et calcul du nouveau prix.
//
// Le rapprochement se fait du moins cher au plus cher :
//   1. référence article du fournisseur, déjà rattachée -> certitude, zéro IA
//   2. libellé déjà rattaché (alias) -> certitude, zéro IA
//   3. matching flou local (matchIngredient) -> à confirmer
//   4. rien -> création de produit proposée
//
// Un alias validé une fois n'est jamais repayé : c'est tout l'intérêt du
// dispositif, la deuxième facture d'un fournisseur se relit presque sans effort.
// ─────────────────────────────────────────────────────────────

import { matchIngredient, normalizeName } from '../../../services/recipeProductMatching.js';
import { resolvePrixProduit } from '../../../services/prixResolution.js';

// Seuil de signalement d'une hausse ou d'une baisse de prix.
export const SEUIL_ECART_PCT = 15;

// Prix par unité de base (CHF/g, CHF/ml ou CHF/pcs) d'une ligne de document.
//
// On divise le TOTAL de la ligne par la quantité TOTALE livrée. C'est le seul
// calcul robuste : sur les vrais documents, la colonne « Prix » est le prix de
// l'unité livrée et cette unité change d'une ligne à l'autre — tantôt le kilo,
// tantôt la bouteille, tantôt le sac entier. Le total, lui, ne prête pas à
// confusion et se recoupe avec le total du document.
export function prixUnitaireDepuisLigne(ligne) {
  if (!ligne) return null;
  const montant = ligne.montantLigne;
  const totale = ligne.quantiteTotale;
  if (montant == null || montant === '' || totale == null || totale === '') return null;
  const m = Number(montant);
  const q = Number(totale);
  if (!Number.isFinite(m) || !Number.isFinite(q) || q <= 0) return null;
  return m / q;
}

// Traduit une ligne vers les colonnes de produit_fournisseurs.
//
// prix_unitaire y est GÉNÉRÉ par Postgres : prix_achat / quantite_cond quand
// l'unité n'est ni kg ni L. On envoie donc le prix d'UN colis et le contenu d'UN
// colis en unité de base, ce qui redonne exactement montantLigne / quantiteTotale.
export function colisDepuisLigne(ligne) {
  const prix = prixUnitaireDepuisLigne(ligne);
  if (prix == null) return null;
  const nbColis = Number(ligne.quantite) > 0 ? Number(ligne.quantite) : 1;
  const unite = ['g', 'ml', 'pcs'].includes(ligne.uniteTotale) ? ligne.uniteTotale : 'pcs';
  return {
    prixAchat: Math.round((Number(ligne.montantLigne) / nbColis) * 1e6) / 1e6,
    quantiteCond: Math.round((Number(ligne.quantiteTotale) / nbColis) * 1e6) / 1e6,
    uniteCond: unite,
  };
}

// Indexe les alias pour un rapprochement en O(1).
// `alias` : [{ produitId, fournisseurId, libelleNorm, referenceFourn }]
export function buildAliasIndex(alias) {
  const parLibelle = new Map();
  const parReference = new Map();
  (alias || []).forEach(a => {
    if (!a || !a.produitId) return;
    if (a.libelleNorm) parLibelle.set(a.libelleNorm, a.produitId);
    if (a.referenceFourn) {
      parReference.set(`${a.fournisseurId || ''}::${a.referenceFourn}`, a.produitId);
    }
  });
  return { parLibelle, parReference };
}

// Rapproche une ligne de document. Renvoie la ligne enrichie.
//
// statut :
//   'alias'    reconnue par un alias, produit certain
//   'auto'     matching flou sûr (>= 85), à confirmer d'un clic
//   'ambigu'   plusieurs candidats
//   'aucun'    rien au catalogue
//   'ignoree'  ligne non produit (port, consigne, TVA)
export function rapprocherLigne(ligne, { catalogue, aliasIndex, produitIndex, fournisseurId }) {
  const base = { ...ligne, produit: null, suggestions: [], confidenceMatch: 0 };

  if ((ligne.issues || []).includes('ligne non produit')) {
    return { ...base, statut: 'ignoree' };
  }

  const prendre = (produitId, statut) => {
    const produit = produitIndex.get(produitId);
    if (!produit) return null;
    return { ...base, statut, produit, confidenceMatch: 100 };
  };

  // 1. Référence article : le rapprochement le plus fiable, un numéro ne varie pas.
  if (ligne.referenceFourn) {
    const id = aliasIndex.parReference.get(`${fournisseurId || ''}::${ligne.referenceFourn}`);
    const r = id && prendre(id, 'alias');
    if (r) return r;
  }

  // 2. Libellé déjà rattaché.
  const norm = normalizeName(ligne.libelle);
  if (norm) {
    const id = aliasIndex.parLibelle.get(norm);
    const r = id && prendre(id, 'alias');
    if (r) return r;
  }

  // 3. Matching flou local, gratuit.
  const res = matchIngredient(ligne.libelle, catalogue);
  if (res.status === 'matched' && res.product) {
    return { ...base, statut: 'auto', produit: res.product, confidenceMatch: res.confidence };
  }
  if (res.status === 'ambiguous' && (res.suggestions || []).length) {
    return { ...base, statut: 'ambigu', suggestions: res.suggestions, confidenceMatch: res.confidence };
  }
  return { ...base, statut: 'aucun' };
}

// Calcule ce que la ligne changerait pour le produit visé.
// Renvoie null quand il n'y a rien de chiffrable.
export function calculerImpact(ligne, produit) {
  if (!produit) return null;
  const nouveau = prixUnitaireDepuisLigne(ligne);
  if (nouveau == null || !(nouveau > 0)) return null;

  // Le prix du document est en CHF par unité de base de la ligne ; le produit a
  // sa propre unité de référence. Comparer des CHF/g à des CHF/pcs n'a aucun sens.
  const uniteProduit = produit.uniteRef || 'g';
  if (ligne.uniteTotale && ligne.uniteTotale !== uniteProduit) {
    return {
      actuel: resolvePrixProduit(produit),
      nouveau,
      ecartPct: null,
      alerte: false,
      verrouille: !!produit.prixVerrouille,
      uniteDivergente: { document: ligne.uniteTotale, produit: uniteProduit },
    };
  }

  const actuel = resolvePrixProduit(produit);
  const ecartPct = actuel > 0 ? ((nouveau - actuel) / actuel) * 100 : null;
  return {
    actuel,
    nouveau,
    ecartPct,
    // Un prix qui bondit est le signal d'une erreur de lecture aussi souvent
    // que d'une vraie hausse : dans les deux cas il faut le regarder.
    alerte: ecartPct != null && Math.abs(ecartPct) >= SEUIL_ECART_PCT,
    verrouille: !!produit.prixVerrouille,
    uniteDivergente: null,
  };
}

// Une ligne est-elle applicable en l'état ?
export function estApplicable(ligne) {
  if (!ligne || !ligne.produit) return false;
  if (ligne.statut === 'ignoree') return false;
  if (ligne.produit.prixVerrouille) return false;
  const impact = calculerImpact(ligne, ligne.produit);
  // Une unité divergente rendrait le prix faux d'un facteur inconnu : on refuse.
  if (!impact || impact.uniteDivergente) return false;
  return true;
}

// Prépare les écritures d'une session validée.
// Rien n'est envoyé ici : la fonction ne fait que décrire ce qui sera écrit,
// pour que l'écran puisse l'afficher avant de le faire.
export function planScanWrites(lignes, { scanId, fournisseurId, dateFacture, documentUrl, userId }) {
  const refs = [];      // produit_fournisseurs
  const historique = [];
  const aliasACreer = [];

  (lignes || []).forEach(l => {
    if (!estApplicable(l) || !l.applique) return;
    const colis = colisDepuisLigne(l);
    if (!colis) return;

    // prix_unitaire n'est JAMAIS envoyé : Postgres le génère depuis ces trois-là.
    refs.push({
      produitId: l.produit.id,
      fournisseurId,
      prixAchat: colis.prixAchat,
      quantiteCond: colis.quantiteCond,
      uniteCond: colis.uniteCond,
      conditionnement: l.conditionnement,
      reference: l.referenceFourn || null,
    });

    historique.push({
      produitId: l.produit.id,
      fournisseurId,
      prixUnitaire: prixUnitaireDepuisLigne(l),
      prixAchat: colis.prixAchat,
      quantiteCond: colis.quantiteCond,
      uniteCond: colis.uniteCond,
      source: 'scan',
      scanId,
      documentUrl: documentUrl || null,
      releveLe: dateFacture || new Date().toISOString().slice(0, 10),
      createdBy: userId || null,
    });

    // On n'apprend un alias que sur une décision humaine : une ligne déjà
    // reconnue par alias n'a rien à réapprendre.
    if (l.statut !== 'alias') {
      aliasACreer.push({
        produitId: l.produit.id,
        fournisseurId,
        libelle: l.libelle,
        libelleNorm: normalizeName(l.libelle),
        referenceFourn: l.referenceFourn || null,
        source: 'scan',
        createdBy: userId || null,
      });
    }
  });

  return { refs, historique, aliasACreer };
}
