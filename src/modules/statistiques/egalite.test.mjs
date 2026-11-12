// node --test : égalité du module Statistiques avec les écrans d'origine (D4).
// Pour chaque mesure du catalogue : le total de la période est la valeur de la
// fonction d'origine sur la période entière, et pour un flux la somme des
// points fait ce total, au centime ou à l'unité. Seule exception, annoncée :
// les mesures de la Comptabilité bâties sur le hors TVA, arrondi par taux sur
// le total, dont l'écart est borné et dit sous le tableau.
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILLES, MESURES, mesuresVisibles } from './catalogueMesures.js';
import { composer, tableauDe } from './composition.js';
import { sommeFlux, trancheEntiere, tranchesDe } from './agregation.js';
import { J1, J2, jeuEssai } from '../caisse/rapports/jeuEssai.mjs';
import { rapportCaisse } from '../caisse/rapports/calculRapports.js';
import { computeReservationStats } from '../previsions/rapport/computeReservationStats.js';
import { depensesParMois, facturesDesDouzeMois, trierDocuments } from '../factures-achats/analysesAchats.js';
import { resumeVentes, ventesParJour } from '../comptabilite/ventesCompta.js';
import { synthese } from '../comptabilite/syntheseCompta.js';
import { periodeMois } from '../comptabilite/periodesCompta.js';

const famille = (id) => FAMILLES.find((f) => f.id === id);
const mesuresDe = (id) => MESURES.filter((m) => m.famille === id);
const AUJ = '2026-11-11';
// Mesures ajoutées en S2 aux familles de S1, testées dans egalite-s2.test.mjs.
const AJOUTS_S2 = ['achats.reglees', 'achats.delai', 'caisse.ventes', 'caisse.annulations_ttc', 'caisse.abandons', 'caisse.abandons_ttc',
  'reservations.demandes_recues', 'reservations.demandes_acceptees', 'reservations.demandes_annulees', 'reservations.anticipees',
  'reservations.delai_moyen', 'reservations.delai_median', 'reservations.groupes', 'reservations.placement', 'reservations.avec_fiche',
  'reservations.clients_uniques', 'reservations.clients_venus', 'reservations.clients_revenus', 'reservations.taux_retour',
  'reservations.passeport', 'reservations.taguees', 'comptabilite.tva_estimee', 'achats.prix_produit'];

// Points par tranche et point de la période entière, comme le fait l'écran.
function lire(id, donnees, debut, fin, pas) {
  const f = famille(id);
  const tranches = tranchesDe(debut, fin, pas);
  return {
    tranches,
    points: f.calculer(donnees, tranches, { aujourdhui: AUJ }),
    total: f.calculer(donnees, [trancheEntiere(debut, fin)], { aujourdhui: AUJ })[0],
  };
}

// Pour chaque mesure flux d'une famille : somme des points = total.
function verifierFlux(id, lu, { tolerance = {} } = {}) {
  mesuresDe(id).filter((m) => m.nature === 'flux').forEach((m) => {
    const valeurs = lu.points.map((p) => m.valeur(p));
    const total = m.valeur(lu.total);
    const somme = sommeFlux(valeurs);
    if (total == null) { assert.equal(somme, null, `${m.id} : total n/a, des points ont une valeur`); return; }
    const ecart = Math.abs(Math.round(((somme ?? 0) - total) * 100));
    assert.ok(ecart <= (tolerance[m.id] || 0), `${m.id} : somme ${somme}, total ${total}`);
  });
}

// ── Caisse ──
test('caisse : chaque flux fait le total du rapport, les taux sont ceux du rapport', () => {
  const donnees = jeuEssai();
  const lu = lire('caisse', donnees, J1, J2, 'jour');
  verifierFlux('caisse', lu);
  const r = rapportCaisse(donnees, { type: 'libre', debut: J1, fin: J2 });
  const v = (id) => MESURES.find((m) => m.id === id).valeur(lu.total);
  assert.equal(v('caisse.ca_ttc'), r.synthese.ttc);
  assert.equal(v('caisse.ca_ttc'), 474.88);
  assert.equal(v('caisse.ca_ht'), r.synthese.ht);
  assert.equal(v('caisse.tva'), r.synthese.tva);
  assert.equal(v('caisse.tickets'), r.synthese.tickets);
  assert.equal(v('caisse.annulations'), r.synthese.annulations);
  assert.equal(v('caisse.couverts'), r.synthese.couverts);
  assert.equal(v('caisse.ticket_moyen'), r.synthese.ticketMoyen);
  assert.equal(v('caisse.par_couvert'), r.synthese.parCouvert);
  assert.equal(v('caisse.net_encaisse'), r.moyens.net);
  assert.equal(v('caisse.pourboires'), r.moyens.pourboires);
  assert.equal(v('caisse.ecarts_caisse'), r.ecartsCaisse.lignes.length ? r.ecartsCaisse.total : null);
  assert.equal(v('caisse.plats_qte'), r.plats.qte);
  assert.equal(v('caisse.plats_ttc'), r.plats.ttc);
  assert.equal(v('caisse.remises'), r.journal.remises.montant);
  assert.equal(v('caisse.offerts'), r.journal.offerts.montant);
});

test('caisse : un jour sans ticket vaut n/a, jamais zéro', () => {
  const lu = lire('caisse', jeuEssai(), J1, '2026-11-05', 'jour');
  const ttc = MESURES.find((m) => m.id === 'caisse.ca_ttc');
  assert.deepEqual(lu.points.map((p) => ttc.valeur(p)), [319.48, 155.4, null]);
});

test('caisse : les ventilations d\'un flux refont son total', () => {
  const lu = lire('caisse', jeuEssai(), J1, J2, 'jour');
  const ttc = MESURES.find((m) => m.id === 'caisse.ca_ttc');
  ttc.ventilations.forEach((v) => {
    const somme = v.parts(lu.total).reduce((s, x) => s + Math.round((x.valeur || 0) * 100), 0) / 100;
    assert.equal(somme, 474.88, `ventilation ${v.id}`);
  });
  const net = MESURES.find((m) => m.id === 'caisse.net_encaisse');
  assert.equal(net.ventilations[0].parts(lu.total).reduce((s, x) => s + Math.round(x.valeur * 100), 0) / 100, net.valeur(lu.total));
});

// ── Réservations ──
let n = 0;
const resa = (date, service, couverts, statut, origine = 'equipe') => ({
  id: `r${++n}`, date_service: date, service, heure_arrivee: service === 'soir' ? '19:30' : '12:15', nb_couverts: couverts, statut, origine,
  client_id: null, est_groupe: false, passeport_gourmand: false, created_at: `${date}T08:00:00Z`, nom: 'x', reservation_tables: [], reservation_tags: [],
});
const lignesResa = [];
for (let j = 1; j <= 31; j += 1) {
  const d = `2026-10-${String(j).padStart(2, '0')}`;
  lignesResa.push(resa(d, 'midi', 2 + (j % 4), j % 7 === 0 ? 'no_show' : 'parti'));
  lignesResa.push(resa(d, 'soir', 3 + (j % 5), j % 9 === 0 ? 'annule' : 'arrive', j % 2 ? 'en_ligne' : 'passage'));
}
const parametres = { horaires: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [i, { midi: true, soir: true }])), capacite_service: 30 };

test('réservations : chaque flux fait le total du rapport, les taux sont ceux du rapport', () => {
  const donnees = { lignes: lignesResa, parametres, tables: [] };
  const periode = { debut: '2026-10-01', fin: '2026-10-31' };
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('reservations', lire('reservations', donnees, periode.debut, periode.fin, pas)));
  const lu = lire('reservations', donnees, periode.debut, periode.fin, 'semaine');
  const c = computeReservationStats({ lignes: lignesResa, periode, comparaison: periode, aujourdhui: AUJ, reference: AUJ, parametres }).chiffres;
  const v = (id) => MESURES.find((m) => m.id === id).valeur(lu.total);
  assert.equal(v('reservations.couverts'), c.couverts);
  assert.equal(v('reservations.tables'), c.tables);
  assert.equal(v('reservations.no_show'), c.noShowTables);
  assert.equal(v('reservations.taux_no_show'), c.tauxNoShow);
  assert.equal(v('reservations.taux_annulation'), c.tauxAnnulationTables);
  assert.equal(v('reservations.taux_non_pointe'), c.tauxNonPointe);
  assert.equal(v('reservations.occupation'), c.occupation);
  assert.equal(v('reservations.taille_moyenne'), c.tailleMoyenne);
  assert.equal(v('reservations.couverts_jour_ouverture'), c.couvertsParJourOuverture);
  const couverts = MESURES.find((m) => m.id === 'reservations.couverts');
  // Une ventilation sans catégorie (salle sans zones ni tables) n'a rien à refaire.
  couverts.ventilations.filter((vent) => vent.parts(lu.total).length).forEach((vent) => assert.ok(Math.abs(vent.parts(lu.total).reduce((s, x) => s + x.valeur, 0) - c.couverts) < 1e-9, vent.id));
});

// ── Achats ──
const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, tvaTaux: null, regleLe: null, ...o });
const docsAchats = [];
for (let i = 0; i < 90; i += 1) {
  const d = new Date(Date.UTC(2025, 11, 1 + i * 4)).toISOString().slice(0, 10);
  docsAchats.push(doc({ id: `d${i}`, fournisseurNom: `Fournisseur ${i % 6}`, dateDocument: d, totalHT: i % 11 === 0 ? null : 120.35 + i * 3.1, totalTTC: i % 11 === 0 && i % 2 ? 88.8 : null }));
}
docsAchats.push(doc({ id: 'bon', typeDocument: 'bon_livraison', dateDocument: '2026-10-05', totalHT: 500 }));

test('achats : la somme des pas fait le total, égal au total des Analyses sur douze mois', () => {
  const donnees = { docs: docsAchats, catalogue: [] };
  ['jour', 'semaine', 'mois'].forEach((pas) => verifierFlux('achats', lire('achats', donnees, '2025-12-01', '2026-11-30', pas)));
  const lu = lire('achats', donnees, '2025-12-01', '2026-11-30', 'mois');
  const { factures } = trierDocuments(docsAchats);
  const mois = depensesParMois(factures, AUJ);
  const depenses = MESURES.find((m) => m.id === 'achats.depenses');
  assert.equal(depenses.valeur(lu.total), mois.total.montant);
  assert.deepEqual(lu.points.map((p) => depenses.valeur(p)), mois.points.map((p) => p.valeur));
  assert.equal(MESURES.find((m) => m.id === 'achats.factures').valeur(lu.total), mois.total.n);
  assert.equal(facturesDesDouzeMois(factures, AUJ).length, lu.total.total);
  const parFournisseur = depenses.ventilations.find((v) => v.id === 'fournisseur').parts(lu.total);
  assert.equal(parFournisseur.reduce((s, x) => s + Math.round(x.valeur * 100), 0) / 100, mois.total.montant);
});

// ── Comptabilité ──
// syntheseDe de useCompta, refaite ici avec les mêmes fonctions pures (ventes
// du jour, pièces d'achat, charges fixes ; sans personnel).
function donneesCompta() {
  const manuel = [];
  for (let j = 1; j <= 31; j += 1) {
    const jour = `2026-10-${String(j).padStart(2, '0')}`;
    manuel.push({ jour, taux: 8.1, montantTtc: 2100.35 + j * 13.07, source: 'manuel' });
    if (j % 2) manuel.push({ jour, taux: 2.6, montantTtc: 180.4 + j, source: 'manuel' });
  }
  const parJourTout = ventesParJour({ manuel });
  const docs = docsAchats;
  const charges = [{ id: 'c1', libelle: 'Loyer', categorie: 'loyer', montant: 6500, tvaTaux: 0, periodicite: 'mensuelle', debut: '2026-01-01', fin: null }];
  const syntheseDe = (p) => {
    const parJour = parJourTout.filter((x) => x.jour >= p.debut && x.jour <= p.fin);
    const ventes = resumeVentes({ parJour, joursOuverts: new Set(), debut: p.debut, finEffective: p.fin, aujourdhui: AUJ });
    return synthese({ periode: p, aujourdhui: AUJ, ventes, docs, charges, inventaires: [] });
  };
  return { syntheseDe };
}

test('comptabilité : le total est celui de la synthèse du mois ; le TVA comprise et le coût matière s\'additionnent au centime', () => {
  const donnees = donneesCompta();
  const oct = periodeMois('2026-10-15');
  const lu = lire('comptabilite', donnees, oct.debut, oct.fin, 'jour');
  const mois = donnees.syntheseDe(oct);
  const v = (id) => MESURES.find((m) => m.id === id).valeur(lu.total);
  assert.equal(v('comptabilite.ca_ttc'), mois.ventes.ttc);
  assert.equal(v('comptabilite.ca_ht'), mois.ca);
  assert.equal(v('comptabilite.matiere'), mois.matiere.ht);
  assert.equal(v('comptabilite.marge_brute'), mois.margeBrute);
  assert.equal(v('comptabilite.charges'), mois.charges);
  assert.equal(v('comptabilite.resultat'), mois.resultat);
  assert.equal(v('comptabilite.matiere_pct'), mois.ratios.matierePct / 100);
  assert.equal(v('comptabilite.personnel'), null);
  // Hors TVA arrondi par taux sur le total : un demi-centime par jour et par
  // taux au plus ; les charges fixes ont leur propre arrondi au prorata.
  verifierFlux('comptabilite', lu, { tolerance: { 'comptabilite.ca_ht': 31, 'comptabilite.charges': 31, 'comptabilite.tva_estimee': 31 } });
  // Marge et résultat sont des soldes recalculés sur le pas, pas des flux : un
  // jour sans facture n'a pas de coût matière, donc pas de marge.
  const marge = MESURES.find((m) => m.id === 'comptabilite.marge_brute');
  assert.equal(marge.nature, 'taux');
  assert.equal(MESURES.find((m) => m.id === 'comptabilite.resultat').nature, 'taux');
  assert.ok(lu.points.some((p) => marge.valeur(p) == null));
});

test('comptabilité : l\'écart d\'arrondi du hors TVA est rendu au tableau, pas caché', () => {
  const donnees = donneesCompta();
  const oct = periodeMois('2026-10-15');
  const lu = lire('comptabilite', donnees, oct.debut, oct.fin, 'jour');
  const ht = MESURES.find((m) => m.id === 'comptabilite.ca_ht');
  const c = composer({
    graphique: { mesures: [ht.id], ventilation: '', type: '' }, mesures: [ht], tranches: lu.tranches,
    sources: { points: { comptabilite: lu.points }, totaux: { comptabilite: lu.total } }, etats: { comptabilite: 'ready' }, familles: FAMILLES,
  });
  const t = tableauDe(c, lu.tranches);
  assert.equal(t.periode.valeurs[0], donnees.syntheseDe(oct).ca);
  const ecart = Math.round((sommeFlux(lu.points.map((p) => ht.valeur(p))) - t.periode.valeurs[0]) * 100) / 100;
  assert.equal(c.series[0].arrondi, ecart);
  assert.equal(t.arrondis.length, ecart === 0 ? 0 : 1);
});

// ── Composition ──
test('composition : familles en lecture ou non lues ne rendent aucune valeur, jamais un zéro', () => {
  const ttc = MESURES.find((m) => m.id === 'caisse.ca_ttc');
  const couverts = MESURES.find((m) => m.id === 'reservations.couverts');
  const tranches = tranchesDe(J1, J2, 'jour');
  const lu = lire('caisse', jeuEssai(), J1, J2, 'jour');
  const c = composer({
    graphique: { mesures: [ttc.id, couverts.id], ventilation: '', type: '' }, mesures: [ttc, couverts], tranches,
    sources: { points: { caisse: lu.points }, totaux: { caisse: lu.total } }, etats: { caisse: 'ready', reservations: 'error' }, familles: FAMILLES,
  });
  assert.deepEqual(c.nonLues, ['reservations']);
  assert.deepEqual(c.series.map((s) => s.id), ['caisse.ca_ttc']);
  assert.equal(c.series[0].total, 474.88);
  assert.equal(c.series[0].arrondi, 0);
  const attente = composer({
    graphique: { mesures: [ttc.id], ventilation: '', type: '' }, mesures: [ttc], tranches,
    sources: { points: {}, totaux: {} }, etats: { caisse: 'loading' }, familles: FAMILLES,
  });
  assert.deepEqual(attente.enAttente, ['caisse']);
  assert.deepEqual(attente.series, []);
});

test('composition : deux unités sur deux axes, comparaison avec écart ou n/a', () => {
  const ttc = MESURES.find((m) => m.id === 'caisse.ca_ttc');
  const tickets = MESURES.find((m) => m.id === 'caisse.tickets');
  const lu = lire('caisse', jeuEssai(), J2, J2, 'jour');
  const avant = lire('caisse', jeuEssai(), J1, J1, 'jour');
  const vide = lire('caisse', jeuEssai(), '2026-10-01', '2026-10-01', 'jour');
  const base = { graphique: { mesures: [ttc.id, tickets.id], ventilation: '', type: '' }, mesures: [ttc, tickets], tranches: lu.tranches, etats: { caisse: 'ready' }, familles: FAMILLES };
  const c = composer({ ...base, tranchesComparaison: avant.tranches, sources: { points: { caisse: lu.points }, totaux: { caisse: lu.total }, pointsComparaison: { caisse: avant.points }, totauxComparaison: { caisse: avant.total } } });
  assert.deepEqual(c.unites, ['chf', 'nombre']);
  assert.deepEqual(c.series.map((s) => s.axe), ['g', 'd']);
  assert.equal(c.series[0].total, 155.4);
  assert.equal(c.series[0].totalComparaison, 319.48);
  assert.equal(c.series[0].ecartTotal.valeur, -164.08);
  assert.equal(c.type, 'barres');
  const sansBase = composer({ ...base, tranchesComparaison: vide.tranches, sources: { points: { caisse: lu.points }, totaux: { caisse: lu.total }, pointsComparaison: { caisse: vide.points }, totauxComparaison: { caisse: vide.total } } });
  assert.deepEqual(sansBase.series[0].ecartTotal, { valeur: null, pct: null });
});

test('composition : une ventilation rend au plus six séries, le reste regroupé sans rien perdre', () => {
  const depenses = MESURES.find((m) => m.id === 'achats.depenses');
  const docs = [];
  for (let i = 0; i < 40; i += 1) docs.push(doc({ id: `v${i}`, fournisseurNom: `Maison ${i % 9}`, dateDocument: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, totalHT: 100 + i }));
  const lu = lire('achats', { docs, catalogue: [] }, '2026-10-01', '2026-10-31', 'semaine');
  const c = composer({
    graphique: { mesures: [depenses.id], ventilation: 'fournisseur', type: '' }, mesures: [depenses], tranches: lu.tranches,
    sources: { points: { achats: lu.points }, totaux: { achats: lu.total } }, etats: { achats: 'ready' }, familles: FAMILLES,
  });
  assert.equal(c.type, 'empile');
  assert.equal(c.series.length, 6);
  assert.equal(c.series[5].libelle, 'Autres');
  assert.equal(c.series[5].nbRegroupes, 4);
  assert.equal(c.series.reduce((s, x) => s + Math.round(x.total * 100), 0) / 100, depenses.valeur(lu.total));
});

// ── Accès (D11) ──
test('accès : le niveau cuisine de la caisse ne voit que plats, services et leurs chiffres', () => {
  const cuisine = mesuresVisibles({ familles: ['caisse'], niveauCaisse: 'cuisine' }).map((m) => m.id);
  assert.deepEqual(cuisine, ['caisse.ca_ttc', 'caisse.tickets', 'caisse.annulations', 'caisse.couverts', 'caisse.plats_qte', 'caisse.plats_ttc', 'caisse.duree_table']);
  const ttc = mesuresVisibles({ familles: ['caisse'], niveauCaisse: 'cuisine' })[0];
  assert.deepEqual(ttc.ventilations.map((v) => v.id), ['service']);
  assert.equal(mesuresVisibles({ familles: ['caisse'], niveauCaisse: 'direction' }).length, mesuresDe('caisse').length);
  assert.deepEqual(mesuresVisibles({ familles: ['caisse'], niveauCaisse: null }), []);
});

test('accès : une famille fermée n\'apporte aucune mesure, les salaires restent à la direction', () => {
  assert.deepEqual(mesuresVisibles({ familles: [] }), []);
  const sansDirection = mesuresVisibles({ familles: ['comptabilite'], direction: false }).map((m) => m.id);
  assert.ok(!sansDirection.includes('comptabilite.personnel'));
  assert.ok(!sansDirection.includes('comptabilite.personnel_pct'));
  assert.ok(mesuresVisibles({ familles: ['comptabilite'], direction: true }).some((m) => m.id === 'comptabilite.personnel'));
  assert.equal(mesuresVisibles({ familles: ['reservations', 'achats'], droits: { factures_achat: true } }).length, mesuresDe('reservations').length + mesuresDe('achats').length);
  // Règlements des achats : seulement pour qui règle les factures.
  assert.ok(!mesuresVisibles({ familles: ['achats'] }).some((m) => m.reserve === 'factures_achat'));
});

test('catalogue : chaque mesure déclare ce qu\'il faut, les ids sont uniques', () => {
  assert.equal(new Set(MESURES.map((m) => m.id)).size, MESURES.length);
  MESURES.forEach((m) => {
    assert.ok(['chf', 'nombre', 'pct', 'min', 'h', 'jour', 'temp'].includes(m.unite), m.id);
    assert.ok(['flux', 'taux', 'stock', 'etat'].includes(m.nature), m.id);
    assert.equal(typeof m.valeur, 'function', m.id);
    assert.ok(m.libelle && m.phrase && m.phrase.length > 20, m.id);
    assert.ok(m.pas.length > 0, m.id);
  });
  // Les quatre familles de S1 ; celles de S2 sont comptées dans egalite-s2.test.mjs.
  assert.equal(MESURES.filter((m) => ['caisse', 'reservations', 'achats', 'comptabilite'].includes(m.famille) && !AJOUTS_S2.includes(m.id)).length, 36);
});
