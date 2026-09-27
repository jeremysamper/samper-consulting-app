// ─────────────────────────────────────────────────────────────────────────────
// Achats de la période et consommation matière, sans React.
//
// Entre deux inventaires d'un même périmètre :
//
//   consommation = stock de début + achats de la période - stock de fin
//
// Les achats viennent des factures et bons lus par l'IA (achats_documents).
// Chaque ligne de document est rattachée à un produit de l'inventaire :
//   1. décision manuelle mémorisée sur la ligne (lien 'manuel' / 'ignore')
//   2. même libellé déjà rattaché à la main sur un autre document
//   3. alias du catalogue (appris par le scan de factures du Catalogue)
//   4. rapprochement flou local, gratuit
// Rien de tout ça n'appelle l'IA : elle n'intervient qu'à la lecture.
// ─────────────────────────────────────────────────────────────────────────────

import { matchIngredient, normalizeName, tokenize } from '../../services/recipeProductMatching.js';
import { estCompte } from './inventaireLignes.js';

export const TYPES_DOCUMENT = [
  { id: 'facture', label: 'Facture', pluriel: 'factures' },
  { id: 'bon_livraison', label: 'Bon de livraison', pluriel: 'bons de livraison' },
  { id: 'bon_commande', label: 'Bon de commande', pluriel: 'bons de commande' },
];
const PRIORITE_TYPE = { facture: 3, bon_livraison: 2, bon_commande: 1 };
export const libelleType = (id) => TYPES_DOCUMENT.find(t => t.id === id)?.label || 'Facture';

// Seuil d'écart entre le dernier prix facturé et le prix de l'inventaire.
export const SEUIL_ECART_PRIX_PCT = 10;

// Devine le type depuis le nom du fichier. Les fournisseurs nomment leurs PDF
// « Lieferschein_123.pdf », « BL-4567.pdf », « Facture 2026-08.pdf »...
export function devinerTypeDocument(nomFichier) {
  const n = normalizeName(nomFichier);
  if (/(^| )(bl|bdl)( |\d|$)|livraison|lieferschein|delivery/.test(n)) return 'bon_livraison';
  if (/commande|bestellung|order|(^| )bc( |\d|$)/.test(n)) return 'bon_commande';
  return 'facture';
}

const cleFournisseur = (doc) => normalizeName(doc.fournisseurNom) || '(inconnu)';

// ── Période d'imputation ──
// Du lendemain de l'inventaire précédent du même périmètre jusqu'au jour de
// l'inventaire affiché. Sans inventaire précédent : depuis le premier du mois.
export function periodeInventaire(inv, previousInv) {
  const fin = inv?.date || '';
  if (previousInv?.date) return { debut: previousInv.date, debutInclus: false, fin };
  return { debut: fin ? `${fin.slice(0, 7)}-01` : '', debutInclus: true, fin };
}

export const dansPeriode = (date, periode) => {
  if (!date || !periode.fin) return false;
  if (date > periode.fin) return false;
  return periode.debutInclus ? date >= periode.debut : date > periode.debut;
};

// ── Quels documents comptent ? ──
// Une même livraison arrive souvent deux fois : sur le bon, puis sur la
// facture. Par fournisseur, on ne garde que le type le plus probant présent
// dans la période (facture > bon de livraison > bon de commande) ; les autres
// restent visibles, pour contrôle, avec la raison de leur mise à l'écart.
export function statutsDocuments(docs) {
  const meilleurType = new Map();
  docs.forEach(d => {
    if (d.exclu) return;
    const k = cleFournisseur(d);
    const p = PRIORITE_TYPE[d.typeDocument] || 3;
    if (!meilleurType.has(k) || p > meilleurType.get(k)) meilleurType.set(k, p);
  });
  const statuts = new Map();
  docs.forEach(d => {
    if (d.exclu) { statuts.set(d.id, { compte: false, raison: 'Exclu à la main' }); return; }
    const p = PRIORITE_TYPE[d.typeDocument] || 3;
    const meilleur = meilleurType.get(cleFournisseur(d));
    if (p < meilleur) {
      const garde = Object.keys(PRIORITE_TYPE).find(t => PRIORITE_TYPE[t] === meilleur);
      statuts.set(d.id, {
        compte: false,
        raison: `Contrôle : les ${TYPES_DOCUMENT.find(t => t.id === garde)?.pluriel || 'factures'} de ce fournisseur font foi`,
      });
      return;
    }
    statuts.set(d.id, { compte: true, raison: '' });
  });
  return statuts;
}

// Doublon à l'import : même fournisseur, même numéro, même type.
export function trouverDoublon(docs, candidat) {
  const num = String(candidat.numero || '').trim();
  if (!num) return null;
  const k = cleFournisseur(candidat);
  return docs.find(d => d.id !== candidat.id
    && String(d.numero || '').trim() === num
    && cleFournisseur(d) === k
    && d.typeDocument === candidat.typeDocument) || null;
}

// ── Conversion d'unités ──
// Le document donne une quantité totale en unité de base (g, ml, pcs), le
// nombre de colis et le conditionnement. L'inventaire compte dans sa propre
// unité. Renvoie null quand les deux ne se convertissent pas : on refuse de
// deviner (un carton n'a pas de poids connu).
const UNITES_PIECE = new Set(['pcs', 'pc', 'pce', 'piece', 'btl', 'bouteille', 'u', 'unite']);

const piecesParColis = (conditionnement) => {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]/i.exec(String(conditionnement || ''));
  return m ? Number(m[1].replace(',', '.')) : null;
};

export function quantiteEnUniteInventaire(ligneDoc, uniteInventaire) {
  const u = String(uniteInventaire || '').toLowerCase();
  const total = Number(ligneDoc.quantiteTotale);
  const base = ligneDoc.uniteTotale;
  const colis = Number(ligneDoc.quantite) > 0 ? Number(ligneDoc.quantite) : null;
  const totalOk = Number.isFinite(total) && total > 0;

  if (u === 'kg') return base === 'g' && totalOk ? total / 1000 : null;
  if (u === 'g') return base === 'g' && totalOk ? total : null;
  if (u === 'l') return base === 'ml' && totalOk ? total / 1000 : null;
  if (u === 'ml') return base === 'ml' && totalOk ? total : null;
  if (u === 'cl') return base === 'ml' && totalOk ? total / 10 : null;
  if (u === 'cs' || u === 'carton' || u === 'colis') return colis;
  if (UNITES_PIECE.has(u)) {
    if (base === 'pcs' && totalOk) return total;
    // « 6 x 75 cl », 2 cartons : 12 bouteilles.
    const parColis = piecesParColis(ligneDoc.conditionnement);
    if (parColis && colis) return parColis * colis;
    // Une bouteille, un sac, un seau vendus à l'unité.
    return colis;
  }
  return null;
}

// Nom de produit lisible depuis un libellé de facture :
// « PARMADORO PUREE TOMATES, 6 x 850 g » → « Parmadoro puree tomates ».
// Sert aussi au rapprochement : le conditionnement et le poids n'aident pas à
// reconnaître un produit, ils le brouillent.
export function nomDepuisLibelle(libelle, conditionnement) {
  let n = String(libelle || '');
  if (conditionnement) n = n.split(conditionnement).join(' ');
  n = n
    .replace(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|dl|l|pce|pcs|st)\b\.?/gi, ' ')
    .replace(/\b(?:env|ca|approx)\.?\s*(?=\d)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|cl|dl|l)\b\.?/gi, ' ')
    .replace(/\b(?:env|ca)\.?\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;/-]+$/, '')
    .trim();
  if (n && n === n.toUpperCase()) n = n.charAt(0) + n.slice(1).toLowerCase();
  return n || String(libelle || '').trim();
}

// Mots de facture qui qualifient sans désigner : « bio », « frais », « CH »...
// ignorés quand on cherche si un produit de l'inventaire est contenu dans le
// libellé, jamais retirés du nom affiché.
const MOTS_QUALIFICATIFS = new Set(['bio', 'frais', 'fraiche', 'env', 'ca', 'pce', 'pc', 'st', 'kg', 'sac', 'carton', 'ctn', 'bte', 'boite']);

// Produits de l'inventaire entièrement contenus dans le libellé : « Tomates
// cerises » dans « Tomates cerises bio 1 kg », « Purée de tomates » dans
// « PARMADORO PUREE TOMATES 6 x 850 g ». Le plus long l'emporte. Un produit
// d'un seul mot ne gagne que sur un libellé court : « Tomates » ne doit pas
// happer « Purée de tomates Parmadoro ».
function rapprochementParInclusion(libelle, conditionnement, ctx) {
  const mots = new Set(tokenize(nomDepuisLibelle(libelle, conditionnement)).filter(t => !MOTS_QUALIFICATIFS.has(t)));
  if (!mots.size) return null;
  let meilleurScore = 0;
  let meilleurs = [];
  ctx.tokensProduits.forEach(({ produit, tokens }) => {
    if (!tokens.length || !tokens.every(t => mots.has(t))) return;
    const score = tokens.length;
    if (score === 1 && mots.size > 2) return;
    if (score > meilleurScore) { meilleurScore = score; meilleurs = [produit]; }
    else if (score === meilleurScore) meilleurs.push(produit);
  });
  if (!meilleurs.length) return null;
  if (meilleurs.length === 1) return { produit: meilleurs[0], mode: 'auto', suggestions: [] };
  return { produit: null, mode: 'ambigu', suggestions: meilleurs.slice(0, 3).map(p => ({ produit: p, confidence: 80 })) };
}

// ── Rapprochement ligne de document → produit de l'inventaire ──
// `produits` : [{ cle, nom, unite, prixUnit }] - les produits de l'inventaire
// affiché et du précédent, dédupliqués par nom normalisé.
export function construireContexteRapprochement({ produits, documents, aliasCatalogue, catalogue }) {
  const parCle = new Map(produits.map(p => [p.cle, p]));
  // Décisions manuelles déjà prises sur d'autres documents : un libellé
  // rattaché une fois l'est pour toujours, chez tous les fournisseurs.
  const appris = new Map();
  (documents || []).forEach(d => (d.lignes || []).forEach(l => {
    if (l.lien === 'manuel' && l.produitNom) appris.set(normalizeName(l.libelle), normalizeName(l.produitNom));
    if (l.lien === 'ignore') appris.set(normalizeName(l.libelle), '__ignore__');
  }));
  // Alias du catalogue : libellé de facture → produit du catalogue → produit
  // de l'inventaire du même nom.
  const catalogueParId = new Map((catalogue || []).map(p => [p.id, p]));
  const aliasParLibelle = new Map();
  (aliasCatalogue || []).forEach(a => {
    const p = catalogueParId.get(a.produitId);
    if (p && a.libelleNorm) aliasParLibelle.set(a.libelleNorm, normalizeName(p.nom));
  });
  const candidats = produits.map(p => ({ id: p.cle, nom: p.nom }));
  const tokensProduits = produits.map(p => ({ produit: p, tokens: tokenize(p.nom).filter(t => !MOTS_QUALIFICATIFS.has(t)) }));
  return { parCle, appris, aliasParLibelle, candidats, tokensProduits, cache: new Map() };
}

// Renvoie { produit, mode, suggestions } :
//   mode 'manuel' | 'appris' | 'alias' | 'auto' | 'ambigu' | 'aucun' | 'ignore'
export function rapprocherLigneDoc(ligne, ctx) {
  if (ligne.lien === 'ignore') return { produit: null, mode: 'ignore', suggestions: [] };
  if ((ligne.issues || []).includes('ligne non produit')) return { produit: null, mode: 'ignore', suggestions: [] };
  if (ligne.lien === 'manuel' && ligne.produitNom) {
    const p = ctx.parCle.get(normalizeName(ligne.produitNom));
    if (p) return { produit: p, mode: 'manuel', suggestions: [] };
  }
  const norm = normalizeName(ligne.libelle);
  if (ctx.cache.has(norm)) return ctx.cache.get(norm);

  let res;
  const appris = ctx.appris.get(norm);
  if (appris === '__ignore__') res = { produit: null, mode: 'ignore', suggestions: [] };
  else if (appris && ctx.parCle.get(appris)) res = { produit: ctx.parCle.get(appris), mode: 'appris', suggestions: [] };
  else if (ctx.aliasParLibelle.get(norm) && ctx.parCle.get(ctx.aliasParLibelle.get(norm))) {
    res = { produit: ctx.parCle.get(ctx.aliasParLibelle.get(norm)), mode: 'alias', suggestions: [] };
  } else if ((res = rapprochementParInclusion(ligne.libelle, ligne.conditionnement, ctx))) {
    // res déjà posé : produit contenu dans le libellé.
  } else {
    const m = matchIngredient(nomDepuisLibelle(ligne.libelle, ligne.conditionnement), ctx.candidats);
    if (m.status === 'matched' && m.product) {
      res = { produit: ctx.parCle.get(m.product.id), mode: 'auto', suggestions: [] };
    } else if (m.status === 'ambiguous' && (m.suggestions || []).length) {
      res = {
        produit: null,
        mode: 'ambigu',
        suggestions: m.suggestions.slice(0, 3).map(s => ({ produit: ctx.parCle.get(s.product.id), confidence: s.confidence })).filter(s => s.produit),
      };
    } else {
      res = { produit: null, mode: 'aucun', suggestions: [] };
    }
  }
  ctx.cache.set(norm, res);
  return res;
}

// ── Calcul de la période ──
// `inv` : inventaire affiché (stock de fin) ; `previousInv` : stock de début.
// `documents` : documents du périmètre DANS la période.
export function calculerConsommation({ inv, previousInv, documents, statuts, ctx }) {
  const lignesFin = new Map();
  (inv?.lignes || []).forEach(l => lignesFin.set(normalizeName(l.produit), l));
  const lignesDebut = new Map();
  (previousInv?.lignes || []).forEach(l => lignesDebut.set(normalizeName(l.produit), l));

  const parProduit = new Map();
  const ligneProduit = (cle, nom, unite) => {
    if (!parProduit.has(cle)) {
      parProduit.set(cle, {
        cle, produit: nom, unite,
        debutQte: 0, debutVal: 0, achatsQte: 0, achatsVal: 0, achatsQteIncomplete: false,
        finQte: 0, finVal: 0, finCompte: true, prixFacture: null, prixFactureDate: null, prixInventaire: null,
        nbLignesAchat: 0,
      });
    }
    return parProduit.get(cle);
  };

  lignesDebut.forEach((l, cle) => {
    const r = ligneProduit(cle, l.produit, l.unite);
    r.debutQte = Number(l.stockReel) || 0;
    r.debutVal = Number(l.valeur) || 0;
  });
  lignesFin.forEach((l, cle) => {
    const r = ligneProduit(cle, l.produit, l.unite);
    r.unite = l.unite;
    r.finQte = Number(l.stockReel) || 0;
    r.finVal = Number(l.valeur) || 0;
    r.finCompte = estCompte(l);
    r.prixInventaire = Number(l.prixUnit) || 0;
  });

  let achatsTotal = 0;
  let achatsNonRattaches = 0;
  let lignesARattacher = 0;
  let lignesIgnorees = 0;
  let unitesIncompatibles = 0;

  (documents || []).forEach(doc => {
    if (!statuts.get(doc.id)?.compte) return;
    (doc.lignes || []).forEach((l, index) => {
      const montant = Number(l.montantLigne);
      const rap = rapprocherLigneDoc(l, ctx);
      if (rap.mode === 'ignore') { lignesIgnorees += 1; return; }
      if (!Number.isFinite(montant)) return;
      achatsTotal += montant;
      if (!rap.produit) {
        achatsNonRattaches += montant;
        lignesARattacher += 1;
        return;
      }
      const r = ligneProduit(rap.produit.cle, rap.produit.nom, rap.produit.unite);
      r.achatsVal += montant;
      r.nbLignesAchat += 1;
      const qte = quantiteEnUniteInventaire(l, r.unite);
      if (qte == null) {
        r.achatsQteIncomplete = true;
        unitesIncompatibles += 1;
        return;
      }
      r.achatsQte += qte;
      // Dernier prix facturé, dans l'unité de l'inventaire.
      const date = doc.dateDocument || '';
      if (qte > 0 && (!r.prixFactureDate || date >= r.prixFactureDate)) {
        r.prixFacture = montant / qte;
        r.prixFactureDate = date;
        r.prixFactureRef = { docId: doc.id, index };
      }
    });
  });

  const lignes = Array.from(parProduit.values()).map(r => {
    const consoVal = r.debutVal + r.achatsVal - r.finVal;
    const consoQte = r.achatsQteIncomplete ? null : r.debutQte + r.achatsQte - r.finQte;
    const ecartPrixPct = r.prixFacture != null && r.prixInventaire > 0
      ? ((r.prixFacture - r.prixInventaire) / r.prixInventaire) * 100
      : null;
    return {
      ...r,
      consoVal: +consoVal.toFixed(2),
      consoQte: consoQte == null ? null : +consoQte.toFixed(3),
      ecartPrixPct,
      // Consommer plus qu'on n'avait, c'est un achat manquant ou un comptage faux.
      incoherent: consoQte != null && consoQte < -0.001,
    };
  });

  const stockDebut = Number(previousInv?.valeurTotale) || 0;
  const stockFin = Number(inv?.valeurTotale) || 0;
  return {
    lignes,
    stockDebut,
    stockFin,
    achatsTotal: +achatsTotal.toFixed(2),
    achatsNonRattaches: +achatsNonRattaches.toFixed(2),
    consommation: +(stockDebut + achatsTotal - stockFin).toFixed(2),
    lignesARattacher,
    lignesIgnorees,
    unitesIncompatibles,
    sansDebut: !previousInv,
  };
}
