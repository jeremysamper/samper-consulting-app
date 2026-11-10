// Jeu d'essai des rapports de la caisse v8, dans la forme exacte de ce que rend
// la RPC caisse_rapport_donnees. Les mêmes tickets sont joués en base par
// l'essai à blanc de la migration ; les totaux attendus sont calculés à la
// main (détail dans le rapport du lot et en tête de calculRapports.test.mjs).
//
// Deux jours d'exploitation, mardi 3 et mercredi 4 novembre 2026 (Zurich est
// à UTC+1), deux services, trois taux (8,1, 2,6 et 3,8 %), un ticket à
// emporter, un offert, une remise, deux moyens sur un même ticket, un arrondi
// aux 5 centimes, une annulation faite le lendemain de la vente, un abandon,
// une correction de réservation, et des tickets de test qui ne doivent
// compter nulle part.

export const J1 = '2026-11-03';
export const J2 = '2026-11-04';
export const ANNA = 'profil-anna';     // serveuse
export const BRUNO = 'profil-bruno';   // patron
export const CARLA = 'profil-carla';   // responsable de cuisine

const ticket = (id, numero, extra) => ({
  id, numero, annee: numero == null ? null : 2026, statut: 'encaisse', test: false, a_emporter: false,
  annule_jour: null, annule_at: null, annule_motif: null, annule_par: null,
  sur_table: true, origine: 'passage', compte_client: false, ...extra,
});
let nLigne = 0;
const ligne = (ticket_id, plat_id, libelle, categorie, quantite, prix_unitaire, taux_tva, extra = {}) => ({
  id: `l${++nLigne}`, ticket_id, plat_id, libelle, categorie, quantite, prix_unitaire, taux_tva,
  prix_origine: null, remise_montant: 0, remise_motif: null, remise_par: null, remise_at: null, offert: false, ...extra,
});
let nPaiement = 0;
const paiement = (ticket_id, moyen, montant, encaisse_par, extra = {}) => ({
  id: `p${++nPaiement}`, ticket_id, moyen, libelle: null, montant, arrondi: 0, pourboire: 0, rendu: 0, encaisse_par, ...extra,
});

export function jeuEssai({ avecTests = true, niveau = 'direction', sansClotureJ2 = false } = {}) {
  nLigne = 0;
  nPaiement = 0;
  const tickets = [
    // T1, mardi midi, table sur réservation, 2 couverts. Annulé le mercredi.
    ticket('t1', 1, {
      service: 'midi', jour: J1, couverts: 2, total_ttc: 93, origine: 'reservation', ouvert_par: ANNA,
      created_at: '2026-11-03T11:05:00Z', closed_at: '2026-11-03T12:10:00Z',
      statut: 'annule', annule_jour: J2, annule_at: '2026-11-04T10:20:00Z', annule_motif: 'Erreur de table, ticket refait', annule_par: BRUNO,
    }),
    // T2, mardi midi, vente directe à emporter.
    ticket('t2', 2, {
      service: 'midi', jour: J1, couverts: null, total_ttc: 97, a_emporter: true, sur_table: false, origine: 'direct', ouvert_par: ANNA,
      created_at: '2026-11-03T11:40:00Z', closed_at: '2026-11-03T11:42:00Z',
    }),
    // T3, mardi soir, table de passage, 3 couverts, un café offert, deux moyens.
    ticket('t3', 3, {
      service: 'soir', jour: J1, couverts: 3, total_ttc: 129.48, ouvert_par: ANNA,
      created_at: '2026-11-03T18:30:00Z', closed_at: '2026-11-03T20:15:00Z',
    }),
    // T4, mercredi midi, réservation d'un compte client, hébergement à 3,8 %.
    ticket('t4', 4, {
      service: 'midi', jour: J2, couverts: 2, total_ttc: 45, origine: 'reservation', compte_client: true, ouvert_par: CARLA,
      created_at: '2026-11-04T10:30:00Z', closed_at: '2026-11-04T11:20:00Z',
    }),
    // T5, mercredi soir, table de passage, 4 couverts, remise de 10 %.
    ticket('t5', 5, {
      service: 'soir', jour: J2, couverts: 4, total_ttc: 203.4, ouvert_par: ANNA,
      created_at: '2026-11-04T18:00:00Z', closed_at: '2026-11-04T19:30:00Z',
    }),
  ];
  const lignes = [
    ligne('t1', 'entrecote', 'Entrecôte', 'Plats', 2, 42, 8.1),
    ligne('t1', 'cafe', 'Café', 'Boissons', 2, 4.5, 8.1),
    ligne('t2', 'menu', 'Menu du jour', 'Plats', 1, 39, 2.6),
    ligne('t2', 'vin', 'Vin de la maison', 'Vins', 1, 58, 8.1),
    ligne('t3', 'menu', 'Menu du jour', 'Plats', 3, 39, 8.1),
    ligne('t3', 'tarte', 'Tarte du jour', 'Desserts', 1, 12.48, 8.1),
    ligne('t3', 'cafe', 'Café', 'Boissons', 1, 0, 8.1, {
      offert: true, prix_origine: 4.5, remise_motif: 'Geste commercial', remise_par: BRUNO, remise_at: '2026-11-03T20:10:00Z',
    }),
    ligne('t4', 'petitdej', 'Petit-déjeuner de l\'hôtel', 'Hébergement', 2, 18, 3.8),
    ligne('t4', 'cafe', 'Café', 'Boissons', 2, 4.5, 8.1),
    ligne('t5', 'entrecote', 'Entrecôte', 'Plats', 4, 37.8, 8.1, {
      prix_origine: 42, remise_montant: 16.8, remise_motif: 'Habitués', remise_par: CARLA, remise_at: '2026-11-04T19:25:00Z',
    }),
    ligne('t5', 'vin', 'Vin de la maison', 'Vins', 1, 52.2, 8.1, {
      prix_origine: 58, remise_montant: 5.8, remise_motif: 'Habitués', remise_par: CARLA, remise_at: '2026-11-04T19:25:00Z',
    }),
  ];
  const paiements = [
    paiement('t1', 'carte', 93, ANNA, { pourboire: 5 }),
    paiement('t2', 'especes', 97, ANNA, { rendu: 3 }),
    paiement('t3', 'carte', 100, CARLA),
    paiement('t3', 'especes', 29.48, CARLA, { arrondi: 0.02, rendu: 0.5 }),
    paiement('t4', 'autre', 45, CARLA, { libelle: 'TWINT' }),
    paiement('t5', 'carte', 203.4, ANNA),
  ];
  if (avecTests) {
    // Deux tickets de test encaissés : aucun numéro, aucun effet nulle part.
    tickets.push(
      ticket('tt1', null, { test: true, service: 'midi', jour: null, couverts: 2, total_ttc: null, ouvert_par: ANNA, created_at: '2026-11-03T11:00:00Z', closed_at: '2026-11-03T11:30:00Z' }),
      ticket('tt2', null, { test: true, service: 'soir', jour: null, couverts: 6, total_ttc: null, ouvert_par: ANNA, created_at: '2026-11-04T18:10:00Z', closed_at: '2026-11-04T18:20:00Z' }),
    );
    lignes.push(
      ligne('tt1', 'entrecote', 'Entrecôte', 'Plats', 1, 42, null),
      ligne('tt2', 'entrecote', 'Entrecôte', 'Plats', 1, 42, null),
    );
    paiements.push(
      paiement('tt1', 'especes', 42, ANNA, { libelle: 'TEST' }),
      paiement('tt2', 'carte', 42, ANNA, { libelle: 'TEST' }),
    );
  }

  // Clôtures : les totaux figés par la base (caisse_totaux_jour), réduits ici
  // à ce que les rapports lisent.
  const z1 = {
    id: 'z1', jour: J1, numero: 1, complement_de: null, cloture_at: '2026-11-03T22:30:00Z', cloture_par_nom: 'Bruno Patron',
    fond_caisse: 200, especes_comptees: 326.5, ecart: 0, motif: null, empreinte: 'a'.repeat(64),
    totaux: {
      jour: J1,
      ventes: { tickets: 3, couverts: 5, ttc: 319.48, tva: 22.01, ht: 297.47, par_taux: [{ taux: 8.1, ttc: 280.48, tva: 21.02, ht: 259.46 }, { taux: 2.6, ttc: 39, tva: 0.99, ht: 38.01 }] },
      annulations: { tickets: 0, numeros: [], ttc: 0, tva: 0, ht: 0, par_taux: [], moyens: [] },
      net: { ttc: 319.48, tva: 22.01, ht: 297.47, par_taux: [{ taux: 8.1, ttc: 280.48, tva: 21.02, ht: 259.46 }, { taux: 2.6, ttc: 39, tva: 0.99, ht: 38.01 }] },
      moyens: [
        { moyen: 'carte', libelle: '', nombre: 2, montant: 193 },
        { moyen: 'especes', libelle: '', nombre: 2, montant: 126.5 },
      ],
      pourboires: { total: 5, par_moyen: [{ moyen: 'carte', libelle: '', montant: 5 }] },
      arrondis: 0.02,
      especes: { ventes: 126.5, annulees: 0, attendues: 126.5 },
    },
  };
  const z2 = {
    id: 'z2', jour: J2, numero: 2, complement_de: null, cloture_at: '2026-11-04T22:40:00Z', cloture_par_nom: 'Bruno Patron',
    fond_caisse: 200, especes_comptees: 199.5, ecart: -0.5, motif: null, empreinte: 'b'.repeat(64),
    totaux: {
      jour: J2,
      ventes: { tickets: 2, couverts: 6, ttc: 248.4, tva: 17.23, ht: 231.17, par_taux: [{ taux: 8.1, ttc: 212.4, tva: 15.91, ht: 196.49 }, { taux: 3.8, ttc: 36, tva: 1.32, ht: 34.68 }] },
      annulations: {
        tickets: 1, numeros: ['2026-000001'], ttc: 93, tva: 6.97, ht: 86.03,
        par_taux: [{ taux: 8.1, ttc: 93, tva: 6.97, ht: 86.03 }], moyens: [{ moyen: 'carte', libelle: '', nombre: 1, montant: 93 }],
      },
      net: { ttc: 155.4, tva: 10.26, ht: 145.14, par_taux: [{ taux: 8.1, ttc: 119.4, tva: 8.94, ht: 110.46 }, { taux: 3.8, ttc: 36, tva: 1.32, ht: 34.68 }] },
      moyens: [
        { moyen: 'autre', libelle: 'TWINT', nombre: 1, montant: 45 },
        { moyen: 'carte', libelle: '', nombre: 1, montant: 203.4 },
      ],
      pourboires: { total: 0, par_moyen: [] },
      arrondis: 0,
      especes: { ventes: 0, annulees: 0, attendues: 0 },
    },
  };
  // Clôture complémentaire du mardi (recomptage) : mêmes ventes, autre
  // comptage. Elle ne doit jamais s'additionner aux ventes.
  const z3 = {
    ...z1, id: 'z3', numero: 3, complement_de: 'z1', cloture_at: '2026-11-05T08:00:00Z',
    especes_comptees: 326.4, ecart: -0.1, motif: 'Recomptage du matin', empreinte: 'c'.repeat(64),
  };
  const clotures = sansClotureJ2 ? [z1, z3] : [z1, z2, z3];
  const ventesJour = [
    { jour: J1, taux: 8.1, montant_ttc: 280.48, source: 'caisse' },
    { jour: J1, taux: 2.6, montant_ttc: 39, source: 'caisse' },
    ...(sansClotureJ2 ? [] : [
      { jour: J2, taux: 8.1, montant_ttc: 119.4, source: 'caisse' },
      { jour: J2, taux: 3.8, montant_ttc: 36, source: 'caisse' },
    ]),
  ];

  const direction = {
    paiements,
    ventes_jour: ventesJour,
    personnes: { [ANNA]: 'Anna Serveuse', [BRUNO]: 'Bruno Patron', [CARLA]: 'Carla Cheffe' },
    abandons: [{ id: 'ab1', jour: J1, closed_at: '2026-11-03T19:00:00Z', ouvert_par: ANNA, montant: 9 }],
    corrections: [{
      id: 'c1', jour: J1, created_at: '2026-11-03T11:10:00Z', acteur_nom: 'Anna Serveuse',
      libelle: 'Réservation du 03.11.2026 à 12:00', colonnes: ['nb_couverts'],
    }],
    tests: avecTests ? [
      { id: 'j1', jour: J1, created_at: '2026-11-03T10:55:00Z', action: 'entree', auteur_nom: 'Bruno Patron', poste: 'iPad bar', nombre: 0, montant: 0 },
      { id: 'j2', jour: J2, created_at: '2026-11-04T18:25:00Z', action: 'sortie', auteur_nom: 'Bruno Patron', poste: 'iPad bar', nombre: 0, montant: 0 },
      { id: 'j3', jour: J2, created_at: '2026-11-04T18:26:00Z', action: 'purge', auteur_nom: 'Bruno Patron', poste: 'iPad bar', nombre: 2, montant: 84 },
    ] : [],
  };
  // Ce que la base ne rend pas au responsable de cuisine : ni paiements, ni
  // contenu des clôtures, ni personnes, ni journal ; et les colonnes d'auteur
  // et de motif sont vides.
  const cuisine = {
    paiements: [], ventes_jour: [], personnes: {}, abandons: [], corrections: [], tests: [],
  };
  const estDirection = niveau === 'direction';
  return {
    niveau,
    etablissement_id: 'etab-essai',
    jour_courant: '2026-11-10',
    premier_jour: J1,
    tickets: estDirection ? tickets : tickets.map((t) => ({ ...t, annule_motif: null, annule_par: null, ouvert_par: null })),
    lignes: estDirection ? lignes : lignes.map((l) => ({ ...l, remise_motif: null, remise_par: null })),
    clotures: estDirection ? clotures : clotures.map((c) => ({ id: c.id, jour: c.jour, numero: c.numero, complement_de: c.complement_de, cloture_at: c.cloture_at })),
    ...(estDirection ? direction : cuisine),
  };
}
