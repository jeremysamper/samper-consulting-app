// node --test : chiffres des pertes (calculPertes.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seriePertes, totauxPertes, valeurPerte } from './calculPertes.js';
import { chiffresGestion } from '../dashboard/tableauLogique.js';
import { jeuPertes } from './jeuPertes.mjs';

// Règle de l'écran Pertes.jsx l. 181 à 185, recopiée ici comme témoin.
const totalEcran = (pertes) => pertes.reduce((s, p) => s + p.quantite * p.valeurUnit, 0);

test('valeur d\'une perte : quantité fois valeur unitaire, zéro si un champ manque', () => {
  assert.equal(valeurPerte({ quantite: 2, valeurUnit: 3.5 }), 7);
  assert.equal(valeurPerte({ quantite: 2 }), 0);
  assert.equal(valeurPerte(null), 0);
});

test('totaux : ceux de l\'écran Pertes, au centime', () => {
  const pertes = jeuPertes();
  const t = totauxPertes(pertes);
  assert.equal(t.valeur.toFixed(2), totalEcran(pertes).toFixed(2));
  assert.equal(t.declarations, 1200);
  const somme = Object.values(t.parCategorie).reduce((s, v) => s + v, 0);
  assert.equal(somme.toFixed(2), t.valeur.toFixed(2));
});

test('série : un point par tranche, la somme des points fait le total, une tranche vide est vide', () => {
  const pertes = jeuPertes();
  const tranches = Array.from({ length: 12 }, (_, m) => {
    const mm = String(m + 1).padStart(2, '0');
    const fin = new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10);
    return { debut: `2026-${mm}-01`, fin };
  });
  const points = seriePertes(pertes, tranches);
  assert.equal(points.length, 12);
  const somme = points.reduce((s, p) => s + p.valeur, 0);
  assert.equal(somme.toFixed(2), totauxPertes(pertes).valeur.toFixed(2));
  assert.equal(points.reduce((s, p) => s + p.declarations, 0), 1200);
  const [vide] = seriePertes(pertes, [{ debut: '2025-01-01', fin: '2025-01-31' }]);
  assert.equal(vide.vide, true);
});

test('le mois en cours égale la carte des chiffres de gestion du tableau de bord', () => {
  const pertes = jeuPertes();
  const aujourdhui = '2026-12-31';
  const [point] = seriePertes(pertes, [{ debut: '2026-12-01', fin: aujourdhui }]);
  const carte = chiffresGestion({ pertes, shifts: [], couverts: [], aujourdhui });
  assert.equal(point.valeur.toFixed(2), carte.valeurPertes.toFixed(2));
});
