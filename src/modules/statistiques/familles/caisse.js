// Famille Caisse du catalogue des Statistiques : aucune règle de calcul ici,
// chaque mesure lit un chiffre rendu par serieRapports (calculRapports.js),
// la fonction des Rapports de la caisse. Sans React ni service : importable
// par les tests.
//
// Niveau : la base rend « direction » (tout) ou « cuisine » (plats vendus et
// services), comme pour les onglets des Rapports. Une mesure ou une
// ventilation marquée `niveau: 'direction'` n'existe pas pour le niveau
// cuisine. Une tranche sans aucun ticket vaut « n/a », jamais 0 : l'écran
// d'origine ne liste pas ce jour.

import { serieRapports } from '../../caisse/rapports/calculRapports.js';

const sauf = (p, f) => (p.vide ? null : f(p));
const partsTaux = (p, cle) => (p.synthese.parTaux || []).map((t) => ({ cle: `t${t.taux}`, libelle: `${String(t.taux).replace('.', ',')} %`, brut: true, valeur: t[cle] }));

const parService = (cle) => ({
  id: 'service', libelle: 'Par service',
  parts: (p) => [
    { cle: 'midi', libelle: 'Midi', valeur: p.synthese.midi[cle] },
    { cle: 'soir', libelle: 'Soir', valeur: p.synthese.soir[cle] },
  ],
});

export const familleCaisse = {
  id: 'caisse',
  libelle: 'Caisse',
  journee: 'le jour d\'exploitation de la caisse',
  calculer(donnees, tranches) {
    if (!tranches.length) return [];
    const periode = { type: 'libre', debut: tranches[0].debut, fin: tranches[tranches.length - 1].fin };
    return serieRapports(donnees, periode, tranches);
  },
  mesures: [
    {
      id: 'caisse.ca_ttc', libelle: 'Chiffre d\'affaires TVA comprise', unite: 'chf', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.synthese.ttc),
      ventilations: [
        parService('ttc'),
        { id: 'lieu', libelle: 'Sur place ou à emporter', niveau: 'direction', parts: (p) => [
          { cle: 'place', libelle: 'Sur place', valeur: p.synthese.surPlace.ttc },
          { cle: 'emporter', libelle: 'À emporter', valeur: p.synthese.emporter.ttc },
        ] },
        { id: 'taux', libelle: 'Par taux de TVA', niveau: 'direction', parts: (p) => partsTaux(p, 'ttc') },
        { id: 'origine', libelle: 'Par origine du ticket', niveau: 'direction', parts: (p) => (p.clients ? [
          { cle: 'reservation', libelle: 'Réservation', valeur: p.clients.reservation.ttc },
          { cle: 'passage', libelle: 'Passage', valeur: p.clients.passage.ttc },
          { cle: 'direct', libelle: 'Vente directe', valeur: p.clients.direct.ttc },
        ] : []) },
      ],
      phrase: 'Ventes encaissées moins annulations, TVA comprise, au jour d\'exploitation. Les tickets de test ne comptent pas.',
    },
    {
      id: 'caisse.ca_ht', libelle: 'Chiffre d\'affaires hors TVA', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => sauf(p, (x) => x.synthese.ht),
      phrase: 'Le chiffre d\'affaires de la caisse moins la TVA de chaque ticket.',
    },
    {
      id: 'caisse.tva', libelle: 'TVA de la caisse', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => sauf(p, (x) => x.synthese.tva),
      ventilations: [{ id: 'taux', libelle: 'Par taux de TVA', parts: (p) => partsTaux(p, 'tva') }],
      phrase: 'Somme de la TVA de chaque ticket, arrondie au centime par ticket et par taux.',
    },
    {
      id: 'caisse.tickets', libelle: 'Tickets encaissés', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.synthese.tickets),
      phrase: 'Nombre de tickets numérotés encaissés ; un ticket annulé depuis reste compté le jour de sa vente.',
    },
    {
      id: 'caisse.annulations', libelle: 'Tickets annulés', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.synthese.annulations),
      phrase: 'Nombre d\'annulations, comptées le jour où elles sont faites.',
    },
    {
      id: 'caisse.couverts', libelle: 'Couverts de la caisse', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.synthese.couverts),
      phrase: 'Couverts saisis sur les tickets encaissés, moins ceux des tickets annulés.',
    },
    {
      id: 'caisse.ticket_moyen', libelle: 'Ticket moyen', unite: 'chf', nature: 'taux', niveau: 'direction',
      valeur: (p) => p.synthese.ticketMoyen,
      phrase: 'Chiffre d\'affaires TVA comprise divisé par les tickets, annulations déduites ; recalculé sur chaque pas.',
    },
    {
      id: 'caisse.par_couvert', libelle: 'Chiffre par couvert', unite: 'chf', nature: 'taux', niveau: 'direction',
      valeur: (p) => p.synthese.parCouvert,
      phrase: 'Chiffre d\'affaires TVA comprise divisé par les couverts ; recalculé sur chaque pas.',
    },
    {
      id: 'caisse.net_encaisse', libelle: 'Net encaissé', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => (p.vide || !p.moyens ? null : p.moyens.net),
      ventilations: [{ id: 'moyen', libelle: 'Par moyen de paiement', parts: (p) => (p.moyens ? p.moyens.lignes.map((l) => ({ cle: `${l.moyen}|${l.libelle}|${l.mode || ''}`, libelle: l.nom, valeur: l.net })) : []) }],
      phrase: 'Ce que la maison garde par moyen de paiement : montants et arrondis des espèces, annulations déduites, pourboires à part.',
    },
    {
      id: 'caisse.pourboires', libelle: 'Pourboires', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => (p.vide || !p.moyens ? null : p.moyens.pourboires),
      phrase: 'Pourboires saisis à l\'encaissement, hors chiffre d\'affaires.',
    },
    {
      id: 'caisse.ecarts_caisse', libelle: 'Écarts de caisse', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => (p.ecartsCaisse && p.ecartsCaisse.lignes.length ? p.ecartsCaisse.total : null),
      phrase: 'Écart entre les espèces comptées et les espèces attendues, à la dernière clôture de chaque jour.',
    },
    {
      id: 'caisse.plats_qte', libelle: 'Plats vendus', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.plats.qte),
      ventilations: [{ id: 'categorie', libelle: 'Par catégorie de caisse', parts: (p) => p.plats.categories.map((c) => ({ cle: c.nom, libelle: c.nom, donnee: true, valeur: c.qte })) }],
      phrase: 'Quantités vendues, annulations déduites, offerts compris.',
    },
    {
      id: 'caisse.plats_ttc', libelle: 'Chiffre des plats', unite: 'chf', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.plats.ttc),
      ventilations: [{ id: 'categorie', libelle: 'Par catégorie de caisse', parts: (p) => p.plats.categories.map((c) => ({ cle: c.nom, libelle: c.nom, donnee: true, valeur: c.ttc })) }],
      phrase: 'Somme des lignes vendues, TVA comprise : elle fait le chiffre d\'affaires de la période.',
    },
    {
      id: 'caisse.remises', libelle: 'Remises accordées', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => (p.vide || !p.ecarts ? null : p.ecarts.remises.montant),
      phrase: 'Montant des remises accordées sur les tickets encaissés.',
    },
    {
      id: 'caisse.offerts', libelle: 'Offerts', unite: 'chf', nature: 'flux', niveau: 'direction',
      valeur: (p) => (p.vide || !p.ecarts ? null : p.ecarts.offerts.montant),
      phrase: 'Valeur au prix d\'origine des lignes offertes.',
    },
    {
      id: 'caisse.duree_table', libelle: 'Durée moyenne d\'une table', unite: 'min', nature: 'taux',
      valeur: (p) => p.dureeMoyenneMin,
      phrase: 'De l\'ouverture du ticket à son encaissement, sur les ventes servies à table ; recalculée sur chaque pas.',
    },
  ],
};
