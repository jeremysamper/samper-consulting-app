// ─────────────────────────────────────────────────────────────────────────────
// État d'inventaire : les données de l'export Excel / PDF, sans mise en page.
//
// Reproduit la méthode du classeur remis aux établissements (Le Rucher, août
// 2026), colonne pour colonne :
//
//   Qté reçue       = stock de l'inventaire précédent (report) + achats de la
//                     période, ramenés dans l'unité de comptage
//   Valeur d'achat  = valeur du report + montant HT des achats
//   Stock actuel    = relevé de l'inventaire affiché
//   Sortie          = Qté reçue - Stock actuel
//   PU moyen        = Valeur d'achat / Qté reçue (prix moyen pondéré)
//   Valeur stock    = PU moyen x Stock actuel
//
// Un produit compté sans report ni facture est valorisé au prix de
// l'inventaire et signalé « Sans pièce », comme dans le classeur.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeName } from '../../services/recipeProductMatching.js';
import { estCompte, cleProduit } from './inventaireLignes.js';
import { perimetreOf } from '../../utils/inventairePerimetres.js';
import {
  libelleType, periodeInventaire, dansPeriode, statutsDocuments,
  construireContexteRapprochement, rapprocherLigneDoc, quantiteEnUniteInventaire,
} from './achatsLogic.js';
import { zoneOf, ordreZones, SANS_ZONE } from './zones.js';
import { estMaison, sourceMaison } from './produitsMaison.js';

const jjmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '');
export const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');
const arrondi = (n, d = 3) => (Number.isFinite(n) ? +n.toFixed(d) : 0);

export function construireEtatInventaire({
  inv, previousInv, documents, catalogue, aliasCatalogue, etablissementNom,
}) {
  const perimetre = perimetreOf(inv);
  const periode = periodeInventaire(inv, previousInv);
  const docsPeriode = (documents || []).filter(d => ((d.perimetre || '').trim() || 'Général') === perimetre
    && dansPeriode(d.dateDocument, periode));
  const statuts = statutsDocuments(docsPeriode);
  const docsRetenus = docsPeriode.filter(d => statuts.get(d.id)?.compte);

  // Mêmes produits de référence que l'onglet Achats : inventaire affiché et
  // précédent, pour que l'export dise exactement ce que l'écran montre.
  const produits = new Map();
  [...(inv?.lignes || []), ...(previousInv?.lignes || [])].forEach(l => {
    const cle = cleProduit(l.produit);
    if (cle && !estMaison(l) && !produits.has(cle)) produits.set(cle, { cle, nom: l.produit, unite: l.unite, prixUnit: Number(l.prixUnit) || 0 });
  });
  const ctx = construireContexteRapprochement({
    produits: Array.from(produits.values()), documents, aliasCatalogue, catalogue,
  });

  // Achats par produit : quantité, montant et pièces justificatives.
  const achats = new Map();
  docsRetenus.forEach(doc => (doc.lignes || []).forEach(l => {
    const rap = rapprocherLigneDoc(l, ctx);
    if (!rap.produit) return;
    const montant = Number(l.montantLigne);
    if (!Number.isFinite(montant)) return;
    if (!achats.has(rap.produit.cle)) achats.set(rap.produit.cle, { lignes: [] });
    achats.get(rap.produit.cle).lignes.push({ doc, ligne: l, montant });
  }));

  const precedentes = new Map((previousInv?.lignes || []).map(l => [cleProduit(l.produit), l]));
  const catalogueParCle = new Map((catalogue || []).filter(p => p?.nom).map(p => [cleProduit(p.nom), p]));
  const dateFin = jjmm(inv?.date);

  const lignes = (inv?.lignes || []).map(l => {
    const cle = cleProduit(l.produit);
    const prec = precedentes.get(cle);
    const debutQte = prec && estCompte(prec) ? Number(prec.stockReel) || 0 : 0;
    const debutVal = prec && estCompte(prec) ? (Number(prec.valeur) || debutQte * (Number(prec.prixUnit) || 0)) : 0;

    let qteAchats = 0;
    let valAchats = 0;
    const pieces = [];
    const releves = [];
    let nonConverties = 0;
    let conditionnement = '';
    let dateCond = '';
    (achats.get(cle)?.lignes || []).forEach(({ doc, ligne, montant }) => {
      const q = quantiteEnUniteInventaire(ligne, l.unite);
      // Sans quantité convertible, le montant fausserait le prix moyen : la
      // ligne est citée dans les sources mais ne compte pas dans les totaux.
      if (q == null) { nonConverties += 1; }
      else { qteAchats += q; valAchats += montant; }
      const piece = `${doc.fournisseurNom || 'Fournisseur non lu'} : ${libelleType(doc.typeDocument)}${doc.numero ? ' ' + doc.numero : ''}`;
      if (!pieces.includes(piece)) pieces.push(piece);
      if (normalizeName(ligne.libelle) !== normalizeName(l.produit) && !releves.includes(ligne.libelle)) releves.push(ligne.libelle);
      if (ligne.conditionnement && String(doc.dateDocument || '') >= dateCond) {
        conditionnement = ligne.conditionnement;
        dateCond = String(doc.dateDocument || '');
      }
    });

    const compte = estCompte(l);
    const stockActuel = compte ? Number(l.stockReel) || 0 : 0;
    let qteRecue = debutQte + qteAchats;
    let valeurAchat = debutVal + valAchats;
    const sources = [];
    if (debutQte > 0) sources.push(`Report ${jjmm(previousInv.date)}`);
    sources.push(...pieces);
    if (releves.length) sources.push(releves.map(r => `Relevé « ${r} »`).join(', '));

    let sansPiece = false;
    const maison = estMaison(l);
    if (maison) {
      // Produit maison : pas de facture d'entrée, la production de la période
      // n'est tracée nulle part. Comme dans le classeur, ce qui dépasse le
      // report est tenu pour produit et valorisé au coût matière de la fiche.
      const produit = Math.max(0, stockActuel - qteRecue);
      if (produit > 0) qteRecue += produit;
      // Toute la quantité au coût matière actuel de la fiche : le report a pu
      // être compté avant la liaison, à un prix nul ou périmé.
      valeurAchat = qteRecue * (Number(l.prixUnit) || 0);
      sources.push(sourceMaison(l));
    } else if (qteRecue <= 0 && stockActuel > 0) {
      // Ni report ni facture : valorisé au prix de l'inventaire, à justifier.
      sansPiece = true;
      qteRecue = stockActuel;
      valeurAchat = stockActuel * (Number(l.prixUnit) || 0);
      sources.push(`Aucune pièce : prix de l'inventaire ${(Number(l.prixUnit) || 0).toFixed(2)} CHF/${l.unite}, à remplacer par la facture`);
    }
    if (nonConverties) sources.push(`${nonConverties} ligne${nonConverties > 1 ? 's' : ''} d'achat en unité non convertible, hors calcul`);
    if (!compte) sources.push(`Non compté au ${dateFin} : stock compté à 0`);
    else if (!maison && qteRecue - stockActuel < -0.0005) sources.push('Stock supérieur aux entrées : pièce manquante ou comptage à revoir');

    if (!conditionnement && !maison) conditionnement = sansPiece ? 'Sans pièce' : (catalogueParCle.get(cle)?.conditionnement || '');

    const sortie = arrondi(qteRecue - stockActuel);
    qteRecue = arrondi(qteRecue);
    valeurAchat = arrondi(valeurAchat, 2);
    const puMoyen = qteRecue ? valeurAchat / qteRecue : null;
    const valeurStock = qteRecue ? puMoyen * arrondi(qteRecue - sortie) : null;

    return {
      zone: zoneOf(l),
      categorie: l.categorie || 'Autres',
      produit: l.produit,
      conditionnement,
      qteRecue,
      unite: l.unite,
      sortie,
      stockActuel: arrondi(qteRecue - sortie),
      valeurAchat,
      puMoyen,
      valeurStock,
      sources: sources.join(', '),
    };
  });

  // Ordre du classeur : zone (dans l'ordre du tour), catégorie, produit.
  const rangZone = new Map(ordreZones(lignes.map(x => x.zone)).map((z, i) => [z, i]));
  lignes.sort((a, b) => (rangZone.get(a.zone) ?? 999) - (rangZone.get(b.zone) ?? 999)
    || a.categorie.localeCompare(b.categorie, 'fr')
    || a.produit.localeCompare(b.produit, 'fr'));

  const zones = ordreZones(lignes.map(x => x.zone));
  if (lignes.some(x => !x.zone)) zones.push(SANS_ZONE);
  const categories = Array.from(new Set(lignes.map(x => x.categorie))).sort((a, b) => a.localeCompare(b, 'fr'));

  // Documents intégrés : report, relevé, puis les pièces retenues par fournisseur.
  const docsIntegres = [];
  if (previousInv) docsIntegres.push({ document: `Inventaire au ${dateCH(previousInv.date)} (report)`, date: dateCH(previousInv.date), fournisseur: etablissementNom });
  docsIntegres.push({ document: `Relevé d'inventaire du ${dateCH(inv?.date)}`, date: dateCH(inv?.date), fournisseur: etablissementNom });
  docsRetenus
    .slice()
    .sort((a, b) => (a.fournisseurNom || '').localeCompare(b.fournisseurNom || '', 'fr') || String(a.dateDocument || '').localeCompare(String(b.dateDocument || '')))
    .forEach(d => docsIntegres.push({
      document: `${libelleType(d.typeDocument)}${d.numero ? ' ' + d.numero : ''}`,
      date: dateCH(d.dateDocument),
      fournisseur: d.fournisseurNom || '',
    }));

  const nomPerimetre = perimetre.toLocaleUpperCase('fr');
  return {
    perimetre,
    etablissementNom,
    date: inv?.date,
    titre: `INVENTAIRE ${nomPerimetre} : ${etablissementNom}, état au ${dateCH(inv?.date)}`,
    titreSynthese: `SYNTHÈSE ${nomPerimetre}, état au ${dateCH(inv?.date)}`,
    lignes,
    zones,
    categories,
    documents: docsIntegres,
    totaux: {
      references: lignes.length,
      valeurAchat: arrondi(lignes.reduce((s, x) => s + x.valeurAchat, 0), 2),
      valeurStock: arrondi(lignes.reduce((s, x) => s + (x.valeurStock || 0), 0), 2),
    },
  };
}

// Agrégats de la synthèse, calculés ici pour les valeurs en cache du classeur
// et pour le PDF. Le classeur recalcule les mêmes par formules.
export function agregerPar(etat, champ, valeur) {
  const lignes = etat.lignes.filter(x => (champ === 'zone' && valeur === SANS_ZONE ? !x.zone : x[champ] === valeur));
  return {
    references: lignes.length,
    valeurAchat: arrondi(lignes.reduce((s, x) => s + x.valeurAchat, 0), 2),
    valeurStock: arrondi(lignes.reduce((s, x) => s + (x.valeurStock || 0), 0), 2),
  };
}
