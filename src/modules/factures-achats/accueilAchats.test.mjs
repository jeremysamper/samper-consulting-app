// node --test : chiffres de l'accueil de Factures & achats (accueilAchats.js).
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { depensesSixMois, partsFournisseurs, prochainesEcheances, reperesAchats } from './accueilAchats.js';
import { depensesParMois, trierDocuments } from './analysesAchats.js';
import { totauxFactures } from '../inventaire/facturesLogic.js';

const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, regleLe: null, dateEcheance: null, ...o });
const AUJ = '2026-11-11';
const docs = [
  doc({ id: 'a', fournisseurNom: 'Transgourmet', dateDocument: '2026-10-06', totalHT: 1000, totalTTC: 1081, dateEcheance: '2026-11-01' }),
  doc({ id: 'b', fournisseurNom: 'Prodega', dateDocument: '2026-10-10', totalHT: 500, totalTTC: 540.5, dateEcheance: '2026-11-13' }),
  doc({ id: 'c', fournisseurNom: 'transgourmet', dateDocument: '2026-11-03', totalTTC: 300, dateEcheance: '2026-12-20' }),
  doc({ id: 'd', fournisseurNom: 'Laiterie', dateDocument: '2026-06-04', totalHT: 200, regleLe: '2026-06-30' }),
  doc({ id: 'e', fournisseurNom: 'Boucherie', dateDocument: '2026-04-04', totalHT: 100 }),
  doc({ id: 'f', fournisseurNom: 'Cave', dateDocument: '2026-09-04', totalHT: 50 }),
  doc({ id: 'g', fournisseurNom: 'Fromager', dateDocument: '2026-08-04', totalHT: 25 }),
  doc({ id: 'h', fournisseurNom: 'Bon', typeDocument: 'bon_livraison', dateDocument: '2026-11-05', totalHT: 999 }),
  doc({ id: 'i', fournisseurNom: 'Exclue', dateDocument: '2026-11-06', totalHT: 500, exclu: true, regleLe: '2026-11-07' }),
];

test('repères : mêmes comptes que les totaux des factures', () => {
  const r = reperesAchats(docs, AUJ);
  const t = totauxFactures(docs.filter(d => d.typeDocument === 'facture' || d.regleLe), AUJ);
  assert.equal(r.aRegler.n, t.aRegler.n);
  assert.equal(r.aRegler.n, 6);
  assert.equal(r.aRegler.montant, 1921.5);
  assert.equal(r.aRegler.sansTTC, 3);
  assert.equal(r.enRetard.n, 1);
  assert.equal(r.enRetard.montant, 1081);
  assert.equal(r.prochaine, '2026-11-13');
});

test('six mois : les derniers mois des dépenses par mois, le mois en cours en dernier', () => {
  const s = depensesSixMois(docs, AUJ);
  const douze = depensesParMois(trierDocuments(docs).factures, AUJ);
  assert.deepEqual(s.mois.map(m => m.cle), douze.mois.slice(-6));
  assert.equal(s.mois[5].cle, '2026-11');
  assert.equal(s.mois[5].valeur, 300);
  assert.equal(s.mois[4].valeur, 1500);
  assert.equal(s.mois[0].cle, '2026-06');
  assert.equal(s.mois[0].valeur, 200);
  assert.equal(s.mois[1].valeur, 0);
  assert.equal(s.total, 2075);
});

test('six mois : aucun montant, total null', () => {
  const s = depensesSixMois([doc({ id: 'x', dateDocument: '2026-11-02' })], AUJ);
  assert.equal(s.total, null);
  assert.equal(s.sansMontant, 1);
});

test('fournisseurs : regroupés, les premiers nommés, les suivants en une part', () => {
  const p = partsFournisseurs(docs, AUJ, 3);
  assert.equal(p.total, 2175);
  assert.match(p.lignes[0].label, /^transgourmet$/i);
  assert.equal(p.lignes[0].montant, 1300);
  assert.equal(p.lignes.length, 4);
  assert.equal(p.lignes[3].autres, true);
  assert.equal(p.lignes[3].n, 3);
  assert.equal(p.lignes[3].montant, 175);
  assert.equal(p.lignes.reduce((s, l) => s + l.montant, 0), p.total);
});

test('fournisseurs : sans montant, rien à répartir', () => {
  assert.deepEqual(partsFournisseurs([doc({ id: 'x', dateDocument: '2026-11-02' })], AUJ), { lignes: [], total: null });
});

test('échéances : en retard d\'abord, puis par échéance, puis sans échéance', () => {
  const e = prochainesEcheances(docs, AUJ, 4);
  assert.deepEqual(e.lignes.map(l => l.id), ['a', 'b', 'c', 'f']);
  assert.equal(e.lignes[0].enRetard, true);
  assert.equal(e.lignes[1].enRetard, false);
  assert.equal(e.lignes[3].montant, null);
  assert.equal(e.total, 6);
  assert.equal(e.reste, 2);
});
