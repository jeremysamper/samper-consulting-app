// node --test : devis, factures et paiements des groupes (calculs.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centimes, chf, csvFacturation, etatDevis, etatFacture, lignesAcompte, lignesDepuisGroupe,
  lignesEnregistrables, lignesSolde, montantLigne, planTranches, rafraichirDeductions,
  reperesFacturation, suiviDevis, totaux, ajouterJours, joursEntre,
} from './calculs.js';

const DEVIS = [
  { libelle: 'Menu Prestige', quantite: 50, prixUnitaire: 95, tvaTaux: 8.1 },
  { libelle: 'Remise', quantite: 1, prixUnitaire: -100.5, tvaTaux: 8.1 },
  { libelle: 'Chambres', quantite: 2, prixUnitaire: 150, tvaTaux: 3.8 },
  { libelle: 'Taxe de séjour', quantite: 1, prixUnitaire: 20, tvaTaux: 0 },
];

test('ligne : arrondi au centime, demi loin de zéro, comme la base', () => {
  assert.equal(montantLigne({ quantite: 50, prixUnitaire: 95 }), 4750);
  assert.equal(montantLigne({ quantite: 0.5, prixUnitaire: 0.05 }), 0.03);
  assert.equal(montantLigne({ quantite: 0.5, prixUnitaire: -0.05 }), -0.03);
  assert.equal(montantLigne({ quantite: 3, prixUnitaire: 19.9 }), 59.7);
  assert.equal(montantLigne({ quantite: 'x', prixUnitaire: 3 }), 0);
});

test('totaux : TVA incluse par taux, hors TVA sans TVA', () => {
  const t = totaux(DEVIS);
  assert.equal(t.total, 4969.5);
  assert.deepEqual(t.parTaux, [
    { taux: 8.1, base: 4649.5, tva: 348.39 },
    { taux: 3.8, base: 300, tva: 10.98 },
    { taux: 0, base: 20, tva: 0 },
  ]);
  assert.equal(t.tva, 359.37);
});

test('tranches : une fois, acompte + solde, échéances ; la somme fait le total', () => {
  assert.deepEqual(planTranches('une_fois', 4969.5), [{ type: 'totale', libelle: 'Facture', montant: 4969.5 }]);
  const as = planTranches('acompte_solde', 4969.5, { pct: 30 });
  assert.deepEqual(as.map((t) => t.montant), [1490.85, 3478.65]);
  assert.equal(as[0].libelle, 'Acompte 30 %');
  const ech = planTranches('echeances', 4969.5, { parts: [{ pct: 30 }, { montant: '1000' }, {}] });
  assert.deepEqual(ech.map((t) => [t.type, t.montant]), [['acompte', 1490.85], ['acompte', 1000], ['solde', 2478.65]]);
  // Arrondi aux 5 centimes pour une tranche intermédiaire.
  assert.equal(planTranches('acompte_solde', 1000.33, { pct: 33 })[0].montant, 330.1);
});

test('acompte : réparti au prorata des taux, sans perdre un centime', () => {
  const l = lignesAcompte(DEVIS, 1490.85, 'Acompte 30 %', 'DEV-2026-0001');
  assert.deepEqual(l.map((x) => [x.tvaTaux, x.prixUnitaire]), [[8.1, 1394.85], [3.8, 90], [0, 6]]);
  assert.equal(totaux(l).total, 1490.85);
  assert.match(l[0].libelle, /^Acompte 30 % sur DEV-2026-0001, part à 8,1 %$/);
  // Un seul taux : pas de mention de part.
  const un = lignesAcompte([{ quantite: 10, prixUnitaire: 50, tvaTaux: 8.1 }], 150, 'Acompte');
  assert.deepEqual(un.map((x) => [x.libelle, x.prixUnitaire]), [['Acompte', 150]]);
});

test('solde : lignes du devis moins les acomptes, par taux ; déductions recalculées', () => {
  const acompte = { id: 'f1', numero: 'FAC-2026-0003', statut: 'emise', lignes: lignesAcompte(DEVIS, 1490.85) };
  const solde = lignesSolde(DEVIS, [acompte, { id: 'f9', statut: 'annulee', lignes: [{ quantite: 1, prixUnitaire: 99 }] }]);
  assert.equal(totaux(solde).total, 3478.65);
  const t = totaux(solde).parTaux.find((g) => g.taux === 3.8);
  assert.equal(t.base, 210);
  assert.equal(solde.filter((l) => l.deduction).length, 3);
  assert.equal(solde.at(-1).libelle, 'Acompte FAC-2026-0003 déduit');
  // Une boisson ajoutée reste, les déductions suivent les acomptes du moment.
  const ajuste = [...solde, { libelle: 'Vins', quantite: 12, prixUnitaire: 38, tvaTaux: 8.1 }];
  const refait = rafraichirDeductions(ajuste, []);
  assert.equal(totaux(refait).total, 4969.5 + 456);
});

test('enregistrement : nombres normalisés, lignes vides retirées', () => {
  const l = lignesEnregistrables([
    { libelle: ' Menu ', quantite: '12,5', prixUnitaire: "1'234,567", tvaTaux: '3.8' },
    { libelle: '', quantite: 1, prixUnitaire: 0 },
    { libelle: 'Acompte déduit', quantite: 1, prixUnitaire: -10, tvaTaux: 8.1, deduction: 'f1', bruit: 1 },
  ]);
  assert.equal(l.length, 2);
  assert.deepEqual([l[0].libelle, l[0].quantite, l[0].prixUnitaire, l[0].tvaTaux], ['Menu', 12.5, 1234.57, 3.8]);
  assert.equal(l[1].deduction, 'f1');
  assert.equal('bruit' in l[1], false);
});

test('état d\'une facture : prévue, à payer, partielle, en retard, payée, annulée', () => {
  const f = { id: 'f1', statut: 'emise', montant: 1000, echeance: '2026-12-01' };
  const p = [{ factureId: 'f1', montant: 400 }, { factureId: 'autre', montant: 999 }];
  assert.deepEqual(etatFacture({ ...f, statut: 'prevue' }, p, '2026-11-23'), { etat: 'prevue', paye: 0, reste: 1000 });
  assert.equal(etatFacture(f, [], '2026-11-23').etat, 'a_payer');
  assert.deepEqual(etatFacture(f, p, '2026-11-23'), { etat: 'partiel', paye: 400, reste: 600, tropPercu: 0 });
  assert.equal(etatFacture(f, p, '2026-12-02').etat, 'en_retard');
  assert.equal(etatFacture(f, [...p, { factureId: 'f1', montant: 600 }], '2026-12-02').etat, 'payee');
  assert.equal(etatFacture(f, [...p, { factureId: 'f1', montant: 700 }], '2026-12-02').tropPercu, 100);
  assert.equal(etatFacture({ ...f, statut: 'annulee' }, p, '2026-11-23').etat, 'annulee');
});

test('devis expiré, suivi d\'un devis, repères', () => {
  assert.equal(etatDevis({ statut: 'envoye', valideJusqu: '2026-11-01' }, '2026-11-23'), 'expire');
  assert.equal(etatDevis({ statut: 'accepte', valideJusqu: '2026-11-01' }, '2026-11-23'), 'accepte');
  const devis = [{ id: 'd1', statut: 'accepte', total: 4969.5 }, { id: 'd2', statut: 'envoye', total: 800, valideJusqu: '2026-12-31' }];
  const factures = [
    { id: 'f1', devisId: 'd1', statut: 'emise', montant: 1490.85, echeance: '2026-11-01', numero: 'FAC-2026-0001', clientNom: 'Dupont', lignes: lignesAcompte(DEVIS, 1490.85), type: 'acompte', dateFacture: '2026-10-20' },
    { id: 'f2', devisId: 'd1', statut: 'prevue', montant: 3478.65 },
  ];
  const paiements = [{ id: 'p1', factureId: 'f1', montant: 490.85, datePaiement: '2026-11-05', mode: 'twint' }];
  assert.deepEqual(suiviDevis(devis[0], factures, paiements), {
    factures: factures, facture: 1490.85, prevu: 3478.65, encaisse: 490.85, resteAFacturer: 0,
  });
  assert.deepEqual(reperesFacturation({ devis, factures, paiements }, '2026-11-23'), {
    devisEnCours: 1, montantDevisEnCours: 800, aEncaisser: 1000, nbAEncaisser: 1, enRetard: 1000, nbEnRetard: 1, encaisseMois: 490.85,
  });
  const csv = csvFacturation({ factures, paiements }, '2026-11-23');
  assert.ok(csv.startsWith('﻿Numéro;Date;Échéance;Client'));
  assert.match(csv, /FAC-2026-0001;20\.10\.2026;01\.11\.2026;Dupont;;Acompte;En retard;1490\.85;1394\.85;104\.52;90\.00;3\.29;0\.00;0\.00;6\.00;0\.00;490\.85;1000\.00/);
  assert.match(csv, /1;05\.11\.2026;FAC-2026-0001;Dupont;TWINT;;490\.85/);
});

test('devis depuis un groupe : menu aux adultes, ligne enfant, sans menu', () => {
  const groupe = { typeGroupe: 'mariage', menuNumero: 3, nbPax: 50, nbEnfants: 4, dateEvenement: '2027-06-14', choix: {} };
  const l = lignesDepuisGroupe({ groupe, menu: { numero: 3, nom: 'Prestige', prixPax: 119, lignes: [], regles: {} }, complements: null, menus: [] });
  assert.deepEqual(l.map((x) => [x.libelle, x.quantite, x.prixUnitaire]), [['Menu Prestige', 46, 119], ['Menu enfant', 4, 0]]);
  assert.equal(l[0].detail, 'Mariage n°3');
  const sans = lignesDepuisGroupe({ groupe: { typeGroupe: 'seminaire', nbPax: 20 }, menu: null });
  assert.deepEqual(sans.map((x) => [x.libelle, x.quantite]), [['Séminaire', 20]]);
});

test('formats', () => {
  assert.equal(chf(1234567.5), "1'234'567.50");
  assert.equal(chf(-12), '-12.00');
  assert.equal(centimes(1394.85), 139485);
  assert.equal(ajouterJours('2026-12-20', 30), '2027-01-19');
  assert.equal(joursEntre('2026-12-07', '2027-01-06'), 30);
  assert.equal(joursEntre('', '2027-01-06'), null);
});
