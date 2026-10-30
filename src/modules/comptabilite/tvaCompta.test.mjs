// node --test : état TVA de la Comptabilité (tvaCompta.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etatTva, periodeTva, periodeTvaParDefaut, tvaAchats } from './tvaCompta.js';
import { ventesParJour } from './ventesCompta.js';
import { lignesFiduciaire, totauxFiduciaire } from '../inventaire/exportFiduciaire.js';

// Pièces du banc (stub.js, restaurant etab-r), datées en octobre 2026.
const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, tvaTaux: null, montantTva: null, regleLe: null, ...o });
const docs = [
  doc({ id: 'tg', fournisseurNom: 'Transgourmet', dateDocument: '2026-10-06', totalHT: 1240.5, tvaTaux: 2.6, totalTTC: 1272.75, montantTva: 32.25 }),
  doc({ id: 'pr', fournisseurNom: 'Prodega', dateDocument: '2026-10-10', totalHT: 860, tvaTaux: 2.6, totalTTC: 882.36, montantTva: 22.36 }),
  doc({ id: 'fv', fournisseurNom: 'Fellay Vins', dateDocument: '2026-10-12', totalHT: 1450, tvaTaux: 8.1, totalTTC: 1567.45, montantTva: 117.45 }),
  doc({ id: 'bv', fournisseurNom: 'Boucherie du Village', dateDocument: '2026-10-21', totalHT: 690.2, tvaTaux: 2.6, totalTTC: 708.15, montantTva: 17.95 }),
  doc({ id: 'lv', fournisseurNom: 'Laiterie du Valais', dateDocument: '2026-10-26', totalTTC: 312.4 }),
  doc({ id: 'bl', fournisseurNom: 'Transgourmet', typeDocument: 'bon_livraison', dateDocument: '2026-10-05', totalHT: 1240.5 }),
  doc({ id: 're', fournisseurNom: 'Romande Énergie', dateDocument: '2026-10-18', totalHT: 1341.35, tvaTaux: 8.1, totalTTC: 1450, montantTva: 108.65 }),
  doc({ id: 'tg0', fournisseurNom: 'Transgourmet', dateDocument: '2026-09-20', totalHT: 2105, tvaTaux: 2.6, totalTTC: 2159.73, montantTva: 54.73 }),
  doc({ id: 'ex', fournisseurNom: 'Exclue', dateDocument: '2026-10-08', totalHT: 100, tvaTaux: 8.1, totalTTC: 108.1, exclu: true }),
];
const charges = [
  { id: 'c1', libelle: 'Loyer', categorie: 'loyer', montant: 6500, tvaTaux: 0, periodicite: 'mensuelle', debut: '2026-01-01', fin: null },
  { id: 'c2', libelle: 'Électricité et chauffage', categorie: 'energie', montant: 1450, tvaTaux: 8.1, periodicite: 'trimestrielle', debut: '2026-01-01', fin: null },
  { id: 'c3', libelle: 'Leasing du four', categorie: 'leasing', montant: 389, tvaTaux: 8.1, periodicite: 'mensuelle', debut: '2026-01-01', fin: null },
];
const OCT = { debut: '2026-10-01', fin: '2026-10-31' };
// 10 jours à 1 081.00 sur place et 102.60 à l'emporter.
const manuel = [];
for (let j = 1; j <= 10; j += 1) {
  const jour = `2026-10-${String(j).padStart(2, '0')}`;
  manuel.push({ jour, taux: 8.1, montantTtc: 1081 }, { jour, taux: 2.6, montantTtc: 102.6 });
}
const ventes = ventesParJour({ manuel });

test('périodes de décompte : trimestres, semestres, échéance à 60 jours', () => {
  const t3 = periodeTva('2026-10-30', 'effective', -1);
  assert.deepEqual([t3.debut, t3.fin, t3.echeance, t3.libelle], ['2026-07-01', '2026-09-30', '2026-11-29', '3e trimestre 2026']);
  const t4 = periodeTva('2026-10-30');
  assert.deepEqual([t4.debut, t4.fin, t4.libelle, t4.enCours], ['2026-10-01', '2026-12-31', '4e trimestre 2026', true]);
  const t4prec = periodeTva('2027-02-10', 'effective', -1);
  assert.deepEqual([t4prec.debut, t4prec.fin, t4prec.echeance], ['2026-10-01', '2026-12-31', '2027-03-01']);
  assert.equal(periodeTva('2027-01-05').libelle, '1er trimestre 2027');
  const s2 = periodeTva('2026-10-30', 'tdfn');
  assert.deepEqual([s2.debut, s2.fin, s2.libelle, s2.echeance], ['2026-07-01', '2026-12-31', '2e semestre 2026', '2027-03-01']);
  const s1 = periodeTva('2026-10-30', 'tdfn', -1);
  assert.deepEqual([s1.debut, s1.fin, s1.libelle, s1.echeance], ['2026-01-01', '2026-06-30', '1er semestre 2026', '2026-08-29']);
});

test('période montrée d\'abord : celle à déclarer tant que son échéance court', () => {
  assert.equal(periodeTvaParDefaut('2026-10-30').libelle, '3e trimestre 2026');
  assert.equal(periodeTvaParDefaut('2026-11-29').libelle, '3e trimestre 2026');
  assert.equal(periodeTvaParDefaut('2026-11-30').libelle, '4e trimestre 2026');
  assert.equal(periodeTvaParDefaut('2026-10-30', 'tdfn').libelle, '2e semestre 2026');
});

test('achats de l\'état TVA = totaux de l\'export fiduciaire du même intervalle', () => {
  const a = tvaAchats(docs, OCT);
  const t = totauxFiduciaire(lignesFiduciaire(docs, OCT));
  assert.equal(a.tva26, t.tva26);
  assert.equal(a.tva81, t.tva81);
  assert.equal(a.tva38, t.tva38);
  assert.equal(a.tvaAutre, t.tvaAutre);
  assert.equal(a.tva26, 72.56);
  assert.equal(a.tva81, 226.1);
  assert.equal(a.total, 298.66);
  assert.equal(a.factures, 6);
});

test('facture à vérifier sans TVA connue : non déduite, comptée', () => {
  const a = tvaAchats(docs, OCT);
  assert.equal(a.aVerifier, 1);
  assert.equal(a.nonDeduites, 1);
  // Taux absent mais deux totaux lus : la TVA est connue, elle est déduite.
  const b = tvaAchats([doc({ id: 'x', fournisseurNom: 'X', dateDocument: '2026-10-02', totalHT: 100, totalTTC: 108.1 })], OCT);
  assert.equal(b.aVerifier, 1);
  assert.equal(b.nonDeduites, 0);
  assert.equal(b.total, 8.1);
});

test('méthode effective : TVA des ventes moins achats et charges fixes', () => {
  const e = etatTva({ ventes, docs, charges, reglages: { methodeTva: 'effective' }, ...OCT });
  // Ventes : 10 810.00 à 8,1 % et 1 026.00 à 2,6 %.
  assert.equal(e.ventes.ttc, 11836);
  const v81 = e.ventes.parTaux.find(l => l.taux === 8.1);
  assert.equal(v81.ht, 10000);
  assert.equal(v81.tva, 810);
  assert.equal(e.ventes.parTaux.find(l => l.taux === 2.6).tva, 26);
  assert.equal(e.ventes.nbJours, 10);
  // Charges d'octobre entier : énergie 483.33 TTC (36.22 de TVA), leasing 389.00 (29.15) ; le loyer sans TVA n'y est pas.
  assert.deepEqual(e.charges.map(c => c.taux), [8.1]);
  assert.equal(e.chargesTva, 65.37);
  assert.equal(e.prealable, 364.03);
  assert.equal(e.due, 471.97);
});

test('période en cours : charges fixes jusqu\'à aujourd\'hui', () => {
  const e = etatTva({ ventes, docs, charges, reglages: {}, ...OCT, aujourdhui: '2026-10-15' });
  assert.equal(e.methode, 'effective');
  assert.ok(e.chargesTva < 65.37);
});

test('méthode TDFN : chiffre d\'affaires TVA comprise fois le taux saisi, sans impôt préalable', () => {
  const e = etatTva({ ventes, docs, charges, reglages: { methodeTva: 'tdfn', tauxTdfn: 5.1 }, ...OCT });
  assert.equal(e.methode, 'tdfn');
  assert.equal(e.due, 603.64);
  assert.equal(e.prealable, null);
  const sansTaux = etatTva({ ventes, docs, charges, reglages: { methodeTva: 'tdfn', tauxTdfn: null }, ...OCT });
  assert.equal(sansTaux.due, null);
});

test('sans vente connue : TVA due inconnue ; charges illisibles : sans charges', () => {
  const e = etatTva({ ventes: [], docs, charges: null, reglages: {}, ...OCT });
  assert.equal(e.due, null);
  assert.equal(e.chargesTva, null);
  assert.equal(e.chargesLues, false);
  assert.equal(e.prealable, 298.66);
});
