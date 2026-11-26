// node --test : fin de journée de la caisse (lot 20 du panel). La liste des
// cases à reste du jour, le motif de la perte préremplie, et la règle du
// retour d'une portion que rejoue la démo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casesFinDeJournee, motifFinDeService } from './finDeJournee.js';
import { portionRendue } from './rupture.js';
import { MOTIFS_PERTE_DEFAUT } from '../../utils/reglagesModules.js';

const AUJ = '2026-11-26';
const HIER = '2026-11-25';
const plats = [
  { id: 'tarte', nom: 'Tarte aux pommes' },
  { id: 'burger', nom: 'Burger maison' },
  { id: 'cornalin', nom: 'Cornalin bouteille' },
  { id: 'veloute', nom: 'Velouté' },
  { id: 'feras', nom: 'Filets de féra' },
  { id: 'soupe', nom: 'Soupe du jour' },
  { id: 'vin', nom: 'Vin du mois' },
];

test('une case comptée aujourd\'hui avec un reste est listée, avec son reste', () => {
  const r = casesFinDeJournee({ tarte: { portions_le: AUJ, portions_restantes: 3 } }, plats, AUJ);
  assert.deepEqual(r, [{ platId: 'tarte', nom: 'Tarte aux pommes', nomCourt: 'Tarte aux pommes', restant: 3 }]);
});

test('un produit épuisé durable n\'est pas listé (D3)', () => {
  const r = casesFinDeJournee({ cornalin: { epuise_durable: true, rupture_le: AUJ, portions_le: AUJ, portions_restantes: 4 } }, plats, AUJ);
  assert.deepEqual(r, []);
});

test('une case sans nombre n\'est pas listée', () => {
  const r = casesFinDeJournee({
    burger: { portions_le: null, portions_restantes: null },
    veloute: {},
    soupe: { rupture_le: AUJ },
  }, plats, AUJ);
  assert.deepEqual(r, []);
});

test('un compteur d\'hier ou tombé à zéro n\'est pas listé', () => {
  const r = casesFinDeJournee({
    feras: { portions_le: HIER, portions_restantes: 6 },
    vin: { portions_le: AUJ, portions_restantes: 0, rupture_le: AUJ },
  }, plats, AUJ);
  assert.deepEqual(r, []);
});

test('un plat inconnu de la maison n\'est pas listé', () => {
  assert.deepEqual(casesFinDeJournee({ autre: { portions_le: AUJ, portions_restantes: 2 } }, plats, AUJ), []);
});

test('les cases sont rangées par nom affiché, le nom court de la caisse d\'abord', () => {
  const r = casesFinDeJournee({
    tarte: { portions_le: AUJ, portions_restantes: 3, nom_court: 'Tarte' },
    burger: { portions_le: AUJ, portions_restantes: 1 },
    veloute: { portions_le: AUJ, portions_restantes: 12 },
  }, plats, AUJ);
  assert.deepEqual(r.map((c) => c.platId), ['burger', 'tarte', 'veloute']);
  assert.equal(r[1].nom, 'Tarte aux pommes');
  assert.equal(r[1].nomCourt, 'Tarte');
});

test('jour mal formé ou données absentes : liste vide', () => {
  assert.deepEqual(casesFinDeJournee({ tarte: { portions_le: AUJ, portions_restantes: 3 } }, plats, '26.11.2026'), []);
  assert.deepEqual(casesFinDeJournee(null, plats, AUJ), []);
  assert.deepEqual(casesFinDeJournee({ tarte: { portions_le: AUJ, portions_restantes: 3 } }, null, AUJ), []);
});

test('motif : « Fin de service » quand la maison l\'a, casse et accents ignorés', () => {
  assert.equal(motifFinDeService(['Casse', 'Fin de service', 'Autre']), 'Fin de service');
  assert.equal(motifFinDeService(['Casse', 'fin de Service']), 'fin de Service');
  assert.equal(motifFinDeService(['Restes de fin de service du soir', 'Autre']), 'Restes de fin de service du soir');
});

test('motif : les motifs d\'origine de Pertes donnent « Surproduction »', () => {
  assert.equal(motifFinDeService(MOTIFS_PERTE_DEFAUT), 'Surproduction');
});

test('motif : le plus proche existant, dans l\'ordre annoncé', () => {
  assert.equal(motifFinDeService(['Casse', 'Fin de journée', 'Surproduction']), 'Fin de journée');
  assert.equal(motifFinDeService(['Casse', 'Invendus', 'Surproduction']), 'Invendus');
  assert.equal(motifFinDeService(['Casse', 'Restes', 'Autre']), 'Restes');
  assert.equal(motifFinDeService(['Casse', 'Autre']), 'Autre');
  assert.equal(motifFinDeService(['Casse', 'DLC dépassée']), 'Casse');
});

test('motif : sans motif, « Autre » comme la saisie de Pertes', () => {
  assert.equal(motifFinDeService([]), 'Autre');
  assert.equal(motifFinDeService(undefined), 'Autre');
  assert.equal(motifFinDeService(['', '  ', null]), 'Autre');
});

// Instants UTC : 26.11.2026 à 10 h à Zurich = 09:00Z.
const POSE = '2026-11-26T09:00:00.000Z';
const bouton = { portions_le: AUJ, portions_restantes: 3, portions_posees_a: POSE };

test('retour : une ligne vendue aujourd\'hui après la pose rend sa portion', () => {
  assert.equal(portionRendue('2026-11-26T09:00:00.000Z', bouton, AUJ), true);
  assert.equal(portionRendue('2026-11-26T15:30:00.000Z', bouton, AUJ), true);
});

test('retour : une ligne d\'hier ne rend rien', () => {
  assert.equal(portionRendue('2026-11-25T20:00:00.000Z', { ...bouton, portions_posees_a: null }, AUJ), false);
  // 23 h 30 le 25 à Zurich = 22:30Z : la veille, même si le jour UTC est le 25.
  assert.equal(portionRendue('2026-11-25T22:30:00.000Z', { ...bouton, portions_posees_a: null }, AUJ), false);
  // 0 h 30 le 26 à Zurich = 23:30Z le 25 : le jour du compteur.
  assert.equal(portionRendue('2026-11-25T23:30:00.000Z', { ...bouton, portions_posees_a: null }, AUJ), true);
});

test('retour : une ligne vendue avant la dernière pose ne rend rien', () => {
  assert.equal(portionRendue('2026-11-26T08:55:00.000Z', bouton, AUJ), false);
});

test('retour : compteur posé avant le lot 20 (sans instant), le jour seul compte', () => {
  assert.equal(portionRendue('2026-11-26T07:00:00.000Z', { portions_le: AUJ, portions_restantes: 2 }, AUJ), true);
});

test('retour : compteur d\'un autre jour, ligne sans date ou jour mal formé : rien', () => {
  assert.equal(portionRendue('2026-11-26T15:00:00.000Z', { ...bouton, portions_le: HIER }, AUJ), false);
  assert.equal(portionRendue(null, bouton, AUJ), false);
  assert.equal(portionRendue('pas une date', bouton, AUJ), false);
  assert.equal(portionRendue('2026-11-26T15:00:00.000Z', bouton, 'demain'), false);
  assert.equal(portionRendue('2026-11-26T15:00:00.000Z', null, AUJ), false);
});
