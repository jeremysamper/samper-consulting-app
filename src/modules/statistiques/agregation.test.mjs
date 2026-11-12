// node --test : découpage en pas et lecture par nature (agregation.js),
// échelles (echelles.js) et vue (vueStatistiques.js) du module Statistiques.
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bornesTranche, dernierReleve, ecartArrondi, ecartDe, libelleTranche, pasPossibles, semaineIso, sommeFlux, trancheEntiere,
  tranchesDe, valeurPeriode,
} from './agregation.js';
import { echelleDe, nombreDe, plafondRond, positionSur, rangsEtiquettes, valeurTableur } from './echelles.js';
import {
  ajouterGraphique, bornesDe, bornesDeComparaison, nettoyerVue, peutCocher, retirerGraphique, typeRetenu, typesValides,
  vueDepuisLien, vueParDefaut,
} from './vueStatistiques.js';

// ── Tranches ──
test('pas jour : un jour par tranche, bornes comprises', () => {
  const t = tranchesDe('2026-11-09', '2026-11-11', 'jour');
  assert.deepEqual(t.map((x) => x.debut), ['2026-11-09', '2026-11-10', '2026-11-11']);
  assert.ok(t.every((x) => x.debut === x.fin && x.complet));
  assert.deepEqual(tranchesDe('2026-11-11', '2026-11-09', 'jour'), []);
});

test('pas semaine : du lundi au dimanche, les semaines du bord sont coupées et marquées', () => {
  // Du mercredi 11 au mardi 24 novembre 2026 : trois semaines ISO touchées.
  const t = tranchesDe('2026-11-11', '2026-11-24', 'semaine');
  assert.deepEqual(t.map((x) => [x.cle, x.debut, x.fin, x.complet]), [
    ['2026-11-09', '2026-11-11', '2026-11-15', false],
    ['2026-11-16', '2026-11-16', '2026-11-22', true],
    ['2026-11-23', '2026-11-23', '2026-11-24', false],
  ]);
});

test('semaines ISO au bord de l\'année : semaine 53 de 2026, semaine 1 de 2025 commencée en 2024', () => {
  assert.deepEqual(semaineIso('2026-12-28'), { annee: 2026, semaine: 53 });
  assert.deepEqual(semaineIso('2027-01-03'), { annee: 2026, semaine: 53 });
  assert.deepEqual(semaineIso('2027-01-04'), { annee: 2027, semaine: 1 });
  assert.deepEqual(semaineIso('2024-12-30'), { annee: 2025, semaine: 1 });
  assert.deepEqual(semaineIso('2026-01-01'), { annee: 2026, semaine: 1 });
  const t = tranchesDe('2026-12-28', '2027-01-10', 'semaine');
  assert.deepEqual(t.map((x) => libelleTranche(x)), ['S53 2026', 'S01 2027']);
  assert.deepEqual(t.map((x) => libelleTranche(x, { court: true })), ['S53', 'S01']);
});

test('pas mois : mois civils, premier et dernier coupés par la période', () => {
  const t = tranchesDe('2026-01-15', '2026-03-10', 'mois');
  assert.deepEqual(t.map((x) => [x.cle, x.debut, x.fin, x.complet]), [
    ['2026-01', '2026-01-15', '2026-01-31', false],
    ['2026-02', '2026-02-01', '2026-02-28', true],
    ['2026-03', '2026-03-01', '2026-03-10', false],
  ]);
  assert.equal(tranchesDe('2024-02-01', '2024-02-29', 'mois')[0].fin, '2024-02-29');
  assert.equal(libelleTranche(t[1]), '02.2026');
});

test('changements d\'heure à Zurich : aucun jour perdu ni doublé', () => {
  // Heure d'été le dimanche 29 mars 2026, heure d'hiver le dimanche 25 octobre.
  assert.deepEqual(tranchesDe('2026-03-28', '2026-03-30', 'jour').map((x) => x.debut), ['2026-03-28', '2026-03-29', '2026-03-30']);
  assert.deepEqual(tranchesDe('2026-10-24', '2026-10-26', 'jour').map((x) => x.debut), ['2026-10-24', '2026-10-25', '2026-10-26']);
  const mars = tranchesDe('2026-03-23', '2026-04-05', 'semaine');
  assert.deepEqual(mars.map((x) => [x.debut, x.fin]), [['2026-03-23', '2026-03-29'], ['2026-03-30', '2026-04-05']]);
  assert.equal(tranchesDe('2026-01-01', '2026-12-31', 'jour').length, 365);
  assert.equal(tranchesDe('2026-10-01', '2026-10-31', 'jour').length, 31);
});

test('plus de mille tranches : trois ans au pas jour, sans trou ni recouvrement', () => {
  const t = tranchesDe('2024-01-01', '2026-12-31', 'jour');
  assert.equal(t.length, 366 + 365 + 365);
  assert.equal(new Set(t.map((x) => x.cle)).size, t.length);
  assert.equal(t[t.length - 1].fin, '2026-12-31');
});

test('libellés chiffrés, les mêmes dans toutes les langues', () => {
  const [j] = tranchesDe('2026-11-11', '2026-11-11', 'jour');
  assert.equal(libelleTranche(j), '11.11.2026');
  assert.equal(libelleTranche(j, { court: true }), '11.11');
  assert.equal(bornesTranche(tranchesDe('2026-11-11', '2026-11-24', 'semaine')[1]), '16.11.2026 → 22.11.2026');
  assert.equal(trancheEntiere('2026-11-01', '2026-11-30').pas, 'periode');
});

// ── Natures ──
test('flux : somme au centime, null quand aucun point n\'a de valeur', () => {
  assert.equal(sommeFlux([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sommeFlux([10.05, null, 20.1]), 30.15);
  assert.equal(sommeFlux([null, null]), null);
  assert.equal(sommeFlux([]), null);
});

test('taux : la période vaut ce que rend la fonction d\'origine, jamais la moyenne des points', () => {
  // Deux jours : 1 no-show sur 2, puis 0 sur 8 ; sur la période 1 sur 10.
  const points = [0.5, 0];
  assert.equal(valeurPeriode('taux', { surPeriode: 0.1, valeurs: points }), 0.1);
  assert.notEqual(valeurPeriode('taux', { surPeriode: 0.1, valeurs: points }), (0.5 + 0) / 2);
  assert.equal(valeurPeriode('taux', { surPeriode: null, valeurs: points }), null);
});

test('stock : ne s\'additionne pas, la période vaut le dernier relevé', () => {
  assert.equal(dernierReleve([4000, null, 4932, null]), 4932);
  assert.equal(valeurPeriode('stock', { surPeriode: 99999, valeurs: [4000, 4932] }), 4932);
  assert.equal(valeurPeriode('stock', { valeurs: [null, null] }), null);
});

test('écart d\'arrondi d\'un flux : zéro quand la somme fait le total, sinon dit', () => {
  assert.equal(ecartArrondi([319.48, 155.4], 474.88), 0);
  assert.equal(ecartArrondi([925.07, 925.07, 925.07], 2775.23), -0.02);
  assert.equal(ecartArrondi([null, null], 10), null);
  assert.equal(ecartArrondi([1, 2], null), null);
});

test('écart avec la comparaison : n/a quand une valeur manque ou que la base est nulle', () => {
  assert.deepEqual(ecartDe(120, 100), { valeur: 20, pct: 0.2 });
  assert.deepEqual(ecartDe(80, 100), { valeur: -20, pct: -0.2 });
  assert.deepEqual(ecartDe(50, 0), { valeur: 50, pct: null });
  assert.deepEqual(ecartDe(null, 100), { valeur: null, pct: null });
  assert.deepEqual(ecartDe(100, null), { valeur: null, pct: null });
  assert.equal(ecartDe(-50, -100).pct, 0.5);
});

test('pas possibles : le pas jour disparaît au-delà de 400 jours', () => {
  assert.deepEqual(pasPossibles('2026-01-01', '2026-12-31'), ['jour', 'semaine', 'mois']);
  assert.deepEqual(pasPossibles('2025-01-01', '2026-12-31'), ['semaine', 'mois']);
});

// ── Échelles et formats ──
test('échelle : plafond rond, part de zéro, descend sous zéro seulement au besoin', () => {
  assert.equal(plafondRond(4200), 5000);
  assert.equal(plafondRond(0), 1);
  assert.equal(plafondRond(0.17), 0.2);
  assert.deepEqual(echelleDe([120, null, 480]), { min: 0, max: 500, graduations: [0, 250, 500] });
  assert.deepEqual(echelleDe([-48, 203.4]), { min: -50, max: 250, graduations: [-50, 0, 250] });
  assert.deepEqual(echelleDe([null]), { min: 0, max: 1, graduations: [0, 0.5, 1] });
  assert.equal(positionSur({ min: 0, max: 500 }, 250), 0.5);
  assert.equal(positionSur({ min: 0, max: 500 }, null), null);
});

test('formats : n/a pour une valeur absente, jamais zéro ; pour cent depuis un rapport', () => {
  assert.equal(nombreDe(null, 'chf'), 'n/a');
  assert.equal(nombreDe(undefined, 'nombre'), 'n/a');
  assert.equal(nombreDe(0, 'nombre'), '0');
  assert.equal(nombreDe(0.172, 'pct'), '17,2');
  assert.equal(nombreDe(3.5, 'nombre'), '3,5');
  assert.equal(nombreDe(52, 'min'), '52');
  assert.match(nombreDe(1234.5, 'chf'), /^1.234,50$|^1.234\.50$/);
  assert.equal(valeurTableur(0.1725, 'pct'), 17.25);
  assert.equal(valeurTableur(null, 'chf'), null);
});

test('étiquettes de l\'axe : la première, la dernière, un pas régulier', () => {
  assert.deepEqual(rangsEtiquettes(5), [0, 1, 2, 3, 4]);
  const r = rangsEtiquettes(365, 7);
  assert.equal(r[0], 0);
  assert.equal(r[r.length - 1], 364);
  assert.ok(r.length <= 7);
  assert.deepEqual(rangsEtiquettes(0), []);
});

// ── Vue ──
const M = (id, unite, famille = 'caisse', extra = {}) => ({ id, unite, famille, ventilations: [], ...extra });
const visibles = [
  M('a', 'chf', 'caisse', { ventilations: [{ id: 'service' }] }), M('b', 'chf'), M('c', 'nombre'), M('d', 'pct', 'reservations'),
  M('e', 'chf'), M('f', 'chf'), M('g', 'chf'), M('h', 'chf'),
];

test('périodes : 7 et 30 jours finissent aujourd\'hui, mois, trimestre et année sont civils', () => {
  const auj = '2026-11-11';
  assert.deepEqual(bornesDe({ id: 'jour' }, auj), { debut: auj, fin: auj });
  assert.deepEqual(bornesDe({ id: '7j' }, auj), { debut: '2026-11-05', fin: auj });
  assert.deepEqual(bornesDe({ id: '30j' }, auj), { debut: '2026-10-13', fin: auj });
  assert.deepEqual(bornesDe({ id: 'mois' }, auj), { debut: '2026-11-01', fin: '2026-11-30' });
  assert.deepEqual(bornesDe({ id: 'trimestre' }, auj), { debut: '2026-10-01', fin: '2026-12-31' });
  assert.deepEqual(bornesDe({ id: 'annee' }, auj), { debut: '2026-01-01', fin: '2026-12-31' });
  assert.deepEqual(bornesDe({ id: 'libre', debut: '2026-11-10', fin: '2026-11-03' }, auj), { debut: '2026-11-03', fin: '2026-11-10' });
  assert.deepEqual(bornesDeComparaison({ debut: '2026-11-01', fin: '2026-11-30' }, 'precedente'), { debut: '2026-10-01', fin: '2026-10-31' });
  assert.deepEqual(bornesDeComparaison({ debut: '2026-11-01', fin: '2026-11-30' }, 'n1'), { debut: '2025-11-01', fin: '2025-11-30' });
  assert.equal(bornesDeComparaison({ debut: auj, fin: auj }, ''), null);
});

test('lisibilité : deux unités et six séries au plus par graphique', () => {
  assert.deepEqual(peutCocher([visibles[0]], visibles[2]), { ok: true, raison: null });
  assert.deepEqual(peutCocher([visibles[0], visibles[2]], visibles[3]), { ok: false, raison: 'unites' });
  const six = [visibles[0], visibles[1], visibles[4], visibles[5], visibles[6], visibles[7]];
  assert.deepEqual(peutCocher(six, visibles[2]), { ok: false, raison: 'series' });
  assert.deepEqual(peutCocher(six, visibles[0]), { ok: true, raison: null });
});

test('vue par défaut : la première mesure visible, sur 30 jours, au pas jour', () => {
  assert.deepEqual(vueParDefaut(visibles), { periode: { id: '30j' }, pas: 'jour', comparaison: '', graphiques: [{ mesures: ['a'], ventilation: '', type: '' }] });
  assert.deepEqual(vueParDefaut([]).graphiques[0].mesures, []);
});

test('vue relue : une mesure que la personne ne voit plus disparaît, les règles s\'appliquent', () => {
  const brute = { periode: { id: 'annee' }, pas: 'mois', comparaison: 'n1', graphiques: [
    { mesures: ['a', 'zzz', 'c', 'd'], ventilation: 'service', type: 'courbe' },
    { mesures: ['a'], ventilation: 'service', type: '' },
    { mesures: [] }, { mesures: [] }, { mesures: ['b'] },
  ] };
  const v = nettoyerVue(brute, visibles, '2026-11-11');
  assert.equal(v.graphiques.length, 4);
  // 'zzz' n'est pas visible ; 'd' serait une troisième unité.
  assert.deepEqual(v.graphiques[0].mesures, ['a', 'c']);
  assert.equal(v.graphiques[0].ventilation, '');
  assert.equal(v.graphiques[1].ventilation, 'service');
  assert.equal(v.comparaison, 'n1');
  assert.equal(v.pas, 'mois');
  // Rien de visible : vue par défaut, la période choisie reste.
  const rien = nettoyerVue({ periode: { id: 'mois' }, pas: 'jour', graphiques: [{ mesures: ['zzz'] }] }, visibles, '2026-11-11');
  assert.deepEqual(rien.graphiques, [{ mesures: ['a'], ventilation: '', type: '' }]);
  assert.equal(rien.periode.id, 'mois');
  assert.deepEqual(nettoyerVue(null, visibles, '2026-11-11'), vueParDefaut(visibles));
  // Pas jour refusé sur plus de 400 jours.
  assert.equal(nettoyerVue({ periode: { id: 'libre', debut: '2024-01-01', fin: '2026-11-11' }, pas: 'jour', graphiques: [{ mesures: ['a'] }] }, visibles, '2026-11-11').pas, 'semaine');
});

test('type déduit de la vue : courbe, barres, barres empilées', () => {
  assert.deepEqual(typesValides({ nbTranches: 30, nbSeries: 1, ventilation: false }), ['courbe', 'barres']);
  assert.deepEqual(typesValides({ nbTranches: 30, nbSeries: 3, ventilation: false }), ['courbe']);
  assert.deepEqual(typesValides({ nbTranches: 1, nbSeries: 3, ventilation: false }), ['barres']);
  assert.deepEqual(typesValides({ nbTranches: 12, nbSeries: 4, ventilation: true }), ['empile', 'barres']);
  assert.equal(typeRetenu({ type: 'barres' }, { nbTranches: 30, nbSeries: 1, ventilation: false }), 'barres');
  assert.equal(typeRetenu({ type: 'barres' }, { nbTranches: 30, nbSeries: 2, ventilation: false }), 'courbe');
});

test('lien d\'entrée : mesures nommées ou première de la famille, null si rien n\'est visible', () => {
  const v = vueDepuisLien({ mesures: ['c'], periode: 'mois' }, visibles, '2026-11-11');
  assert.deepEqual(v.graphiques, [{ mesures: ['c'], ventilation: '', type: '' }]);
  assert.equal(v.periode.id, 'mois');
  assert.deepEqual(vueDepuisLien({ famille: 'reservations' }, visibles, '2026-11-11').graphiques[0].mesures, ['d']);
  assert.equal(vueDepuisLien({ famille: 'comptabilite' }, visibles, '2026-11-11'), null);
  assert.equal(vueDepuisLien(null, visibles, '2026-11-11'), null);
});

test('graphiques côte à côte : quatre au plus, un au moins', () => {
  let v = vueParDefaut(visibles);
  for (let i = 0; i < 6; i += 1) v = ajouterGraphique(v);
  assert.equal(v.graphiques.length, 4);
  for (let i = 0; i < 6; i += 1) v = retirerGraphique(v, 0);
  assert.equal(v.graphiques.length, 1);
});
