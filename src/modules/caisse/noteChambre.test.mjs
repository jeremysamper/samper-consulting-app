// node --test : ticket de caisse porté sur la note de la chambre (lot 05).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBELLE_CHAMBRE, boutonChambreVisible, estPaiementChambre, libelleLigneNote, sejoursPourChoix,
} from './noteChambre.js';

test('estPaiementChambre : autre et libellé qui commence par chambre', () => {
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: 'Chambre' }), true);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: 'chambre 12' }), true);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: '  CHAMBRE ' }), true);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: LIBELLE_CHAMBRE }), true);
  assert.equal(estPaiementChambre({ moyen: 'carte', libelle: 'Chambre' }), false);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: 'Chambre', bonCadeau: { code: 'X' } }), false);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: 'Chambre', bon_cadeau_id: 'b1' }), false);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: 'Bon chambre' }), false);
  assert.equal(estPaiementChambre({ moyen: 'autre', libelle: '' }), false);
  assert.equal(estPaiementChambre(null), false);
});

test('boutonChambreVisible : trois conditions', () => {
  assert.equal(boutonChambreVisible({ hebergementActif: false, test: false, poses: [] }), false);
  assert.equal(boutonChambreVisible({ hebergementActif: true, test: true, poses: [] }), false);
  assert.equal(boutonChambreVisible({ hebergementActif: true, test: false, poses: [{ moyen: 'autre', libelle: 'Chambre' }] }), false);
  assert.equal(boutonChambreVisible({ hebergementActif: true, test: false, poses: [{ moyen: 'carte', montant: 10 }] }), true);
  assert.equal(boutonChambreVisible({ hebergementActif: true, test: false }), true);
});

const CHAMBRES = [
  { id: 'c2', numero: '2' },
  { id: 'c12', numero: '12' },
  { id: 'c21', numero: '21' },
];
const SEJOURS = [
  { id: 's12', chambreId: 'c12', nomHote: 'Martin Dupont', statut: 'en_maison', depart: '2026-11-27' },
  { id: 's2', chambreId: 'c2', nomHote: 'Anna Keller', statut: 'en_maison', depart: '2026-11-26' },
  { id: 'sp', chambreId: 'c21', nomHote: 'Futur Hôte', statut: 'prevu', depart: '2026-12-02' },
  { id: 'sparti', chambreId: 'c21', nomHote: 'Paul Partant', statut: 'parti', depart: '2026-11-20' },
  { id: 'svieux', chambreId: 'c21', nomHote: 'Vieux Séjour', statut: 'parti', depart: '2026-11-10' },
];
const AUJ = '2026-11-25';

test('sejoursPourChoix : en maison seulement, triés par numéro', () => {
  const r = sejoursPourChoix(SEJOURS, CHAMBRES, '', { aujourdhui: AUJ });
  assert.deepEqual(r.map((x) => x.sejour.id), ['s2', 's12']);
  assert.equal(r[1].chambre.numero, '12');
});

test('sejoursPourChoix : prévu jamais, parti de 15 jours jamais', () => {
  const r = sejoursPourChoix(SEJOURS, CHAMBRES, '', { avecPartis: true, aujourdhui: AUJ });
  const ids = r.map((x) => x.sejour.id);
  assert.ok(!ids.includes('sp'));
  assert.ok(ids.includes('sparti'));
  assert.ok(!ids.includes('svieux'));
  assert.deepEqual(ids, ['s2', 's12', 'sparti']);
});

test('sejoursPourChoix : numéro exact et bout de nom', () => {
  assert.deepEqual(sejoursPourChoix(SEJOURS, CHAMBRES, '12', { aujourdhui: AUJ }).map((x) => x.sejour.id), ['s12']);
  assert.deepEqual(sejoursPourChoix(SEJOURS, CHAMBRES, '1', { aujourdhui: AUJ }).map((x) => x.sejour.id), []);
  assert.deepEqual(sejoursPourChoix(SEJOURS, CHAMBRES, 'kel', { aujourdhui: AUJ }).map((x) => x.sejour.id), ['s2']);
  assert.deepEqual(sejoursPourChoix(SEJOURS, CHAMBRES, ' DUPONT ', { aujourdhui: AUJ }).map((x) => x.sejour.id), ['s12']);
});

test('libelleLigneNote : année et numéro sur six chiffres', () => {
  assert.equal(libelleLigneNote({ annee: 2026, numero: 123 }), 'Restaurant, ticket n° 2026-000123');
  assert.equal(libelleLigneNote({ annee: 2027, numero: 1 }), 'Restaurant, ticket n° 2027-000001');
});
