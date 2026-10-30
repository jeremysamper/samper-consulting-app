// node --test : synthèse d'une période de la Comptabilité (syntheseCompta.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthese, achatsPeriode, variationStock, ecart, ventesComparables } from './syntheseCompta.js';
import { resumeVentes, ventesParJour } from './ventesCompta.js';
import { periodeMois, periodesInventaire } from './periodesCompta.js';
import { depensesParMois, trierDocuments } from '../factures-achats/analysesAchats.js';

// Pièces du banc (stub.js, restaurant etab-r), datées en octobre 2026.
const doc = (o) => ({ typeDocument: 'facture', perimetre: 'Général', exclu: false, lignes: [], totalHT: null, totalTTC: null, tvaTaux: null, regleLe: null, ...o });
const docs = [
  doc({ id: 'tg', fournisseurNom: 'Transgourmet', dateDocument: '2026-10-06', totalHT: 1240.5, tvaTaux: 2.6, totalTTC: 1272.75 }),
  doc({ id: 'pr', fournisseurNom: 'Prodega', dateDocument: '2026-10-10', totalHT: 860, tvaTaux: 2.6, totalTTC: 882.36 }),
  doc({ id: 'fv', fournisseurNom: 'Fellay Vins', dateDocument: '2026-10-12', totalHT: 1450, tvaTaux: 8.1, totalTTC: 1567.45, regleLe: '2026-10-25' }),
  doc({ id: 'bv', fournisseurNom: 'Boucherie du Village', dateDocument: '2026-10-21', totalHT: 690.2, tvaTaux: 2.6, totalTTC: 708.15 }),
  doc({ id: 'lv', fournisseurNom: 'Laiterie du Valais', dateDocument: '2026-10-26', totalTTC: 312.4 }),
  doc({ id: 'bl', fournisseurNom: 'Transgourmet', typeDocument: 'bon_livraison', dateDocument: '2026-10-05', totalHT: 1240.5 }),
  doc({ id: 're', fournisseurNom: 'Romande Énergie', dateDocument: '2026-10-18', totalHT: 1341.35, tvaTaux: 8.1, totalTTC: 1450 }),
  doc({ id: 'tg0', fournisseurNom: 'Transgourmet', dateDocument: '2026-09-20', totalHT: 2105, tvaTaux: 2.6, totalTTC: 2159.73, regleLe: '2026-10-10' }),
];
const charges = [
  { id: 'c1', libelle: 'Loyer', categorie: 'loyer', montant: 6500, tvaTaux: 0, periodicite: 'mensuelle', debut: '2026-01-01', fin: null },
  { id: 'c2', libelle: 'Électricité et chauffage', categorie: 'energie', montant: 1450, tvaTaux: 8.1, periodicite: 'trimestrielle', debut: '2026-01-01', fin: null, fournisseur: 'Romande Énergie' },
];
const oct = periodeMois('2026-10-30');

test('un mois du banc : achats égaux à la barre d\'octobre des Analyses des dépenses', () => {
  const a = achatsPeriode(docs, oct);
  const barre = depensesParMois(trierDocuments(docs).factures, '2026-10-30').points.find(p => p.cle === '2026-10');
  assert.equal(a.achatsHt, barre.valeur);
  assert.equal(a.achatsHt, 5894.45);
  assert.equal(a.factures, 6);
  assert.equal(a.bons, 1);
  assert.equal(a.sansHt, 1);
  assert.equal(a.sansTaux, 1);
});

test('synthèse d\'octobre : marge, résultat avant personnel, doublon et manques', () => {
  const manuel = [];
  for (let j = 1; j <= 29; j += 1) if (j !== 12) manuel.push({ jour: `2026-10-${String(j).padStart(2, '0')}`, taux: 8.1, montantTtc: 1081 });
  const parJour = ventesParJour({ manuel, debut: oct.debut, fin: oct.fin });
  const ventes = resumeVentes({ parJour, joursOuverts: new Set(), debut: oct.debut, finEffective: '2026-10-30', aujourdhui: '2026-10-30' });
  const s = synthese({ periode: oct, aujourdhui: '2026-10-30', ventes, docs, charges, inventaires: [] });
  assert.equal(s.ca, 28000);
  assert.equal(s.matiere.ht, 5894.45);
  assert.equal(s.matiere.variationStock, null);
  assert.equal(s.margeBrute, 22105.55);
  // charges au prorata de 30 jours sur 31 : loyer 6 290.32 + énergie 467.74 TTC, 432.69 HT
  assert.equal(s.charges, 6723.01);
  assert.equal(s.resultat, 15382.54);
  assert.equal(s.avantPersonnel, true);
  assert.deepEqual(s.prorata, { ecoules: 30, total: 31 });
  assert.equal(Math.round(s.ratios.matierePct * 10) / 10, 21.1);
  assert.equal(s.ratios.personnelPct, null);
  assert.equal(s.doublons.length, 1);
  assert.deepEqual(s.manques.map(m => m.id), ['jours', 'sansHt', 'sansTaux', 'doublons']);
  assert.equal(s.manques[0].texte, '1 jour sans chiffre d\'affaires');
  assert.equal(s.manques[0].ecran, 'ventes');
});

test('chiffre d\'affaires inconnu : ratios et marge n/a ; aucune charge saisie signalée', () => {
  const ventes = resumeVentes({ parJour: [], joursOuverts: new Set(), debut: oct.debut, finEffective: '2026-10-30', aujourdhui: '2026-10-30' });
  const s = synthese({ periode: oct, aujourdhui: '2026-10-30', ventes, docs, charges: [] });
  assert.equal(s.ca, null);
  assert.equal(s.margeBrute, null);
  assert.equal(s.resultat, null);
  assert.equal(s.ratios.matierePct, null);
  assert.equal(s.charges, null);
  assert.equal(s.avantCharges, true);
  assert.ok(s.manques.some(m => m.id === 'aucuneCharge'));
  // table des charges illisible : rien n'est affirmé
  const sansTable = synthese({ periode: oct, aujourdhui: '2026-10-30', ventes, docs, charges: null });
  assert.ok(!sansTable.manques.some(m => m.id === 'aucuneCharge'));
});

test('résultat négatif', () => {
  const parJour = ventesParJour({ manuel: [{ jour: '2026-10-02', taux: 8.1, montantTtc: 1081 }] });
  const ventes = resumeVentes({ parJour, joursOuverts: new Set(['2026-10-02']), debut: oct.debut, finEffective: '2026-10-30', aujourdhui: '2026-10-30' });
  const s = synthese({ periode: oct, aujourdhui: '2026-10-30', ventes, docs, charges });
  assert.equal(s.ca, 1000);
  assert.ok(s.resultat < 0);
  assert.equal(s.resultat, round(1000 - 5894.45 - 6723.01));
});

test('période d\'inventaire : la variation de stock s\'ajoute aux achats', () => {
  const inventaires = [
    { date: '2026-09-30', statut: 'validé', nom: 'Général', valeurTotale: 8420.5 },
    { date: '2026-09-30', statut: 'validé', nom: 'Boissons', valeurTotale: 6210 },
    { date: '2026-10-25', statut: 'validé', nom: 'Général', valeurTotale: 7900 },
    { date: '2026-10-25', statut: 'validé', nom: 'Boissons', valeurTotale: 6000.5 },
  ];
  const [p] = periodesInventaire(inventaires, '2026-10-30');
  assert.equal(p.debut, '2026-10-01');
  assert.equal(p.fin, '2026-10-25');
  const v = variationStock(inventaires, p);
  assert.equal(v.stockDebut, 14630.5);
  assert.equal(v.stockFin, 13900.5);
  assert.equal(v.valeur, 730);
  const s = synthese({ periode: p, aujourdhui: '2026-10-30', ventes: null, docs, charges, inventaires });
  // achats du 1er au 25 octobre : sans la Laiterie du 26
  assert.equal(s.matiere.achatsHt, round(5894.45 - 312.4));
  assert.equal(s.matiere.ht, round(5894.45 - 312.4 + 730));
  const ouverte = periodesInventaire(inventaires, '2026-10-30')[1];
  const s2 = synthese({ periode: ouverte, aujourdhui: '2026-10-30', ventes: null, docs, charges, inventaires });
  assert.equal(s2.matiere.variationStock, null);
  assert.ok(s2.manques.some(m => m.id === 'inventaire'));
});

test('période précédente incomplète : chiffre d\'affaires non comparable', () => {
  assert.equal(ventesComparables({ ht: 1000, avec: 1, attendus: 30 }), false);
  assert.equal(ventesComparables({ ht: 1000, avec: 24, attendus: 30 }), true);
  assert.equal(ventesComparables({ ht: null, avec: 0, attendus: 30 }), false);
  assert.equal(ventesComparables(null), false);
});

test('écart avec la période précédente', () => {
  assert.equal(ecart(64210, 59400), '+8 %');
  assert.equal(ecart(4640, 4800), '-3 %');
  assert.equal(ecart(100, 100), '0 %');
  assert.equal(ecart(100, null), 'n/a');
  assert.equal(ecart(100, 0), 'n/a');
  assert.equal(ecart(null, 100), 'n/a');
});

function round(n) { return Math.round(n * 100) / 100; }
