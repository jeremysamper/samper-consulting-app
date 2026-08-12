// ─────────────────────────────────────────────────────────────
// scanFactureLogic - rapprochement des lignes d'une facture scannée
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

// Reproduit À L'IDENTIQUE la colonne générée produit_fournisseurs.prix_unitaire.
//
// L'expression vit en base ; on la rejoue ici uniquement pour montrer le prix
// et son écart AVANT d'écrire. Toute divergence entre les deux ferait mentir
// l'écran de revue : si l'expression change en base, corriger ici aussi.
//   kg et L -> prix_achat / (quantite_cond * 1000)   (prix par g ou par ml)
//   autre   -> prix_achat / quantite_cond
//   sans conditionnement -> prix_achat tel quel
export function prixUnitaireDepuisColis(prixAchat, quantiteCond, uniteCond) {
  // Number(null) et Number('') valent 0, pas NaN : sans ce filtre, un prix
  // illisible sur la facture deviendrait un prix de zero au catalogue, et
  // ferait tomber le cout des recettes concernees sans rien signaler.
  if (prixAchat == null || prixAchat === '') return null;
  const p = Number(prixAchat);
  if (!Number.isFinite(p)) return null;
  const q = quantiteCond == null || quantiteCond === '' ? NaN : Number(quantiteCond);
  if (!Number.isFinite(q) || q <= 0) return p;
  if (uniteCond === 'kg' || uniteCond === 'L') return p / (q * 1000);
  return p / q;
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

// Rapproche une ligne de facture. Renvoie la ligne enrichie.
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
  const nouveau = prixUnitaireDepuisColis(ligne.prixAchat, ligne.quantiteCond, ligne.uniteCond);
  if (nouveau == null || !(nouveau > 0)) return null;

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
  };
}

// Une ligne est-elle applicable en l'état ?
export function estApplicable(ligne) {
  if (!ligne || !ligne.produit) return false;
  if (ligne.statut === 'ignoree') return false;
  if (ligne.produit.prixVerrouille) return false;
  const impact = calculerImpact(ligne, ligne.produit);
  return !!impact;
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
    const prixUnitaire = prixUnitaireDepuisColis(l.prixAchat, l.quantiteCond, l.uniteCond);

    // prix_unitaire est GÉNÉRÉ en base : on n'envoie que les composants.
    refs.push({
      produitId: l.produit.id,
      fournisseurId,
      prixAchat: l.prixAchat,
      quantiteCond: l.quantiteCond,
      uniteCond: l.uniteCond,
      conditionnement: l.conditionnement,
      reference: l.referenceFourn || null,
    });

    historique.push({
      produitId: l.produit.id,
      fournisseurId,
      prixUnitaire,
      prixAchat: l.prixAchat,
      quantiteCond: l.quantiteCond,
      uniteCond: l.uniteCond,
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
