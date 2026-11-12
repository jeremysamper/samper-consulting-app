// Famille Achats du catalogue des Statistiques : chaque mesure lit un chiffre
// rendu par depensesParTranche (analysesAchats.js), par la règle des Analyses
// des dépenses (facture non exclue ; total hors TVA, à défaut TVA comprise, à
// défaut somme des lignes lues ; date de facture). Sans React ni service.
//
// Une tranche sans facture chiffrée vaut « n/a », jamais 0.

import { depensesParTranche, parFournisseur, parRayon, trierDocuments } from '../../factures-achats/analysesAchats.js';
import { reglementsParTranche } from '../../inventaire/facturesLogic.js';

const NON_REPARTI = 'Factures sans ligne lue';

export const familleAchats = {
  id: 'achats',
  libelle: 'Achats',
  journee: 'la date de la facture',
  calculer(donnees, tranches) {
    const { factures } = trierDocuments(donnees.docs);
    const reglements = reglementsParTranche(donnees.docs, tranches);
    return depensesParTranche(factures, tranches).map((p, i) => ({ ...p, catalogue: donnees.catalogue || [], reglements: reglements[i] }));
  },
  mesures: [
    {
      id: 'achats.depenses', libelle: 'Dépenses d\'achat', unite: 'chf', nature: 'flux',
      valeur: (p) => p.valeur,
      ventilations: [
        { id: 'fournisseur', libelle: 'Par fournisseur', parts: (p) => parFournisseur(p.factures).filter((f) => f.montant != null).map((f) => ({ cle: f.cle, libelle: f.label, donnee: true, valeur: f.montant })) },
        { id: 'rayon', libelle: 'Par rayon', parts: (p) => {
          const r = parRayon(p.factures, p.catalogue);
          const parts = r.rayons.map((x) => ({ cle: x.cle, libelle: x.label, valeur: x.montant }));
          if (r.montantNonReparti != null) parts.push({ cle: '__non_reparti__', libelle: NON_REPARTI, valeur: r.montantNonReparti });
          return parts;
        } },
      ],
      phrase: 'Montant des factures d\'achat non exclues : total hors TVA, à défaut TVA comprise, à défaut somme des lignes lues. Jour de la date de facture.',
    },
    {
      id: 'achats.factures', libelle: 'Factures chiffrées', unite: 'nombre', nature: 'flux',
      valeur: (p) => (p.total ? p.n : null),
      phrase: 'Nombre de factures d\'achat qui portent un montant ; les bons de livraison et de commande ne comptent pas.',
    },
    {
      id: 'achats.reglees', libelle: 'Factures réglées', unite: 'chf', nature: 'flux', reserve: 'factures_achat',
      valeur: (p) => (p.reglements?.n ? p.reglements.montant : null),
      phrase: 'Montant TTC des factures réglées, au jour du règlement ; une facture sans TTC n\'entre pas dans la somme. Réservé à qui règle les factures.',
    },
    {
      id: 'achats.delai', libelle: 'Délai de paiement', unite: 'jour', nature: 'taux', reserve: 'factures_achat',
      valeur: (p) => (p.reglements?.nbDelais ? p.reglements.joursTotal / p.reglements.nbDelais : null),
      phrase: 'Jours entre la date de la facture et son règlement, en moyenne sur les factures réglées dans le pas ; recalculé sur chaque pas.',
    },
  ],
};
