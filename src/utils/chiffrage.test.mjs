// node --test : chiffrage d'une fiche, d'un plat et d'une carte (chiffrage.js).
// Oracle : les deux blocs de calcul de ConsultantTools.jsx tels qu'ils étaient
// avant l'extraction (lignes 226 à 229 et 546 à 549), copiés ici à la lettre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProduitIndex, computeCoutMatiere } from '../services/prixResolution.js';
import {
  chiffrerCarte, chiffrerFiche, chiffrerPlat, fichesDuPlat, lignesNonChiffrees, niveauFoodCost,
} from './chiffrage.js';

const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} au lieu de ${b}`);

// ── Banc du chantier compta (etab-r) : produits mappés comme listProduits ──
const prod = (id, nom, uniteRef, prix) => ({
  id, nom, uniteRef, prixUnitaire: prix, strategiePrix: 'max',
  fournisseurs: [{ prixUnitaire: prix, estPrincipal: true }],
});
const index = buildProduitIndex([
  prod('p-boeuf', 'Filet de boeuf', 'kg', 52), prod('p-pdt', 'Pommes de terre', 'kg', 1.8),
  prod('p-beurre', 'Beurre', 'kg', 14.5), prod('p-creme', 'Crème 35 %', 'L', 6.2),
  prod('p-saumon', 'Saumon', 'kg', 38), prod('p-riz', 'Riz carnaroli', 'kg', 4.9),
]);
const ing = (nom, quantite, unite, produitId = null, prixUnit = 0) => ({ nom, quantite, unite, produitId, prixUnit });
const rec = (id, nom, portions, prixVente, ingredients) => ({ id, nom, portions, prixVente, ingredients });
const BOEUF = rec('r-boeuf', 'Filet de boeuf, sauce au poivre', 4, 48, [ing('Filet de boeuf', 0.72, 'kg', 'p-boeuf'), ing('Beurre', 60, 'g', 'p-beurre'), ing('Crème 35 %', 0.2, 'L', 'p-creme'), ing('Pommes de terre', 0.8, 'kg', 'p-pdt')]);
const RISOTTO = rec('r-risotto', 'Risotto au safran', 6, 29, [ing('Riz carnaroli', 0.45, 'kg', 'p-riz'), ing('Beurre', 90, 'g', 'p-beurre'), ing('Crème 35 %', 0.15, 'L', 'p-creme'), ing('Safran', 0.5, 'g', null, 12)]);
const SAUMON = rec('r-saumon', 'Saumon mi-cuit', 4, 36, [ing('Saumon', 0.6, 'kg', 'p-saumon'), ing('Beurre', 40, 'g', 'p-beurre')]);
const GRATIN = rec('r-gratin', 'Gratin dauphinois', 10, 0, [ing('Pommes de terre', 1.5, 'kg', 'p-pdt'), ing('Crème 35 %', 0.5, 'L', 'p-creme'), ing('Beurre', 50, 'g', 'p-beurre')]);
const TARTE = rec('r-tarte', 'Tarte au citron', 8, 14, [ing('Farine', 0.25, 'kg', null, 1.2), ing('Beurre', 150, 'g', 'p-beurre'), ing('Citrons', 4, 'pcs', null, 0.6), ing('Sucre', 0.2, 'kg', null, 1.5)]);
const FICHES = [BOEUF, RISOTTO, SAUMON, GRATIN, TARTE];
const parId = new Map(FICHES.map(r => [r.id, r]));
const plat = (id, nom, prixVente, ids) => ({ id, nom, prixVente, recettes: ids.map((recetteId, ordre) => ({ recetteId, role: 'composant', ordre })) });
const PLATS = [
  plat('pl-boeuf', 'Filet de boeuf, gratin', 52, ['r-boeuf', 'r-gratin']),
  plat('pl-risotto', 'Risotto au safran', 29, ['r-risotto']),
  plat('pl-saumon', 'Saumon mi-cuit', 36, ['r-saumon']),
  plat('pl-tarte', 'Tarte au citron', 14, ['r-tarte']),
];

// ── Oracle : ConsultantTools.jsx avant extraction ──
function oracleListe(r0, produitIndex) {
  const r = { ...r0 };
  r.coutMatiere = computeCoutMatiere(r.ingredients, produitIndex);
  r.coutPortion = r.portions ? r.coutMatiere / r.portions : 0;
  r.foodCost = r.prixVente ? (r.coutPortion / r.prixVente * 100) : null;
  r.margeGrossePct = r.prixVente ? ((r.prixVente - r.coutPortion) / r.prixVente * 100) : null;
  return r;
}
function oracleDetail(selected, produitIndex) {
  const coutMatiere = selected ? computeCoutMatiere(selected.ingredients, produitIndex) : 0;
  const coutPortion = (selected?.portions > 0) ? coutMatiere / Number(selected.portions) : 0;
  const foodCost = selected && selected.prixVente ? (coutPortion / selected.prixVente * 100) : null;
  const margeBrute = selected && selected.prixVente ? selected.prixVente - coutPortion : 0;
  return { coutMatiere, coutPortion, foodCost, margeBrute };
}

test('les 5 fiches du banc : valeurs de la spec (5.10)', () => {
  const attendu = {
    'r-boeuf': [40.99, 10.2475, 21.349, 37.7525],
    'r-risotto': [10.44, 1.74, 6.0, 27.26],
    'r-saumon': [23.38, 5.845, 16.236, 30.155],
    'r-gratin': [6.525, 0.6525, null, 0],
    'r-tarte': [5.175, 0.646875, 4.621, 13.353125],
  };
  FICHES.forEach((r) => {
    const c = chiffrerFiche(r, index);
    const [cout, portion, fc, marge] = attendu[r.id];
    proche(c.coutMatiere, cout, 1e-9);
    proche(c.coutPortion, portion, 1e-9);
    if (fc == null) assert.equal(c.foodCost, null);
    else proche(c.foodCost, fc, 1e-3);
    proche(c.margeBrute, marge, 1e-9);
  });
});

test('égalité exacte avec les deux blocs de ConsultantTools (liste et détail)', () => {
  FICHES.forEach((r) => {
    const c = chiffrerFiche(r, index);
    const l = oracleListe(r, index);
    const d = oracleDetail(r, index);
    assert.equal(c.coutMatiere, l.coutMatiere);
    assert.equal(c.coutPortion, l.coutPortion);
    assert.equal(c.foodCost, l.foodCost);
    assert.equal(c.margeGrossePct, l.margeGrossePct);
    assert.equal(c.coutMatiere, d.coutMatiere);
    assert.equal(c.coutPortion, d.coutPortion);
    assert.equal(c.foodCost, d.foodCost);
    assert.equal(c.margeBrute, d.margeBrute);
  });
});

test('affichage du Chiffrage inchangé : CHF 40.99, 10.25, 21.3 %, 37.75', () => {
  const c = chiffrerFiche(BOEUF, index);
  assert.equal(c.coutMatiere.toFixed(2), '40.99');
  assert.equal(c.coutPortion.toFixed(2), '10.25');
  assert.equal(c.foodCost.toFixed(1), '21.3');
  assert.equal(c.margeBrute.toFixed(2), '37.75');
});

test('cas limites : sans portions, sans prix, catalogue vide, fiche absente', () => {
  const sansPortions = chiffrerFiche({ ...BOEUF, portions: null }, index);
  assert.equal(sansPortions.coutPortion, 0);
  assert.deepEqual(oracleDetail({ ...BOEUF, portions: 0 }, index).coutPortion, chiffrerFiche({ ...BOEUF, portions: 0 }, index).coutPortion);
  const sansPrix = chiffrerFiche(GRATIN, index);
  assert.equal(sansPrix.foodCost, null);
  assert.equal(sansPrix.margeGrossePct, null);
  assert.equal(sansPrix.margeBrute, 0);
  // Catalogue pas encore chargé : chaque ingrédient retombe sur son prix noté.
  assert.equal(chiffrerFiche(RISOTTO, new Map()).coutMatiere, 6);
  assert.deepEqual(chiffrerFiche(null, index), { coutMatiere: 0, coutPortion: 0, foodCost: null, margeBrute: 0, margeGrossePct: null });
});

test('ingrédients sans prix comptés', () => {
  assert.equal(lignesNonChiffrees(BOEUF, index).length, 0);
  const r = { ...SAUMON, ingredients: [...SAUMON.ingredients, ing('Aneth', 5, 'g'), ing('', 1, 'g')] };
  assert.deepEqual(lignesNonChiffrees(r, index).map(i => i.nom), ['Aneth']);
});

test('plat : une portion de chaque fiche, prix du plat', () => {
  const p = chiffrerPlat(PLATS[0], parId, index);
  proche(p.cout, 10.9);
  assert.equal(p.prix, 52);
  assert.equal(p.sourcePrix, 'plat');
  proche(p.foodCost, 10.9 / 52 * 100);
  assert.equal(p.foodCost.toFixed(2), '20.96');
  proche(p.marge, 41.1);
  assert.equal(p.comptees.length, 2);
  assert.equal(p.nonChiffrees, 0);
});

test('plat : une fiche citée comme ingrédient d\'une autre n\'est pas comptée deux fois', () => {
  const fond = rec('r-fond', 'Sauce au poivre', 10, 0, [ing('Crème 35 %', 0.5, 'L', 'p-creme')]);
  const steak = { ...BOEUF, id: 'r-steak', ingredients: [...BOEUF.ingredients, ing('Sauce au poivre ', 0.1, 'L', null, 9)] };
  const m = new Map([[fond.id, fond], [steak.id, steak]]);
  const pl = plat('pl-x', 'Steak', 50, ['r-steak', 'r-fond']);
  const { comptees, citees } = fichesDuPlat(pl, m);
  assert.deepEqual(comptees.map(r => r.id), ['r-steak']);
  assert.deepEqual(citees.map(r => r.id), ['r-fond']);
  proche(chiffrerPlat(pl, m, index).cout, chiffrerFiche(steak, index).coutPortion);
});

test('plat sans prix : prix de l\'unique fiche, sinon rien ; plat sans fiche', () => {
  const p = chiffrerPlat(plat('pl-r', 'Risotto', null, ['r-risotto']), parId, index);
  assert.equal(p.prix, 29);
  assert.equal(p.sourcePrix, 'fiche');
  const deux = chiffrerPlat(plat('pl-d', 'Duo', null, ['r-boeuf', 'r-saumon']), parId, index);
  assert.equal(deux.prix, null);
  assert.equal(deux.sourcePrix, null);
  assert.equal(deux.foodCost, null);
  assert.equal(deux.marge, null);
  const vide = chiffrerPlat(plat('pl-v', 'Vide', 20, ['r-inconnue']), parId, index);
  assert.equal(vide.cout, null);
  assert.equal(vide.manquantes, 1);
});

test('carte d\'automne : 19.131875 pour 131.00, food cost 14,60 %', () => {
  const c = chiffrerCarte(PLATS, parId, index);
  proche(c.cout, 19.131875);
  assert.equal(c.prix, 131);
  assert.equal(c.foodCost.toFixed(2), '14.60');
  proche(c.marge, 131 - 19.131875);
  assert.equal(c.comptes, 4);
  assert.equal(c.sansPrix, 0);
  assert.equal(c.sansFiche, 0);
});

test('carte : un plat sans prix ou sans fiche n\'entre dans aucune somme', () => {
  const c = chiffrerCarte([...PLATS, plat('pl-n', 'Sans prix', null, ['r-boeuf', 'r-saumon']), plat('pl-f', 'Sans fiche', 12, [])], parId, index);
  proche(c.cout, 19.131875);
  assert.equal(c.prix, 131);
  assert.equal(c.sansPrix, 1);
  assert.equal(c.sansFiche, 1);
  assert.equal(chiffrerCarte([], parId, index).foodCost, null);
});

test('niveau du food cost : mêmes seuils que le Chiffrage', () => {
  assert.equal(niveauFoodCost(29.9), 'succes');
  assert.equal(niveauFoodCost(30), 'alerte');
  assert.equal(niveauFoodCost(35), 'danger');
  assert.equal(niveauFoodCost(null), null);
});
