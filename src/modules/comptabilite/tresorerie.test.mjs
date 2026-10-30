// node --test : trésorerie prévisionnelle de la Comptabilité (tresorerie.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caMoyenParJour, lundiDe, previsionTresorerie } from './tresorerie.js';
import { ventesParJour } from './ventesCompta.js';

// Vendredi 30 octobre 2026 : la semaine en cours va du lundi 26 octobre au
// dimanche 1er novembre ; la huitième se termine le dimanche 20 décembre.
const AUJ = '2026-10-30';
const doc = (o) => ({ typeDocument: 'facture', exclu: false, regleLe: null, totalTTC: null, dateEcheance: null, ...o });
const DOCS = [
  doc({ id: 'retard', fournisseurNom: 'Prodega', totalTTC: 882.36, dateEcheance: '2026-10-27' }),
  doc({ id: 'sem2', fournisseurNom: 'Transgourmet', totalTTC: 1272.75, dateEcheance: '2026-11-05' }),
  doc({ id: 'sansttc', fournisseurNom: 'Laiterie', dateEcheance: '2026-11-06' }),
  doc({ id: 'loin', fournisseurNom: 'Fellay', totalTTC: 100, dateEcheance: '2027-02-01' }),
  doc({ id: 'sansech', fournisseurNom: 'Boucherie', totalTTC: 708.15 }),
  doc({ id: 'reglee', fournisseurNom: 'Fellay', totalTTC: 1567.45, dateEcheance: '2026-11-02', regleLe: '2026-10-25' }),
  doc({ id: 'bon', typeDocument: 'bon_livraison', totalTTC: 50, dateEcheance: '2026-11-02' }),
];

test('lundi de la semaine', () => {
  assert.equal(lundiDe(AUJ), '2026-10-26');
  assert.equal(lundiDe('2026-11-01'), '2026-10-26');
  assert.equal(lundiDe('2026-11-02'), '2026-11-02');
});

test('facture en retard dans la semaine 1, les autres à leur échéance ; réglées et bons hors prévision', () => {
  const p = previsionTresorerie({ aujourdhui: AUJ, docs: DOCS });
  assert.equal(p.semaines.length, 8);
  assert.deepEqual([p.debut, p.fin], ['2026-10-26', '2026-12-20']);
  assert.equal(p.semaines[0].sorties.factures, 882.36);
  assert.equal(p.semaines[0].detail.factures[0].enRetard, true);
  // Semaine du 2 novembre : Transgourmet, et la Laiterie sans TTC (non additionnée).
  assert.equal(p.semaines[1].sorties.factures, 1272.75);
  assert.equal(p.semaines[1].detail.factures.length, 2);
  assert.equal(p.sansTtc, 1);
  assert.deepEqual(p.sansEcheance, { n: 1, montant: 708.15 });
  assert.equal(p.plusTard, 1);
});

test('charge mensuelle au 5, trimestrielle au 15 ; échéance déjà passée cette semaine tenue pour payée', () => {
  const charges = [
    { id: 'leasing', libelle: 'Leasing du four', montant: 389, periodicite: 'mensuelle', jourEcheance: 5, debut: '2026-01-01', fin: null },
    { id: 'energie', libelle: 'Électricité', montant: 1450, periodicite: 'trimestrielle', jourEcheance: 15, debut: '2026-01-01', fin: null },
    { id: 'lundi', libelle: 'Logiciel', montant: 180, periodicite: 'mensuelle', jourEcheance: 26, debut: '2026-01-01', fin: null },
  ];
  const p = previsionTresorerie({ aujourdhui: AUJ, charges });
  const parSemaine = p.semaines.map(s => s.sorties.charges);
  // 5 novembre (semaine 2), 5 décembre (semaine 6) ; 26 novembre (semaine 5) ;
  // le 26 octobre est avant aujourd'hui ; le 15 octobre aussi ; prochain trimestre le 15 janvier.
  assert.deepEqual(parSemaine, [0, 389, 0, 0, 180, 389, 0, 0]);
});

test('salaires le dernier jour du mois, TVA à l\'échéance du décompte', () => {
  const p = previsionTresorerie({
    aujourdhui: AUJ,
    salaireMensuel: 9868.24,
    echeancesTva: [
      { date: '2026-11-29', montant: 5131.99, libelle: '3e trimestre 2026' },
      { date: '2027-03-01', montant: 4000, libelle: '4e trimestre 2026' },
      { date: '2026-10-29', montant: 10, libelle: 'passée' },
      { date: '2026-11-10', montant: -50, libelle: 'crédit' },
    ],
  });
  // 31 octobre (semaine 1) et 30 novembre (semaine 6).
  assert.deepEqual(p.semaines.map(s => s.sorties.salaires), [9868.24, 0, 0, 0, 0, 9868.24, 0, 0]);
  assert.deepEqual(p.semaines.map(s => s.sorties.tva), [0, 0, 0, 0, 5131.99, 0, 0, 0]);
  assert.equal(p.semaines[4].sorties.total, 5131.99);
});

test('entrées : jours restants de la semaine en cours, puis 7 jours ; solde depuis le relevé', () => {
  const p = previsionTresorerie({ aujourdhui: AUJ, docs: DOCS, caMoyenJour: 2500, soldeDepart: 15113.33 });
  // Vendredi, samedi, dimanche.
  assert.equal(p.semaines[0].entrees, 7500);
  assert.equal(p.semaines[1].entrees, 17500);
  assert.equal(p.semaines[0].solde, 15113.33 + 7500 - 882.36);
  assert.equal(p.semaines[1].solde, Math.round((15113.33 + 7500 - 882.36 + 17500 - 1272.75) * 100) / 100);
});

test('sans solde de départ : flux seuls ; trop peu de jours de chiffre d\'affaires : entrées inconnues', () => {
  const sans = previsionTresorerie({ aujourdhui: AUJ, docs: DOCS, caMoyenJour: 2500 });
  assert.equal(sans.semaines[0].solde, null);
  assert.equal(sans.semaines[0].cumul, 7500 - 882.36);
  const inconnues = previsionTresorerie({ aujourdhui: AUJ, docs: DOCS, caMoyenJour: null, soldeDepart: 1000 });
  assert.equal(inconnues.semaines[0].entrees, null);
  assert.equal(inconnues.semaines[0].solde, null);
  assert.equal(inconnues.semaines[0].flux, -882.36);
});

test('chiffre d\'affaires moyen : 28 derniers jours connus, par jour calendaire ; rien sous 7 jours', () => {
  const manuel = [];
  // 35 jours avant aujourd'hui, fermé le lundi, 1 000.00 par jour ouvert.
  for (let n = 1; n <= 35; n += 1) {
    const jour = new Date(Date.UTC(2026, 9, 30 - n)).toISOString().slice(0, 10);
    if (new Date(`${jour}T12:00:00Z`).getUTCDay() === 1) continue;
    manuel.push({ jour, taux: 8.1, montantTtc: 1000 });
  }
  const parJour = ventesParJour({ manuel });
  const m = caMoyenParJour(parJour, AUJ);
  assert.equal(m.jours, 28);
  assert.equal(m.fin, '2026-10-29');
  // 28 jours ouverts couvrent 33 jours calendaires (5 lundis fermés entre eux).
  assert.equal(m.debut, '2026-09-27');
  assert.equal(m.moyenne, Math.round((28000 / 33) * 100) / 100);
  const peu = caMoyenParJour(parJour.slice(-6), AUJ);
  assert.deepEqual([peu.moyenne, peu.jours], [null, 6]);
});
