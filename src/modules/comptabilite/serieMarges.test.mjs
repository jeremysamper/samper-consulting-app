// node --test : marges d'aujourd'hui (serieMarges.js) et chiffrage des fiches
// (consultant-tools/serieChiffrage.js), contre le calcul des écrans d'origine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { etatMarges } from './serieMarges.js';
import { etatChiffrage } from '../consultant-tools/serieChiffrage.js';
import { jeuMarges } from './jeuMarges.mjs';
import { buildProduitIndex } from '../../services/prixResolution.js';
import { chiffrerCarte, chiffrerFiche } from '../../utils/chiffrage.js';

test('marges : cartes visibles selon le rôle, plats actifs, chiffrage de la carte', () => {
  const j = jeuMarges();
  const patron = etatMarges({ ...j, consultant: false });
  const consultant = etatMarges({ ...j, consultant: true });
  assert.deepEqual(patron.cartes.map((x) => x.carte.id), ['c-midi']);
  assert.deepEqual(consultant.cartes.map((x) => x.carte.id), ['c-midi', 'c-test']);
  const midi = patron.cartes[0].calcul;
  assert.deepEqual(midi.plats.map((l) => l.plat.id), ['pl-boeuf', 'pl-risotto', 'pl-saumon', 'pl-nouveau']);
  const attendu = chiffrerCarte(j.plats.filter((p) => p.actif !== false && p.carteIds.includes('c-midi')), new Map(j.recettes.map((r) => [r.id, r])), buildProduitIndex(j.produits));
  assert.equal(midi.foodCost, attendu.foodCost);
  assert.equal(midi.marge, attendu.marge);
  assert.equal(midi.sansFiche, 1);
});

test('marges : fiches non archivées avec un prix, la cachée au consultant seulement', () => {
  const j = jeuMarges();
  assert.deepEqual(etatMarges({ ...j, consultant: false }).fiches.map((x) => x.r.id), ['r-boeuf', 'r-risotto', 'r-saumon', 'r-tarte']);
  assert.deepEqual(etatMarges({ ...j, consultant: true }).fiches.map((x) => x.r.id), ['r-boeuf', 'r-risotto', 'r-saumon', 'r-tarte', 'r-cachee']);
});

test('chiffrage : fiches non archivées, cachées et sans prix comprises, chiffrées par chiffrerFiche', () => {
  const j = jeuMarges();
  const e = etatChiffrage(j);
  assert.equal(e.length, 6);
  assert.ok(!e.some((x) => x.r.id === 'r-vieille'));
  const index = buildProduitIndex(j.produits);
  e.forEach((x) => assert.deepEqual(x.c, chiffrerFiche(x.r, index), x.r.id));
});
