// node --test : analyses des factures d'achat (analysesAchats.js) et leur
// série par tranche (module Statistiques).
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { depensesParMois, depensesParTranche, facturesDesDouzeMois, parFournisseur, trierDocuments } from './analysesAchats.js';

const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, tvaTaux: null, regleLe: null, ...o });
const docs = [
  doc({ id: 'a', fournisseurNom: 'Transgourmet', dateDocument: '2026-10-06', totalHT: 1240.5 }),
  doc({ id: 'b', fournisseurNom: 'Prodega', dateDocument: '2026-10-10', totalHT: 860 }),
  doc({ id: 'c', fournisseurNom: 'Transgourmet', dateDocument: '2026-11-03', totalTTC: 312.4 }),
  doc({ id: 'd', fournisseurNom: 'Laiterie', dateDocument: '2026-11-04', lignes: [{ montantLigne: 10.05 }, { montantLigne: 20.1 }] }),
  doc({ id: 'e', fournisseurNom: 'Sans montant', dateDocument: '2026-11-05' }),
  doc({ id: 'f', fournisseurNom: 'Bon', typeDocument: 'bon_livraison', dateDocument: '2026-11-05', totalHT: 999 }),
  doc({ id: 'g', fournisseurNom: 'Exclue', dateDocument: '2026-11-06', totalHT: 500, exclu: true }),
  doc({ id: 'h', fournisseurNom: 'Sans date', totalHT: 70 }),
];
const { factures } = trierDocuments(docs);
const AUJ = '2026-11-11';

test('série au mois : égale aux barres des dépenses par mois', () => {
  const mois = depensesParMois(factures, AUJ);
  const tranches = [{ debut: '2026-10-01', fin: '2026-10-31' }, { debut: '2026-11-01', fin: '2026-11-30' }];
  const serie = depensesParTranche(factures, tranches);
  assert.equal(serie[0].valeur, mois.points.find((p) => p.cle === '2026-10').valeur);
  assert.equal(serie[1].valeur, mois.points.find((p) => p.cle === '2026-11').valeur);
  assert.equal(serie[0].valeur, 2100.5);
  assert.equal(serie[1].valeur, 342.55);
  assert.equal(serie[1].n, 2);
  assert.equal(serie[1].sansMontant, 1);
});

test('série : la somme des jours est le total de la période, au centime', () => {
  const jours = [];
  for (let j = 1; j <= 30; j += 1) { const d = `2026-11-${String(j).padStart(2, '0')}`; jours.push({ debut: d, fin: d }); }
  const serie = depensesParTranche(factures, jours);
  const [tout] = depensesParTranche(factures, [{ debut: '2026-11-01', fin: '2026-11-30' }]);
  const somme = serie.reduce((s, p) => s + Math.round((p.valeur || 0) * 100), 0) / 100;
  assert.equal(somme, tout.valeur);
  assert.equal(serie.reduce((s, p) => s + p.n, 0), tout.n);
});

test('série : une tranche sans facture chiffrée vaut null, jamais zéro', () => {
  const serie = depensesParTranche(factures, [{ debut: '2026-09-01', fin: '2026-09-30' }, { debut: '2026-11-05', fin: '2026-11-05' }]);
  assert.equal(serie[0].valeur, null);
  assert.equal(serie[0].total, 0);
  // Le 5 novembre : une facture sans aucun montant (le bon n'est pas une facture).
  assert.equal(serie[1].valeur, null);
  assert.equal(serie[1].sansMontant, 1);
});

test('série : bons, factures exclues et factures sans date ne comptent pas', () => {
  const [tout] = depensesParTranche(factures, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  assert.equal(tout.valeur, 2443.05);
  assert.equal(tout.total, 5);
});

test('série : les factures de la tranche servent aux ventilations', () => {
  const [oct] = depensesParTranche(factures, [{ debut: '2026-10-01', fin: '2026-10-31' }]);
  const f = parFournisseur(oct.factures);
  assert.deepEqual(f.map((x) => [x.label, x.montant]), [['Transgourmet', 1240.5], ['Prodega', 860]]);
});

test('douze mois : la série sur les douze mois glissants rend le total des Analyses', () => {
  const mois = depensesParMois(factures, AUJ);
  const douze = facturesDesDouzeMois(factures, AUJ);
  const [tout] = depensesParTranche(douze, [{ debut: '2025-12-01', fin: '2026-11-30' }]);
  assert.equal(tout.valeur, mois.total.montant);
  assert.equal(tout.n, mois.total.n);
});

test('série : plus de mille factures, la somme des mois reste le total', () => {
  const beaucoup = [];
  for (let i = 0; i < 1200; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1 + (i % 365))).toISOString().slice(0, 10);
    beaucoup.push(doc({ id: `x${i}`, fournisseurNom: `F${i % 9}`, dateDocument: d, totalHT: 10.1 + (i % 13) }));
  }
  const mois = Array.from({ length: 12 }, (_, m) => ({ debut: `2026-${String(m + 1).padStart(2, '0')}-01`, fin: new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10) }));
  const serie = depensesParTranche(beaucoup, mois);
  const [tout] = depensesParTranche(beaucoup, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  assert.equal(serie.reduce((s, p) => s + Math.round(p.valeur * 100), 0) / 100, tout.valeur);
  assert.equal(serie.reduce((s, p) => s + p.n, 0), 1200);
});
