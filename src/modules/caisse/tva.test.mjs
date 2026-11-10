// Jeux d'essai de calcul de la caisse v7, écrits AVANT le code et dérivés des
// règles du brief (2026-11-10, encaissement conforme et clôture) :
//   - prix TVA comprise ; la TVA de chaque taux se calcule par ticket sur le
//     total du taux, arrondie au centime : TVA = TTC x taux / (100 + taux) ;
//   - 8,1 % sur place, 2,6 % à emporter quand la catégorie l'autorise, l'alcool
//     reste à 8,1 % ;
//   - une remise baisse le prix net de la ligne, un offert est une ligne à 0
//     qui garde son prix d'origine ;
//   - plusieurs moyens de paiement, rendu en espèces, arrondi aux 5 centimes
//     sur la part payée en espèces seulement, écart d'arrondi à part ;
//   - le pourboire n'entre ni dans le total ni dans la base de TVA.
// Les totaux attendus sont calculés à la main (détail dans le rapport du lot).
// Les mêmes tickets sont joués en base par l'essai à blanc de la migration.
//
// Lancer : npm.cmd run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrondiCinqCentimes, detailTva, preparerPaiements, totalLignes, totalTva,
} from './tva.js';

const ligne = (quantite, prix_unitaire, taux_tva, extra = {}) => ({ quantite, prix_unitaire, taux_tva, ...extra });

// A. Sur place : deux entrecôtes, une tarte, une bouteille de vin, deux cafés.
//    84,00 + 12,50 + 58,00 + 9,00 = 163,50, tout à 8,1 %.
//    TVA = 163,50 x 8,1 / 108,1 = 12,2512 -> 12,25 ; hors TVA 151,25.
const A = [ligne(2, 42, 8.1), ligne(1, 12.5, 8.1), ligne(1, 58, 8.1), ligne(2, 4.5, 8.1)];

// B. Le même ticket à emporter : les plats, la tarte et les cafés passent à
//    2,6 %, le vin reste à 8,1 %.
//    2,6 % : 84,00 + 12,50 + 9,00 = 105,50 ; TVA = 105,50 x 2,6 / 102,6 = 2,6735 -> 2,67 ; hors TVA 102,83.
//    8,1 % : 58,00 ; TVA = 58,00 x 8,1 / 108,1 = 4,3460 -> 4,35 ; hors TVA 53,65.
const B = [ligne(2, 42, 2.6), ligne(1, 12.5, 2.6), ligne(1, 58, 8.1), ligne(2, 4.5, 2.6)];

// C. Remise de 10 % sur le ticket et un café offert.
//    Deux menus à 39,00 : 78,00 - 7,80 = 70,20 (prix net 35,10).
//    Un dessert à 11,00 : 11,00 - 1,10 = 9,90. Un café à 4,50 offert : 0,00.
//    Total 80,10 à 8,1 % ; TVA = 80,10 x 8,1 / 108,1 = 6,0019 -> 6,00 ; hors TVA 74,10.
//    Remises : 2 lignes, 8,90. Offerts : 1 ligne, valeur 4,50.
const C = [
  ligne(2, 35.1, 8.1, { prix_origine: 39, remise_montant: 7.8 }),
  ligne(1, 9.9, 8.1, { prix_origine: 11, remise_montant: 1.1 }),
  ligne(1, 0, 8.1, { prix_origine: 4.5, offert: true }),
];

// D. Deux moyens de paiement, arrondi, rendu et pourboire.
//    34,50 + 29,90 + 2 x 4,48 = 73,36 à 8,1 % ;
//    TVA = 73,36 x 8,1 / 108,1 = 5,4969 -> 5,50 ; hors TVA 67,86.
//    Carte 50,00 avec 5,00 de pourboire ; le reste, 23,36, en espèces :
//    arrondi à 23,35 (écart -0,01) ; 30,00 reçus, 6,65 rendus.
const D = [ligne(1, 34.5, 8.1), ligne(1, 29.9, 8.1), ligne(2, 4.48, 8.1)];

test('A, sur place : tout à 8,1 %', () => {
  assert.equal(totalLignes(A), 163.5);
  assert.deepEqual(detailTva(A), [{ taux: 8.1, ttc: 163.5, tva: 12.25, ht: 151.25 }]);
});

test("B, à emporter : 2,6 % sauf l'alcool resté à 8,1 %", () => {
  assert.equal(totalLignes(B), 163.5);
  assert.deepEqual(detailTva(B), [
    { taux: 8.1, ttc: 58, tva: 4.35, ht: 53.65 },
    { taux: 2.6, ttc: 105.5, tva: 2.67, ht: 102.83 },
  ]);
  assert.equal(totalTva(B), 7.02);
});

test('C, remise de 10 % et un offert', () => {
  assert.equal(totalLignes(C), 80.1);
  assert.deepEqual(detailTva(C), [{ taux: 8.1, ttc: 80.1, tva: 6, ht: 74.1 }]);
});

test('D, carte puis espèces : arrondi, rendu, pourboire à part', () => {
  assert.equal(totalLignes(D), 73.36);
  assert.deepEqual(detailTva(D), [{ taux: 8.1, ttc: 73.36, tva: 5.5, ht: 67.86 }]);
  const p = preparerPaiements({
    total: 73.36,
    arrondiEspeces: true,
    paiements: [
      { moyen: 'carte', montant: 50, pourboire: 5 },
      { moyen: 'especes', montant: 23.36, recu: 30 },
    ],
  });
  assert.equal(p.complet, true);
  assert.equal(p.reste, 0);
  assert.equal(p.arrondi, -0.01);
  assert.equal(p.rendu, 6.65);
  assert.equal(p.pourboire, 5);
  assert.deepEqual(p.paiements, [
    { moyen: 'carte', libelle: null, montant: 50, pourboire: 5, rendu: 0, arrondi: 0 },
    { moyen: 'especes', libelle: null, montant: 23.35, pourboire: 0, rendu: 6.65, arrondi: -0.01 },
  ]);
  // Ce que la maison garde : le total du ticket plus l'écart d'arrondi.
  assert.equal(p.encaisse, 73.35);
});

test('D bis, sans arrondi (réglage coupé) : les espèces au centime', () => {
  const p = preparerPaiements({
    total: 73.36,
    arrondiEspeces: false,
    paiements: [
      { moyen: 'carte', montant: 50 },
      { moyen: 'especes', montant: 23.36, recu: 23.4 },
    ],
  });
  assert.equal(p.arrondi, 0);
  assert.equal(p.rendu, 0.04);
  assert.equal(p.encaisse, 73.36);
});

test("arrondi aux 5 centimes : au plus près, jamais plus de 2 centimes d'écart", () => {
  const attendu = [
    [23.30, 23.30], [23.31, 23.30], [23.32, 23.30], [23.33, 23.35], [23.34, 23.35],
    [23.35, 23.35], [23.36, 23.35], [23.37, 23.35], [23.38, 23.40], [23.39, 23.40],
    [0.02, 0], [0.03, 0.05], [163.5, 163.5],
  ];
  attendu.forEach(([du, arrondi]) => assert.equal(arrondiCinqCentimes(du), arrondi, `${du}`));
});

test('la carte ne s\'arrondit jamais, même seule', () => {
  const p = preparerPaiements({ total: 73.36, arrondiEspeces: true, paiements: [{ moyen: 'carte', montant: 73.36 }] });
  assert.equal(p.arrondi, 0);
  assert.equal(p.encaisse, 73.36);
  assert.equal(p.complet, true);
});

test('paiement incomplet : le reste à payer est dit, rien ne se rend', () => {
  const p = preparerPaiements({ total: 73.36, arrondiEspeces: true, paiements: [{ moyen: 'carte', montant: 50 }] });
  assert.equal(p.complet, false);
  assert.equal(p.reste, 23.36);
  assert.equal(p.rendu, 0);
});

test('espèces reçues insuffisantes : incomplet', () => {
  const p = preparerPaiements({ total: 20, arrondiEspeces: true, paiements: [{ moyen: 'especes', montant: 20, recu: 10 }] });
  assert.equal(p.complet, false);
});

test('pourboire en espèces : il sort du rendu, pas du total', () => {
  // 46,50 dus, 50,00 donnés, « gardez la monnaie » : 3,50 de pourboire.
  const p = preparerPaiements({
    total: 46.5,
    arrondiEspeces: true,
    paiements: [{ moyen: 'especes', montant: 46.5, recu: 50, pourboire: 3.5 }],
  });
  assert.equal(p.rendu, 0);
  assert.equal(p.pourboire, 3.5);
  assert.equal(p.encaisse, 46.5);
  assert.equal(p.complet, true);
});

test('quantité à virgule : le total de ligne est arrondi au centime', () => {
  // 0,5 x 7,45 = 3,725 -> 3,73 (arrondi commercial, comme la base).
  assert.equal(totalLignes([ligne(0.5, 7.45, 8.1)]), 3.73);
});

test('clôture du jour : les quatre tickets, puis A annulé', () => {
  // Ventes : 8,1 % = 163,50 + 58,00 + 80,10 + 73,36 = 374,96, TVA 12,25 + 4,35 + 6,00 + 5,50 = 28,10 ;
  //          2,6 % = 105,50, TVA 2,67. Total 480,46, TVA 30,77.
  // La TVA du jour est la somme des TVA de chaque ticket, pas un recalcul sur le total du jour.
  const parTicket = [A, B, C, D].map(detailTva);
  const somme = (taux, cle) => Math.round(parTicket.flat().filter((t) => t.taux === taux).reduce((s, t) => s + t[cle] * 100, 0)) / 100;
  assert.equal(somme(8.1, 'ttc'), 374.96);
  assert.equal(somme(8.1, 'tva'), 28.1);
  assert.equal(somme(2.6, 'ttc'), 105.5);
  assert.equal(somme(2.6, 'tva'), 2.67);
  // Net après l'annulation de A : 8,1 % = 211,46, TVA 15,85.
  assert.equal(Math.round((374.96 - 163.5) * 100) / 100, 211.46);
  assert.equal(Math.round((28.1 - 12.25) * 100) / 100, 15.85);
});
