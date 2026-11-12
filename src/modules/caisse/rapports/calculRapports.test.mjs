// Jeux d'essai des rapports de la caisse v8 (brief du 10.11.2026, rapports et
// sortie comptable). Les totaux attendus sont calculés à la main, ci-dessous
// et dans le rapport du lot ; les mêmes tickets sont joués en base par
// l'essai à blanc de la migration.
//
// Prix TVA comprise ; TVA d'un taux = TTC x taux / (100 + taux), arrondie au
// centime par ticket.
//
// Mardi 3 novembre 2026
//   T1 midi, table réservée, 2 couverts : 2 entrecôtes 84,00 + 2 cafés 9,00
//      = 93,00 à 8,1 % ; TVA 93,00 x 8,1 / 108,1 = 6,9685 -> 6,97. Carte,
//      pourboire 5,00. Annulé le mercredi.
//   T2 midi, à emporter : menu 39,00 à 2,6 % (TVA 0,9883 -> 0,99) + vin 58,00
//      à 8,1 % (TVA 4,3460 -> 4,35) = 97,00. Espèces.
//   T3 soir, table de passage, 3 couverts : 3 menus 117,00 + tarte 12,48 +
//      café offert (valeur 4,50) = 129,48 à 8,1 % ; TVA 9,7020 -> 9,70.
//      Carte 100,00 et espèces 29,48 arrondies à 29,50 (écart + 0,02).
//   Jour : 93,00 + 97,00 + 129,48 = 319,48 ; 8,1 % : 280,48, TVA 21,02 ;
//      2,6 % : 39,00, TVA 0,99. Midi 190,00, soir 129,48.
// Mercredi 4 novembre 2026
//   T4 midi, réservation d'un compte client, 2 couverts : 2 petits-déjeuners
//      36,00 à 3,8 % (TVA 1,3179 -> 1,32) + 2 cafés 9,00 à 8,1 % (TVA 0,6744
//      -> 0,67) = 45,00. TWINT.
//   T5 soir, table de passage, 4 couverts, remise de 10 % : 4 entrecôtes
//      168,00 - 16,80 = 151,20 + vin 58,00 - 5,80 = 52,20 = 203,40 à 8,1 % ;
//      TVA 15,2409 -> 15,24. Carte.
//   Annulation de T1 : - 93,00 (TVA - 6,97), service de midi, carte.
//   Jour : ventes 248,40, annulations 93,00, net 155,40 ; 8,1 % : 119,40, TVA
//      0,67 + 15,24 - 6,97 = 8,94 ; 3,8 % : 36,00, TVA 1,32.
//      Midi 45,00 - 93,00 = - 48,00, soir 203,40.
// Les deux jours
//   Net 319,48 + 155,40 = 474,88 ; TVA 22,01 + 10,26 = 32,27 ; hors TVA 442,61.
//   8,1 % : 399,88, TVA 29,96 ; 2,6 % : 39,00, TVA 0,99 ; 3,8 % : 36,00, TVA 1,32.
//   5 tickets, 1 annulation, couverts 2 + 0 + 3 + 2 + 4 - 2 = 9.
//   Ticket moyen 474,88 / 4 = 118,72 ; par couvert 474,88 / 9 = 52,76.
//   Midi 142,00, soir 332,88 ; sur place 377,88, à emporter 97,00.
//   Carte 396,40 - 93,00 = 303,40 ; espèces 97,00 + 29,50 = 126,50 ; TWINT
//   45,00 : 474,90, soit le net plus 0,02 d'arrondi.
//
// Lancer : npm.cmd run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import {
  comparaison, fusionnerDonnees, mouvements, periodeComplete, rapportCaisse, serieRapports, trierPlats,
} from './calculRapports.js';
import {
  csvRapport, feuillesDossier, feuillesRapport, nomFichierDossier, nomFichierRapport, texteLisezMoi, xlsxRapport, zipCsvRapport, zipDossier,
} from './exportsRapport.js';
import {
  clePeriode, libellePeriodeCaisse, lundiDe, periodeAnnee, periodeDe, periodeJour, periodeLibre, periodeMois, periodePrecedente,
  periodeSemaine, periodeService, periodeVoisine, tranches,
} from './periodesCaisse.js';
import { ANNA, BRUNO, CARLA, J1, J2, jeuEssai } from './jeuEssai.mjs';

const DEUX_JOURS = periodeLibre(J1, J2);
const somme = (liste, f) => Math.round(liste.reduce((s, x) => s + f(x) * 100, 0)) / 100;
const produit = (r, libelle) => r.plats.lignes.find((l) => l.libelle === libelle);

test('périodes : bornes, voisines, précédentes et libellés', () => {
  assert.equal(lundiDe('2026-11-10'), '2026-11-09');
  assert.equal(lundiDe('2026-11-15'), '2026-11-09');
  assert.deepEqual(periodeSemaine('2026-11-10'), { type: 'semaine', debut: '2026-11-09', fin: '2026-11-15' });
  assert.deepEqual(periodeMois('2026-02-10'), { type: 'mois', debut: '2026-02-01', fin: '2026-02-28' });
  assert.deepEqual(periodeAnnee('2026-11-10'), { type: 'annee', debut: '2026-01-01', fin: '2026-12-31' });
  assert.deepEqual(periodeLibre('2026-11-10', '2026-11-01'), { type: 'libre', debut: '2026-11-01', fin: '2026-11-10' });
  assert.equal(periodeLibre('2026-11-10', ''), null);
  assert.deepEqual(periodeDe('service', J1, { service: 'soir' }), { type: 'service', service: 'soir', debut: J1, fin: J1 });

  // Précédente équivalente : même jour de la semaine, semaine, mois, année d'avant.
  assert.deepEqual(periodePrecedente(periodeJour('2026-11-10')), periodeJour('2026-11-03'));
  assert.deepEqual(periodePrecedente(periodeService('2026-11-10', 'soir')), periodeService('2026-11-03', 'soir'));
  assert.deepEqual(periodePrecedente(periodeSemaine('2026-11-10')), periodeSemaine('2026-11-03'));
  assert.deepEqual(periodePrecedente(periodeMois('2026-03-15')), periodeMois('2026-02-01'));
  assert.deepEqual(periodePrecedente(periodeAnnee('2026-03-15')), periodeAnnee('2025-06-01'));
  assert.deepEqual(periodePrecedente(periodeLibre('2026-11-05', '2026-11-08')), { type: 'libre', debut: '2026-11-01', fin: '2026-11-04' });

  // Flèches : un service passe au service d'à côté.
  assert.deepEqual(periodeVoisine(periodeService(J1, 'midi'), 1), periodeService(J1, 'soir'));
  assert.deepEqual(periodeVoisine(periodeService(J1, 'soir'), 1), periodeService(J2, 'midi'));
  assert.deepEqual(periodeVoisine(periodeService(J2, 'midi'), -1), periodeService(J1, 'soir'));
  assert.deepEqual(periodeVoisine(periodeMois('2026-12-10'), 1), periodeMois('2027-01-01'));
  assert.deepEqual(periodeVoisine(periodeSemaine('2026-11-10'), -1), periodeSemaine('2026-11-03'));

  assert.equal(libellePeriodeCaisse(periodeService(J1, 'midi')), 'mardi 3 novembre 2026, midi');
  assert.equal(libellePeriodeCaisse(periodeJour('2026-11-01')), 'dimanche 1er novembre 2026');
  assert.equal(libellePeriodeCaisse(periodeSemaine('2026-11-10')), 'semaine du 9 au 15 novembre 2026');
  assert.equal(libellePeriodeCaisse(periodeSemaine('2026-12-30')), 'semaine du 28 décembre 2026 au 3 janvier 2027');
  assert.equal(libellePeriodeCaisse(periodeMois('2026-11-10')), 'novembre 2026');
  assert.equal(libellePeriodeCaisse(periodeAnnee('2026-11-10')), 'année 2026');
  assert.equal(libellePeriodeCaisse(DEUX_JOURS), 'du 3 au 4 novembre 2026');
  assert.equal(clePeriode(periodeService(J1, 'soir')), '2026-11-03_soir');
  assert.equal(clePeriode(DEUX_JOURS), '2026-11-03_2026-11-04');

  // Lecture par tranches d'au plus 31 jours, sans trou ni recouvrement.
  const t = tranches('2026-01-01', '2026-12-31');
  assert.equal(t.length, 12);
  assert.equal(t[0].debut, '2026-01-01');
  assert.equal(t[11].fin, '2026-12-31');
  t.slice(1).forEach((x, i) => assert.ok(x.debut > t[i].fin));
  assert.deepEqual(tranches(J1, J1), [{ debut: J1, fin: J1 }]);
});

test('synthèse des deux jours : chiffre, TVA par taux, tickets, couverts, parts', () => {
  const r = rapportCaisse(jeuEssai(), DEUX_JOURS);
  const s = r.synthese;
  assert.equal(s.ventesTtc, 567.88);
  assert.equal(s.annulationsTtc, 93);
  assert.equal(s.ttc, 474.88);
  assert.equal(s.tva, 32.27);
  assert.equal(s.ht, 442.61);
  assert.deepEqual(s.parTaux, [
    { taux: 8.1, ttc: 399.88, tva: 29.96, ht: 369.92 },
    { taux: 3.8, ttc: 36, tva: 1.32, ht: 34.68 },
    { taux: 2.6, ttc: 39, tva: 0.99, ht: 38.01 },
  ]);
  assert.equal(s.tickets, 5);
  assert.equal(s.annulations, 1);
  assert.equal(s.couverts, 9);
  assert.equal(s.ticketMoyen, 118.72);
  assert.equal(s.parCouvert, 52.76);
  assert.equal(s.midi.ttc, 142);
  assert.equal(s.soir.ttc, 332.88);
  assert.equal(s.surPlace.ttc, 377.88);
  assert.equal(s.emporter.ttc, 97);
  assert.ok(Math.abs(s.midi.part + s.soir.part - 1) < 1e-9);
  assert.ok(Math.abs(s.midi.part - 142 / 474.88) < 1e-9);
  assert.equal(r.vide, false);
  assert.equal(r.provisoire, false);
});

test('moyens de paiement, pourboires, arrondis et écarts de caisse', () => {
  const r = rapportCaisse(jeuEssai(), DEUX_JOURS);
  assert.deepEqual(r.moyens.lignes.map((l) => [l.nom, l.nombre, l.ventes, l.annulations, l.net, l.pourboires]), [
    ['Espèces', 2, 126.5, 0, 126.5, 0],
    ['Carte bancaire', 3, 396.4, 93, 303.4, 5],
    ['TWINT', 1, 45, 0, 45, 0],
  ]);
  assert.equal(r.moyens.net, 474.9);
  assert.equal(r.moyens.pourboires, 5);
  assert.equal(r.moyens.arrondis, 0.02);
  // Le net encaissé fait le chiffre plus l'écart d'arrondi.
  assert.equal(Math.round((r.moyens.net - r.moyens.arrondis) * 100) / 100, r.synthese.ttc);
  // Écart de caisse : le comptage de la dernière clôture du jour (la
  // complémentaire du mardi, - 0,10), puis - 0,50 le mercredi.
  assert.deepEqual(r.ecartsCaisse.lignes.map((e) => [e.jour, e.numero, e.numeroRetenu, e.complements, e.ecart]), [
    [J1, 1, 3, 1, -0.1],
    [J2, 2, 2, 0, -0.5],
  ]);
  assert.equal(r.ecartsCaisse.total, -0.6);
});

test('v9, terminal relié : la carte passée par le terminal a sa ligne, la carte à la main le dit', () => {
  // T3 : carte 100,00 passée par le terminal relié. T1 (93,00, annulé le
  // mercredi) et T5 (203,40) restent des cartes saisies à la main.
  const donnees = jeuEssai();
  const relie = donnees.paiements.find((p) => p.moyen === 'carte' && Number(p.montant) === 100);
  relie.relie = true;
  const r = rapportCaisse(donnees, DEUX_JOURS);
  assert.deepEqual(r.moyens.lignes.map((l) => [l.nom, l.mode, l.nombre, l.ventes, l.annulations, l.net]), [
    ['Espèces', null, 2, 126.5, 0, 126.5],
    ['Carte bancaire, terminal relié', 'relie', 1, 100, 0, 100],
    ['Carte bancaire, saisie à la main', 'main', 2, 296.4, 93, 203.4],
    ['TWINT', null, 1, 45, 0, 45],
  ]);
  // Le total ne bouge pas : seules les lignes se partagent.
  assert.equal(r.moyens.net, 474.9);
  assert.equal(r.moyens.pourboires, 5);
  // Sans paiement relié, les lignes sont celles de la v8 (aucun mode).
  assert.deepEqual(rapportCaisse(jeuEssai(), DEUX_JOURS).moyens.lignes.map((l) => [l.nom, l.mode]), [
    ['Espèces', null], ['Carte bancaire', null], ['TWINT', null],
  ]);
});

test('plats vendus : quantités et chiffre répartis midi et soir, offerts, remises, meilleurs et moins vendus', () => {
  const r = rapportCaisse(jeuEssai(), DEUX_JOURS);
  const p = r.plats;
  const attendu = {
    'Menu du jour': [4, 156, 1, 39, 3, 117, 0, 0, 0],
    'Entrecôte': [4, 151.2, 0, 0, 4, 151.2, 0, 0, 16.8],
    'Café': [3, 9, 2, 9, 1, 0, 1, 4.5, 0],
    'Vin de la maison': [2, 110.2, 1, 58, 1, 52.2, 0, 0, 5.8],
    'Petit-déjeuner de l\'hôtel': [2, 36, 2, 36, 0, 0, 0, 0, 0],
    'Tarte du jour': [1, 12.48, 0, 0, 1, 12.48, 0, 0, 0],
  };
  assert.deepEqual(p.lignes.map((l) => l.libelle), Object.keys(attendu));
  Object.entries(attendu).forEach(([libelle, v]) => {
    const l = produit(r, libelle);
    assert.deepEqual([l.qte, l.ttc, l.midi.qte, l.midi.ttc, l.soir.qte, l.soir.ttc, l.offertsQte, l.offertsValeur, l.remises], v, libelle);
  });
  assert.equal(p.qte, 16);
  assert.equal(p.offertsValeur, 4.5);
  assert.equal(p.remises, 22.6);
  // Somme des plats vendus = chiffre d'affaires hors pourboires.
  assert.equal(p.ttc, 474.88);
  assert.equal(somme(p.lignes, (l) => l.ttc), r.synthese.ttc);
  assert.equal(p.midi.ttc, r.synthese.midi.ttc);
  assert.equal(p.soir.ttc, r.synthese.soir.ttc);
  assert.equal(somme(p.categories, (c) => c.ttc), 474.88);
  assert.deepEqual(p.categories.map((c) => [c.nom, c.ttc]), [['Plats', 307.2], ['Vins', 110.2], ['Hébergement', 36], ['Desserts', 12.48], ['Boissons', 9]]);
  assert.deepEqual(p.meilleurs.map((l) => l.libelle), ['Menu du jour', 'Entrecôte', 'Café', 'Vin de la maison', 'Petit-déjeuner de l\'hôtel']);
  assert.deepEqual(p.moinsVendus.map((l) => l.libelle), ['Tarte du jour']);
  assert.deepEqual(trierPlats(p.lignes, 'ttc').slice(0, 2).map((l) => l.libelle), ['Menu du jour', 'Entrecôte']);
  assert.equal(trierPlats(p.lignes, 'nom')[0].libelle, 'Café');
});

test('par service, par heure, par personne, clients', () => {
  const r = rapportCaisse(jeuEssai(), DEUX_JOURS);
  assert.deepEqual(r.services.map((s) => [s.jour, s.service, s.tickets, s.annulations, s.couverts, s.ttc, s.dureeMoyenneMin]), [
    [J1, 'midi', 2, 0, 2, 190, 65],
    [J1, 'soir', 1, 0, 3, 129.48, 105],
    [J2, 'midi', 1, 1, 0, -48, 50],
    [J2, 'soir', 1, 0, 4, 203.4, 90],
  ]);
  assert.deepEqual(r.heures, [
    { heure: 11, tickets: 1, couverts: 2, ttc: 45 },
    { heure: 12, tickets: 2, couverts: 2, ttc: 190 },
    { heure: 19, tickets: 2, couverts: 7, ttc: 332.88 },
  ]);
  const de = (nom) => r.personnes.find((p) => p.nom === nom);
  assert.deepEqual([de('Anna Serveuse').ouverts, de('Anna Serveuse').encaisses, de('Anna Serveuse').ttc], [4, 3, 393.4]);
  assert.deepEqual([de('Carla Cheffe').ouverts, de('Carla Cheffe').encaisses, de('Carla Cheffe').ttc, de('Carla Cheffe').remisesLignes, de('Carla Cheffe').remises], [1, 2, 174.48, 2, 22.6]);
  assert.deepEqual([de('Bruno Patron').annulations, de('Bruno Patron').annulationsTtc, de('Bruno Patron').offertsLignes, de('Bruno Patron').offertsValeur], [1, 93, 1, 4.5]);
  assert.equal(somme(r.personnes, (p) => p.ttc), 567.88);
  assert.deepEqual(r.clients, {
    reservation: { tickets: 1, couverts: 2, ttc: 45 },
    passage: { tickets: 2, couverts: 7, ttc: 332.88 },
    direct: { tickets: 1, couverts: 0, ttc: 97 },
    comptes: { tickets: 1, couverts: 2, ttc: 45 },
  });
});

test('journal des écarts : annulations, remises, offerts, abandons, corrections et usage du mode test', () => {
  const j = rapportCaisse(jeuEssai(), DEUX_JOURS).journal;
  assert.deepEqual(j.annulations, { nombre: 1, montant: -93 });
  assert.deepEqual(j.remises, { nombre: 2, montant: 22.6 });
  assert.deepEqual(j.offerts, { nombre: 1, montant: 4.5 });
  assert.deepEqual(j.abandons, { nombre: 1, montant: 9 });
  assert.deepEqual(j.corrections, { nombre: 1 });
  assert.deepEqual(j.tests, { entrees: 1, sorties: 1, purges: 1, tickets: 2, montant: 84 });
  const annulation = j.entrees.find((e) => e.genre === 'annulation');
  assert.deepEqual([annulation.piece, annulation.auteur, annulation.motif], ['2026-000001', 'Bruno Patron', 'Erreur de table, ticket refait']);
  const offert = j.entrees.find((e) => e.genre === 'offert');
  assert.deepEqual([offert.piece, offert.detail, offert.auteur, offert.motif], ['2026-000003', 'Café', 'Bruno Patron', 'Geste commercial']);
  // Dans l'ordre des heures.
  assert.deepEqual(j.entrees.map((e) => e.quand), [...j.entrees.map((e) => e.quand)].sort());
});

test('cohérence croisée : services = jour = tickets encaissés = clôture = lignes ventes_jour', () => {
  const d = jeuEssai();
  [[J1, 'z1', 319.48], [J2, 'z2', 155.4]].forEach(([jour, z, net]) => {
    const duJour = rapportCaisse(d, periodeJour(jour));
    const midi = rapportCaisse(d, periodeService(jour, 'midi'));
    const soir = rapportCaisse(d, periodeService(jour, 'soir'));
    const cloture = d.clotures.find((c) => c.id === z);
    // Somme des rapports de services = rapport du jour.
    assert.equal(somme([midi, soir], (r) => r.synthese.ttc), duJour.synthese.ttc);
    assert.equal(somme([midi, soir], (r) => r.synthese.tva), duJour.synthese.tva);
    assert.equal(midi.synthese.tickets + soir.synthese.tickets, duJour.synthese.tickets);
    assert.equal(somme(duJour.services, (s) => s.ttc), duJour.synthese.ttc);
    // = somme des tickets encaissés (total figé de chaque ticket), annulations en moins.
    const tickets = somme(mouvements(d, periodeJour(jour)), (m) => m.signe * m.ticket.total_ttc);
    assert.equal(tickets, duJour.synthese.ttc);
    // = clôture du jour (net figé par la base), par taux aussi.
    assert.equal(duJour.synthese.ttc, net);
    assert.equal(duJour.synthese.ttc, cloture.totaux.net.ttc);
    assert.equal(duJour.synthese.tva, cloture.totaux.net.tva);
    assert.equal(duJour.synthese.ht, cloture.totaux.net.ht);
    assert.deepEqual(duJour.synthese.parTaux, cloture.totaux.net.par_taux);
    assert.equal(duJour.jours[0].ecartCloture, 0);
    // = lignes ventes_jour écrites par la clôture, une par taux.
    const vj = d.ventes_jour.filter((v) => v.jour === jour);
    assert.deepEqual(vj.map((v) => [v.taux, v.montant_ttc]).sort(), duJour.synthese.parTaux.map((t) => [t.taux, t.ttc]).sort());
    assert.equal(duJour.jours[0].comptabilite, 'caisse');
    assert.equal(duJour.jours[0].comptabiliteTtc, net);
    // Somme des plats vendus = chiffre d'affaires hors pourboires.
    assert.equal(duJour.plats.ttc, duJour.synthese.ttc);
    // Moyens : ce que la clôture a figé.
    assert.deepEqual(
      midi.moyens.lignes.concat(soir.moyens.lignes).reduce((s, l) => s + Math.round(l.ventes * 100), 0) / 100,
      somme(cloture.totaux.moyens, (m) => m.montant),
    );
  });
  // Une clôture complémentaire ne s'additionne jamais : deux jours, deux nets.
  const r = rapportCaisse(d, DEUX_JOURS);
  assert.equal(somme(r.jours, (j) => j.netFige), 474.88);
  assert.equal(somme(r.jours, (j) => j.ttc), r.synthese.ttc);
  assert.equal(r.jours.length, 2);
  // Semaine, mois et année qui contiennent ces deux jours : le même chiffre.
  ['semaine', 'mois', 'annee'].forEach((type) => assert.equal(rapportCaisse(d, periodeDe(type, J1)).synthese.ttc, 474.88, type));
});

test('mode test : tous les totaux sont identiques avec et sans tickets de test', () => {
  const avec = rapportCaisse(jeuEssai({ avecTests: true }), DEUX_JOURS);
  const sans = rapportCaisse(jeuEssai({ avecTests: false }), DEUX_JOURS);
  const { journal: journalAvec, ...resteAvec } = avec;
  const { journal: journalSans, ...resteSans } = sans;
  assert.deepEqual(resteAvec, resteSans);
  // Seule la trace de l'usage du mode test diffère, dans le Journal des écarts.
  const { tests: testsAvec, entrees: entreesAvec, ...jAvec } = journalAvec;
  const { tests: testsSans, entrees: entreesSans, ...jSans } = journalSans;
  assert.deepEqual(jAvec, jSans);
  assert.deepEqual(entreesAvec.filter((e) => !e.genre.startsWith('test_')), entreesSans);
  assert.deepEqual(testsSans, { entrees: 0, sorties: 0, purges: 0, tickets: 0, montant: 0 });
  assert.equal(testsAvec.tickets, 2);
  // Le jeu contient bien des tickets de test, et aucun n'est devenu mouvement.
  const d = jeuEssai();
  assert.equal(d.tickets.filter((t) => t.test).length, 2);
  assert.equal(mouvements(d, periodeAnnee(J1)).filter((m) => m.ticket.test).length, 0);
  // Les fichiers aussi : mêmes feuilles hors journal.
  const feuilles = (r) => feuillesRapport(r).filter((f) => f.id !== 'journal');
  assert.deepEqual(feuilles(avec), feuilles(sans));
  assert.deepEqual(feuillesDossier({ donnees: jeuEssai(), rapport: avec }), feuillesDossier({ donnees: jeuEssai({ avecTests: false }), rapport: sans }));
});

test('jour non clôturé : provisoire partout, hors de la sortie comptable, sans comparaison', () => {
  const d = jeuEssai({ sansClotureJ2: true });
  const r = rapportCaisse(d, DEUX_JOURS);
  assert.equal(r.provisoire, true);
  assert.deepEqual(r.provisoires, [J2]);
  assert.deepEqual(r.jours.map((j) => [j.jour, j.provisoire, j.cloture?.numero ?? null]), [[J1, false, 1], [J2, true, null]]);
  // Le rapport montre le jour, marqué ; le chiffre reste celui des tickets.
  assert.equal(r.synthese.ttc, 474.88);
  assert.equal(periodeComplete(r), false);
  const feuilles = feuillesRapport(r);
  assert.ok(feuilles[0].rangs.some((x) => String(x.cellules[2] || '').startsWith('provisoire')));
  assert.ok(feuilles[0].rangs.some((x) => String(x.cellules[0] || '').startsWith('Rapport provisoire : 1 jour n\'est pas clôturé (04.11.2026)')));
  assert.equal(feuilles.find((f) => f.id === 'services').rangs.filter((x) => x.cellules[7] === 'provisoire').length, 2);
  // Dossier fiduciaire : seul le mardi, clôturé, y entre.
  const dossier = feuillesDossier({ donnees: d, rapport: r });
  const ventes = dossier.find((f) => f.id === 'ventes');
  assert.deepEqual(ventes.rangs.filter((x) => !x.fort).map((x) => x.cellules[0]), ['03.11.2026', '03.11.2026']);
  assert.equal(ventes.rangs[ventes.rangs.length - 1].cellules[5], 319.48);
  assert.deepEqual(dossier.find((f) => f.id === 'tickets').rangs.map((x) => x.cellules[0]), ['2026-000001', '2026-000002', '2026-000003']);
  // L'annulation de T1, faite un jour non clôturé, attend la clôture de ce jour.
  assert.equal(dossier.find((f) => f.id === 'annulations').rangs.length, 0);
  assert.match(texteLisezMoi({ rapport: r, etablissement: 'Maison d\'essai', date: new Date('2026-11-10T09:00:00Z') }), /Jour laissé hors du dossier, faute de clôture \(1\) : 04\.11\.2026\./);
});

test('comparaison avec la période précédente : seulement quand elle est complète', () => {
  const d = jeuEssai();
  const mercredi = rapportCaisse(d, periodeJour(J2));
  const mardi = rapportCaisse(d, periodeJour(J1));
  assert.equal(periodeComplete(mercredi), true);
  // Mercredi contre mardi (période libre d'un jour, la veille).
  const c = comparaison(mercredi, mardi, J1);
  assert.deepEqual(c.ttc, { avant: 319.48, ecart: -164.08, pct: -164.08 / 319.48 });
  assert.deepEqual(c.tickets, { avant: 3, ecart: -1, pct: -1 / 3 });
  // La caisse ne tournait pas encore au début de la période précédente.
  assert.equal(comparaison(mercredi, mardi, J2), null);
  assert.equal(comparaison(mercredi, mardi, null), null);
  // Période affichée en cours : pas de comparaison.
  const enCours = rapportCaisse({ ...d, jour_courant: J2 }, periodeJour(J2));
  assert.equal(periodeComplete(enCours), false);
  assert.equal(comparaison(enCours, mardi, J1), null);
  // Période précédente provisoire : pas de comparaison.
  const sansZ1 = { ...d, clotures: d.clotures.filter((x) => x.jour !== J1) };
  assert.equal(comparaison(mercredi, rapportCaisse(sansZ1, periodeJour(J1)), J1), null);
});

test('droits : le responsable de cuisine a les plats et les services, rien des paiements ni des écarts', () => {
  const r = rapportCaisse(jeuEssai({ niveau: 'cuisine' }), DEUX_JOURS);
  assert.equal(r.niveau, 'cuisine');
  assert.equal(r.moyens, null);
  assert.equal(r.ecartsCaisse, null);
  assert.equal(r.personnes, null);
  assert.equal(r.journal, null);
  // Mêmes plats et mêmes services que la direction.
  const direction = rapportCaisse(jeuEssai(), DEUX_JOURS);
  assert.deepEqual(r.plats, direction.plats);
  assert.deepEqual(r.services, direction.services);
  assert.deepEqual(feuillesRapport(r).map((f) => f.id), ['plats', 'services']);
  assert.deepEqual(feuillesRapport(direction).map((f) => f.id), ['synthese', 'moyens', 'plats', 'services', 'heures', 'personnes', 'journal', 'clients']);
  // Sans les clôtures détaillées, le jour reste dit clôturé, sans net figé.
  assert.deepEqual(r.jours.map((j) => [j.provisoire, j.netFige]), [[false, null], [false, null]]);
});

test('lecture par tranches : un ticket lu deux fois ne compte qu\'une fois', () => {
  const d = jeuEssai();
  const dans = (liste, ids) => liste.filter((x) => ids.includes(x.ticket_id ?? x.id));
  const tranche = (ids) => ({ ...d, tickets: dans(d.tickets, ids), lignes: dans(d.lignes, ids), paiements: dans(d.paiements, ids) });
  // T1 arrive dans les deux tranches : vendu dans la première, annulé dans la seconde.
  const reuni = fusionnerDonnees([tranche(['t1', 't2', 't3']), tranche(['t1', 't4', 't5'])]);
  assert.equal(reuni.tickets.length, 5);
  assert.equal(reuni.lignes.length, 11);
  assert.deepEqual(rapportCaisse(reuni, DEUX_JOURS).synthese, rapportCaisse(d, DEUX_JOURS).synthese);
  assert.equal(fusionnerDonnees([]), null);
});

// ── Fichiers : rechargés et relus ──
const DATE = new Date('2026-11-10T09:00:00Z');
const lireZip = (octets) => Object.fromEntries(Object.entries(unzipSync(octets)).map(([k, v]) => [k, v]));
// strFromU8 retire le BOM : un CSV se lit avec un décodeur qui le garde.
const texteBrut = (octets) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(octets);
function cellules(xml) {
  const out = {};
  const re = /<c r="([A-Z]+\d+)" s="\d+"(?: t="inlineStr")?(?:\/>|>(?:<is><t xml:space="preserve">([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[2] !== undefined) out[m[1]] = m[2].replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    else if (m[3] !== undefined) out[m[1]] = Number(m[3]);
  }
  return out;
}
const valeurDe = (c, libelle, colonne = 'B') => {
  const ref = Object.keys(c).find((k) => /^A\d+$/.test(k) && c[k] === libelle);
  return ref ? c[`${colonne}${ref.slice(1)}`] : undefined;
};
const lignesCsv = (texte) => {
  assert.equal(texte.charCodeAt(0), 0xFEFF, 'BOM UTF-8');
  assert.ok(texte.endsWith('\r\n'));
  return texte.slice(1).trimEnd().split('\r\n').map((l) => l.split(';'));
};

test('classeur Excel du rapport : rechargé, mêmes montants que le rapport', () => {
  const r = rapportCaisse(jeuEssai(), DEUX_JOURS);
  const zip = lireZip(xlsxRapport(r, { date: DATE }));
  const classeur = strFromU8(zip['xl/workbook.xml']);
  assert.deepEqual([...classeur.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1].replace(/&apos;/g, '\'')),
    ['Synthèse', 'Moyens de paiement', 'Plats vendus', 'Services', 'Heures', 'Personnes', 'Journal des écarts', 'Clients']);
  const synthese = cellules(strFromU8(zip['xl/worksheets/sheet1.xml']));
  assert.equal(synthese.A1, 'Synthèse : Caisse, du 3 au 4 novembre 2026');
  assert.equal(valeurDe(synthese, 'Chiffre d\'affaires TVA comprise'), r.synthese.ttc);
  assert.equal(valeurDe(synthese, 'Chiffre d\'affaires hors TVA'), 442.61);
  assert.equal(valeurDe(synthese, 'TVA'), 32.27);
  assert.equal(valeurDe(synthese, '   dont 8,1 %'), 399.88);
  assert.equal(valeurDe(synthese, 'Annulations'), -93);
  assert.equal(valeurDe(synthese, 'Ticket moyen'), 118.72);
  assert.equal(valeurDe(synthese, 'Midi'), 142);
  assert.equal(valeurDe(synthese, '03.11.2026'), 319.48);
  assert.equal(valeurDe(synthese, '04.11.2026', 'C'), 'clôture n° 2');
  const moyens = cellules(strFromU8(zip['xl/worksheets/sheet2.xml']));
  assert.equal(valeurDe(moyens, 'Carte bancaire', 'E'), 303.4);
  assert.equal(valeurDe(moyens, 'Total', 'E'), 474.9);
  assert.equal(valeurDe(moyens, 'Écarts de caisse des clôtures', 'E'), -0.6);
  const plats = cellules(strFromU8(zip['xl/worksheets/sheet3.xml']));
  assert.equal(valeurDe(plats, 'Entrecôte', 'C'), 4);
  assert.equal(valeurDe(plats, 'Entrecôte', 'H'), 151.2);
  assert.equal(valeurDe(plats, 'Café', 'J'), 4.5);
  assert.equal(valeurDe(plats, 'Total', 'D'), r.plats.ttc);
  assert.equal(valeurDe(plats, 'Total', 'F'), 142);
  assert.equal(valeurDe(plats, 'Total', 'H'), 332.88);
  const services = cellules(strFromU8(zip['xl/worksheets/sheet4.xml']));
  assert.equal(valeurDe(services, 'Total', 'F'), 474.88);
});

test('CSV du rapport : rechargés, conventions fr_CH, mêmes montants', () => {
  const r = rapportCaisse(jeuEssai(), DEUX_JOURS);
  const zip = lireZip(zipCsvRapport(r, { date: DATE }));
  assert.deepEqual(Object.keys(zip).sort(), [
    'clients.csv', 'heures.csv', 'journal-des-ecarts.csv', 'moyens-de-paiement.csv', 'personnes.csv', 'plats-vendus.csv', 'services.csv', 'synthese.csv',
  ]);
  const plats = lignesCsv(texteBrut(zip['plats-vendus.csv']));
  assert.deepEqual(plats[0].slice(0, 4), ['Produit', 'Catégorie', 'Quantité', 'Chiffre TTC']);
  assert.deepEqual(plats.find((l) => l[0] === 'Entrecôte'), ['Entrecôte', 'Plats', '4.00', '151.20', '0.00', '0.00', '4.00', '151.20', '0.00', '0.00', '16.80']);
  assert.equal(plats[plats.length - 1][3], '474.88');
  const services = lignesCsv(texteBrut(zip['services.csv']));
  assert.deepEqual(services[3], ['04.11.2026', 'Midi', '1.00', '1.00', '0.00', '-48.00', '50.00', 'clôturé']);
  const synthese = lignesCsv(texteBrut(zip['synthese.csv']));
  assert.equal(synthese.find((l) => l[0] === 'Chiffre d\'affaires TVA comprise')[1], '474.88');
  // Le CSV d'un seul rapport est le même fichier.
  assert.equal(csvRapport(r, 'plats'), texteBrut(zip['plats-vendus.csv']));
  assert.equal(csvRapport(r, 'inconnu'), null);
  assert.equal(nomFichierRapport(DEUX_JOURS, 'xlsx'), 'caisse_2026-11-03_2026-11-04.xlsx');
  assert.equal(nomFichierRapport(periodeService(J1, 'midi'), 'csv'), 'caisse_2026-11-03_midi_csv.zip');
});

test('dossier fiduciaire : journal des ventes par jour et par taux, encaissements, clôtures, tickets, annulations, intégrité', () => {
  const d = jeuEssai();
  const r = rapportCaisse(d, DEUX_JOURS);
  const chaine = { ok: true, complet: true, maillons: 8, tickets: 5, annulations: 1, clotures: 3, derniere_empreinte: 'c'.repeat(64), defauts: [], verifie_at: '2026-11-10T09:00:00Z' };
  const zip = lireZip(zipDossier({ donnees: d, rapport: r, chaine, pdf: new Uint8Array([37, 80, 68, 70]), etablissement: 'Maison d\'essai', date: DATE }));
  assert.deepEqual(Object.keys(zip).sort(), [
    'annulations.csv', 'clotures.csv', 'dossier-caisse.xlsx', 'encaissements.csv', 'integrite.txt', 'journal-des-tickets.csv',
    'journal-des-ventes.csv', 'lisez-moi.txt', 'synthese.pdf',
  ]);
  assert.equal(nomFichierDossier(DEUX_JOURS), 'dossier-caisse_2026-11-03_2026-11-04.zip');

  const ventes = lignesCsv(texteBrut(zip['journal-des-ventes.csv']));
  assert.deepEqual(ventes[0], ['Date', 'Clôture n°', 'Taux (%)', 'Ventes TTC', 'Annulations TTC', 'Net TTC', 'Net hors TVA', 'TVA nette', 'Repris en Comptabilité']);
  assert.deepEqual(ventes.slice(1, 5), [
    ['03.11.2026', '1.00', '8.10', '280.48', '0.00', '280.48', '259.46', '21.02', 'caisse'],
    ['03.11.2026', '1.00', '2.60', '39.00', '0.00', '39.00', '38.01', '0.99', 'caisse'],
    ['04.11.2026', '2.00', '8.10', '212.40', '-93.00', '119.40', '110.46', '8.94', 'caisse'],
    ['04.11.2026', '2.00', '3.80', '36.00', '0.00', '36.00', '34.68', '1.32', 'caisse'],
  ]);
  assert.deepEqual(ventes[5].slice(2), ['8.10', '492.88', '-93.00', '399.88', '369.92', '29.96', '']);
  assert.deepEqual(ventes[ventes.length - 1], ['Total, 2 jours clôturés', '', '', '567.88', '-93.00', '474.88', '442.61', '32.27', '']);

  const enc = lignesCsv(texteBrut(zip['encaissements.csv']));
  assert.deepEqual(enc.slice(1, 5), [
    ['03.11.2026', '1.00', 'Carte bancaire', '2.00', '193.00', '0.00', '193.00', '5.00'],
    ['03.11.2026', '1.00', 'Espèces', '2.00', '126.50', '0.00', '126.50', '0.00'],
    ['04.11.2026', '2.00', 'TWINT', '1.00', '45.00', '0.00', '45.00', '0.00'],
    ['04.11.2026', '2.00', 'Carte bancaire', '1.00', '203.40', '-93.00', '110.40', '0.00'],
  ]);
  assert.deepEqual(enc.find((l) => l[0] === 'Total Carte bancaire').slice(3), ['3.00', '396.40', '-93.00', '303.40', '5.00']);

  const clotures = lignesCsv(texteBrut(zip['clotures.csv']));
  assert.deepEqual(clotures.slice(1).map((l) => [l[0], l[1], l[2], l[5], l[9]]), [
    ['1.00', '03.11.2026', 'clôture du jour', '319.48', '0.00'],
    ['2.00', '04.11.2026', 'clôture du jour', '155.40', '-0.50'],
    ['3.00', '03.11.2026', 'complémentaire de la n° 1', '319.48', '-0.10'],
  ]);

  const tickets = lignesCsv(texteBrut(zip['journal-des-tickets.csv']));
  assert.equal(tickets.length, 6);
  assert.deepEqual(tickets[1].slice(0, 8), ['2026-000001', '03.11.2026', '03.11.2026 13:10', 'Midi', 'sur place', '93.00', '93.00', '6.97']);
  assert.equal(tickets[1][tickets[1].length - 1], 'annulé le 04.11.2026');
  assert.deepEqual(tickets[2].slice(4, 10), ['à emporter', '97.00', '58.00', '4.35', '39.00', '0.99']);
  assert.equal(tickets[3][tickets[3].length - 2], 'Carte bancaire 100.00 + Espèces 29.50');
  assert.deepEqual(tickets[4].slice(5, 12), ['45.00', '9.00', '0.67', '', '', '36.00', '1.32']);
  // Somme des tickets, annulation en moins = net du journal des ventes.
  assert.equal(Math.round((tickets.slice(1).reduce((s, l) => s + Number(l[5]), 0) - 93) * 100) / 100, 474.88);

  const annulations = lignesCsv(texteBrut(zip['annulations.csv']));
  assert.deepEqual(annulations[1], ['2026-000001', '03.11.2026', '04.11.2026 11:20', '04.11.2026', 'Bruno Patron', 'Erreur de table, ticket refait', '93.00', '6.97']);

  const integrite = strFromU8(zip['integrite.txt']);
  assert.match(integrite, /Résultat : chaîne intacte/);
  assert.match(integrite, /Contrôle lancé le 10\.11\.2026 10:00/);
  const lisez = strFromU8(zip['lisez-moi.txt']);
  assert.match(lisez, /Tous les jours de vente de la période sont clôturés\./);
  assert.match(lisez, /Période : du 03\.11\.2026 au 04\.11\.2026/);
  assert.doesNotMatch(lisez, /TEST|tt1/);

  // Le classeur du dossier porte les mêmes tableaux.
  const classeur = lireZip(zip['dossier-caisse.xlsx']);
  const journal = cellules(strFromU8(classeur['xl/worksheets/sheet1.xml']));
  assert.equal(valeurDe(journal, 'Total, 2 jours clôturés', 'F'), 474.88);
  assert.equal(valeurDe(journal, 'Total, 2 jours clôturés', 'H'), 32.27);

  // Un jour repris à la main en Comptabilité est dit, sans changer le chiffre de la caisse.
  const saisi = { ...d, ventes_jour: d.ventes_jour.map((v) => (v.jour === J2 && v.taux === 8.1 ? { ...v, montant_ttc: 120, source: 'manuel' } : v)) };
  const rs = rapportCaisse(saisi, DEUX_JOURS);
  assert.equal(rs.jours[1].comptabilite, 'manuel');
  assert.match(texteLisezMoi({ rapport: rs, date: DATE }), /04\.11\.2026 : saisi 156\.00, caisse 155\.40/);
  assert.equal(feuillesDossier({ donnees: saisi, rapport: rs }).find((f) => f.id === 'ventes').rangs[2].cellules[8], 'saisie à la main');
});

test('personnes citées dans le jeu', () => {
  assert.ok([ANNA, BRUNO, CARLA].every((id) => jeuEssai().personnes[id]));
});

// ── Série par tranche (module Statistiques) ──
const centimesDe = (v) => Math.round(v * 100);

test('série : la somme des jours est le chiffre de la période, au centime', () => {
  const d = jeuEssai();
  const periode = periodeLibre(J1, J2);
  const r = rapportCaisse(d, periode);
  const jours = serieRapports(d, periode, [{ debut: J1, fin: J1 }, { debut: J2, fin: J2 }]);
  assert.equal(jours[0].synthese.ttc, 319.48);
  assert.equal(jours[1].synthese.ttc, 155.4);
  const somme = (f) => jours.reduce((s, j) => s + centimesDe(f(j)), 0) / 100;
  assert.equal(somme((j) => j.synthese.ttc), r.synthese.ttc);
  assert.equal(somme((j) => j.synthese.ht), r.synthese.ht);
  assert.equal(somme((j) => j.synthese.tva), r.synthese.tva);
  assert.equal(somme((j) => j.plats.ttc), r.plats.ttc);
  assert.equal(somme((j) => j.moyens.net), r.moyens.net);
  assert.equal(somme((j) => j.moyens.pourboires), r.moyens.pourboires);
  assert.equal(jours[0].synthese.tickets + jours[1].synthese.tickets, r.synthese.tickets);
  assert.equal(jours[0].synthese.couverts + jours[1].synthese.couverts, r.synthese.couverts);
  assert.equal(jours[0].plats.qte + jours[1].plats.qte, r.plats.qte);
});

test('série : une tranche égale à la période rend le rapport, taux compris', () => {
  const d = jeuEssai();
  const periode = periodeLibre(J1, J2);
  const r = rapportCaisse(d, periode);
  const [tout] = serieRapports(d, periode, [{ debut: J1, fin: J2 }]);
  assert.deepEqual(tout.synthese, r.synthese);
  assert.deepEqual(tout.moyens, r.moyens);
  assert.deepEqual(tout.clients, r.clients);
  assert.deepEqual(tout.ecartsCaisse, r.ecartsCaisse);
  assert.equal(tout.synthese.ticketMoyen, 118.72);
  assert.equal(tout.synthese.parCouvert, 52.76);
  assert.deepEqual(tout.ecarts.annulations, r.journal.annulations);
  assert.deepEqual(tout.ecarts.remises, r.journal.remises);
  assert.deepEqual(tout.ecarts.offerts, r.journal.offerts);
});

test('série : le ticket moyen d\'une tranche se recalcule, il ne se moyenne pas', () => {
  const d = jeuEssai();
  const periode = periodeLibre(J1, J2);
  const jours = serieRapports(d, periode, [{ debut: J1, fin: J1 }, { debut: J2, fin: J2 }]);
  const [tout] = serieRapports(d, periode, [{ debut: J1, fin: J2 }]);
  const moyenneDesTaux = (jours[0].synthese.ticketMoyen + jours[1].synthese.ticketMoyen) / 2;
  assert.notEqual(Math.round(moyenneDesTaux * 100) / 100, tout.synthese.ticketMoyen);
  const nets = jours.reduce((s, j) => s + j.synthese.tickets - j.synthese.annulations, 0);
  const ttc = jours.reduce((s, j) => s + centimesDe(j.synthese.ttc), 0);
  assert.equal(Math.round(ttc / nets) / 100, tout.synthese.ticketMoyen);
});

test('série : durée moyenne d\'une table égale à celle des services, tranche vide sans zéro inventé', () => {
  const d = jeuEssai();
  const periode = periodeLibre(J1, '2026-11-05');
  const r = rapportCaisse(d, periode);
  const serie = serieRapports(d, periode, [{ debut: J1, fin: J1 }, { debut: J2, fin: J2 }, { debut: '2026-11-05', fin: '2026-11-05' }]);
  const duJour = (jour) => r.services.filter((s) => s.jour === jour);
  [J1, J2].forEach((jour, i) => {
    const tables = duJour(jour).reduce((s, x) => s + x.tables, 0);
    assert.equal(serie[i].tables, tables);
  });
  assert.equal(serie[2].vide, true);
  assert.equal(serie[2].synthese.ticketMoyen, null);
  assert.equal(serie[2].dureeMoyenneMin, null);
});

test('série : le niveau cuisine ne reçoit ni moyens, ni clients, ni écarts', () => {
  const d = jeuEssai({ niveau: 'cuisine' });
  const periode = periodeLibre(J1, J2);
  const [tout] = serieRapports(d, periode, [{ debut: J1, fin: J2 }]);
  assert.equal(tout.moyens, null);
  assert.equal(tout.clients, null);
  assert.equal(tout.ecartsCaisse, null);
  assert.equal(tout.ecarts, null);
  assert.ok(tout.plats.qte > 0);
});

test('série : plus de mille tickets, la somme des jours reste le total', () => {
  const tickets = [];
  const lignes = [];
  for (let i = 0; i < 1500; i += 1) {
    const jour = `2026-10-${String((i % 30) + 1).padStart(2, '0')}`;
    tickets.push({ id: `g${i}`, numero: i + 1, annee: 2026, statut: 'encaisse', test: false, a_emporter: false, sur_table: true, origine: 'passage', jour, service: i % 2 ? 'soir' : 'midi', couverts: 2, created_at: `${jour}T11:00:00Z`, closed_at: `${jour}T12:00:00Z` });
    lignes.push({ id: `gl${i}`, ticket_id: `g${i}`, plat_id: 'p1', libelle: 'Plat', categorie: 'Plats', quantite: 1, prix_unitaire: 19.9 + (i % 7), taux_tva: 8.1, prix_origine: null });
  }
  const d = { niveau: 'cuisine', jour_courant: '2026-11-11', tickets, lignes, paiements: [], clotures: [], ventes_jour: [] };
  const periode = periodeLibre('2026-10-01', '2026-10-30');
  const r = rapportCaisse(d, periode);
  const tranches = Array.from({ length: 30 }, (_, k) => { const j = `2026-10-${String(k + 1).padStart(2, '0')}`; return { debut: j, fin: j }; });
  const serie = serieRapports(d, periode, tranches);
  assert.equal(serie.reduce((s, j) => s + j.synthese.tickets, 0), 1500);
  assert.equal(serie.reduce((s, j) => s + centimesDe(j.synthese.ttc), 0) / 100, r.synthese.ttc);
  assert.equal(serie.reduce((s, j) => s + centimesDe(j.synthese.tva), 0) / 100, r.synthese.tva);
});
