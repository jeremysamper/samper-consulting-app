// Addition partagée (lot L1) : parts par plat, parts égales, pourboire.
// node --test src/modules/caisse/partage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lignesParPlat, montantUnites, partParPlat, partsEgales, pourboireDe, unitesDe, unitesReglees } from './partage.js';
import { centimes, totalLignes } from './tva.js';

const L = [
  { id: 'a', quantite: 2, prix_unitaire: 12.5 },   // 25.00
  { id: 'b', quantite: 1, prix_unitaire: 34 },     // 34.00
  { id: 'c', quantite: 3, prix_unitaire: 6.5 },    // 19.50
  { id: 'd', quantite: 0.35, prix_unitaire: 48 },  // 16.80, au poids
];
const TOTAL = totalLignes(L); // 95.30
const somme = (xs) => xs.reduce((s, x) => s + centimes(x), 0) / 100;

test('unités : une quantité entière se coche unité par unité, le reste compte pour une', () => {
  assert.equal(unitesDe(L[0]), 2);
  assert.equal(unitesDe(L[3]), 1);
  assert.equal(unitesDe({ quantite: 0 }), 1);
});

test('montant des unités : la somme des parts fait toujours le total de la ligne', () => {
  const remisee = { id: 'r', quantite: 3, prix_unitaire: 3.3333 }; // 10.00 après une remise
  const parts = [montantUnites(remisee, 0, 1), montantUnites(remisee, 1, 1), montantUnites(remisee, 2, 1)];
  assert.deepEqual(parts, [3.33, 3.34, 3.33]);
  assert.equal(somme(parts), 10);
  assert.equal(montantUnites(L[2], 1, 5), 13); // borné aux unités restantes
  assert.equal(montantUnites(L[2], 3, 1), 0);
});

test('par plat : la part suit les cases cochées, bornée au reste', () => {
  const r = partParPlat({ lignes: L, poses: [], choix: { a: 1, b: 1 }, reste: TOTAL });
  assert.equal(r.part, 46.5);
  assert.deepEqual(r.unites, { a: 1, b: 1 });
  assert.equal(partParPlat({ lignes: L, poses: [], choix: { b: 1 }, reste: 20 }).part, 20);
});

test('par plat : les lignes réglées restent marquées et ne se recochent pas', () => {
  const poses = [
    { moyen: 'carte', montant: 46.5, partage: { mode: 'plat', unites: { a: 1, b: 1 } } },
    { moyen: 'especes', montant: 6.5, partage: { mode: 'plat', unites: { c: 1 } } },
    { moyen: 'twint', montant: 10 }, // au montant libre : ne marque rien
  ];
  assert.deepEqual(unitesReglees(poses), { a: 1, b: 1, c: 1 });
  const etat = lignesParPlat(L, poses, { a: 2, b: 1, c: 2 });
  assert.deepEqual(etat.map((e) => [e.reglees, e.restant, e.coche]), [[1, 1, 1], [1, 0, 0], [1, 2, 2], [0, 1, 0]]);
  assert.deepEqual(etat.map((e) => e.montantRestant), [12.5, 0, 13, 16.8]);
  const r = partParPlat({ lignes: L, poses, choix: { a: 2, b: 1, c: 2 }, reste: 32.3 });
  assert.equal(r.part, 25.5);
  assert.deepEqual(r.unites, { a: 1, c: 2 });
});

test('par plat : tout cocher, plat après plat, règle le ticket au centime', () => {
  const poses = [];
  L.forEach((l) => {
    const reste = Math.round((TOTAL - somme(poses.map((p) => p.montant))) * 100) / 100;
    const { part, unites } = partParPlat({ lignes: L, poses, choix: { [l.id]: unitesDe(l) }, reste });
    poses.push({ montant: part, partage: { mode: 'plat', unites } });
  });
  assert.equal(somme(poses.map((p) => p.montant)), TOTAL);
});

test('parts égales : la dernière absorbe l arrondi au centime', () => {
  const r = partsEgales({ total: 100, poses: [], n: 3, reste: 100 });
  assert.deepEqual(r.montants, [33.33, 33.33, 33.34]);
  assert.equal(r.part, 33.33);
  const poses = [{ montant: 33.33, partage: { mode: 'parts' } }, { montant: 33.33, partage: { mode: 'parts' } }];
  const fin = partsEgales({ total: 100, poses, n: 3, reste: 33.34 });
  assert.equal(fin.payees, 2);
  assert.equal(fin.part, 33.34);
});

test('parts égales : de 2 à 12 parts, chaque partage retombe sur le total', () => {
  for (let n = 1; n <= 13; n += 1) {
    const r = partsEgales({ total: 95.3, poses: [], n, reste: 95.3 });
    assert.ok(r.n >= 2 && r.n <= 12);
    assert.equal(somme(r.montants), 95.3);
    assert.ok(r.montants.every((m) => m === r.montants[0] || m === r.montants[r.n - 1]));
  }
  // 11 centimes en 4 : jamais une part du milieu plus grosse que les autres.
  assert.deepEqual(partsEgales({ total: 0.11, poses: [], n: 4, reste: 0.11 }).montants, [0.02, 0.02, 0.02, 0.05]);
});

test('parts égales : la base exclut ce qui a été réglé autrement', () => {
  const poses = [{ montant: 34, partage: { mode: 'plat', unites: { b: 1 } } }];
  const r = partsEgales({ total: TOTAL, poses, n: 2, reste: 61.3 });
  assert.equal(r.base, 61.3);
  assert.deepEqual(r.montants, [30.65, 30.65]);
  // Toutes les parts réglées : plus rien à proposer.
  const toutes = [...poses, { montant: 30.65, partage: { mode: 'parts' } }, { montant: 30.65, partage: { mode: 'parts' } }];
  assert.equal(partsEgales({ total: TOTAL, poses: toutes, n: 2, reste: 0 }).part, 0);
});

test('parts égales : la part ne dépasse jamais le reste à payer', () => {
  assert.equal(partsEgales({ total: 100, poses: [], n: 2, reste: 30 }).part, 30);
});

test('pourboire : 5, 10 ou 15 % de la part, ou un montant libre', () => {
  assert.equal(pourboireDe(41.5, '10'), 4.15);
  assert.equal(pourboireDe(33.33, '15'), 5);
  assert.equal(pourboireDe(32.5, '5'), 1.63);
  assert.equal(pourboireDe(41.5, 'aucun'), 0);
  assert.equal(pourboireDe(41.5, '20'), 0);
  assert.equal(pourboireDe(41.5, 'libre', '3,5'), 3.5);
  assert.equal(pourboireDe(41.5, 'libre', '-2'), 0);
  assert.equal(pourboireDe(41.5, 'libre', 'abc'), 0);
});
