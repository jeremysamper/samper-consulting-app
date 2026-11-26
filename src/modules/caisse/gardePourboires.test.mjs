// Lot 19 du panel : la décision rejouée par la démo doit être celle du
// déclencheur trg_caisse_reglages_garde_pourboires (cas de l'essai à blanc).
import test from 'node:test';
import assert from 'node:assert/strict';
import { REFUS_POURBOIRES, changementPourboiresRefuse } from './gardesCaisse.js';

const E = 'etab-2';
const AUTRE = 'etab-1';
const REGLE = { mode: 'cle', groupes: [{ id: 'g-salle', part: 70 }, { id: 'g-cuisine', part: 30 }] };
const REGLE2 = { mode: 'heures', groupes: [{ id: 'g-salle' }] };
const ligne = (config, etab = E) => ({ etablissement_id: etab, config });
const direction = () => true;
const responsable = () => false;
const refuse = (args) => changementPourboiresRefuse(args);

test('message identique à celui de la base', () => {
  assert.equal(REFUS_POURBOIRES, 'caisse: seuls le consultant et le patron changent la regle des pourboires');
});

test('direction : change, retire, supprime, insère, déplace', () => {
  const avant = ligne({ tva: 1, pourboires: REGLE });
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 1, pourboires: REGLE2 }), estDirection: direction }), false);
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 1 }), estDirection: direction }), false);
  assert.equal(refuse({ type: 'DELETE', ancienne: avant, estDirection: direction }), false);
  assert.equal(refuse({ type: 'INSERT', ancienne: null, nouvelle: ligne({ pourboires: REGLE }), estDirection: direction }), false);
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 1, pourboires: REGLE }, AUTRE), estDirection: direction }), false);
});

test('responsable cuisine : tout changement de la règle est refusé', () => {
  const avant = ligne({ tva: 1, pourboires: REGLE });
  // C3 et C6 : modification ; C5 : retrait ; C8 : suppression de la ligne.
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 1, pourboires: REGLE2 }), estDirection: responsable }), true);
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 1 }), estDirection: responsable }), true);
  assert.equal(refuse({ type: 'DELETE', ancienne: avant, estDirection: responsable }), true);
  // C9 : ligne neuve avec une règle.
  assert.equal(refuse({ type: 'INSERT', ancienne: null, nouvelle: ligne({ pourboires: REGLE2 }), estDirection: responsable }), true);
  // C17 : déplacement de la ligne vers une autre maison.
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 1, pourboires: REGLE }, AUTRE), estDirection: responsable }), true);
  // C23 : config périmée (la règle en base a changé depuis l'ouverture).
  assert.equal(refuse({ type: 'UPDATE', ancienne: ligne({ tva: 1, pourboires: REGLE2 }), nouvelle: ligne({ tva: 2, pourboires: REGLE }), estDirection: responsable }), true);
});

test('responsable cuisine : les autres clés passent, règle identique ou absente', () => {
  // C4 et C7 : autre clé, règle renvoyée telle quelle, même dans un autre ordre de clés.
  const avant = ligne({ tva: 1, pourboires: REGLE });
  const memeRegle = { groupes: [{ part: 70, id: 'g-salle' }, { part: 30, id: 'g-cuisine' }], mode: 'cle' };
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ tva: 2, pourboires: memeRegle }), estDirection: responsable }), false);
  // Premier passage d'un upsert : comparé à la ligne déjà en base.
  assert.equal(refuse({ type: 'INSERT', ancienne: avant, nouvelle: ligne({ tva: 2, pourboires: REGLE }), estDirection: responsable }), false);
  // C10 : ligne neuve sans règle ; suppression d'une ligne sans règle.
  assert.equal(refuse({ type: 'INSERT', ancienne: null, nouvelle: ligne({ tva: 1 }), estDirection: responsable }), false);
  assert.equal(refuse({ type: 'DELETE', ancienne: ligne({ tva: 1 }), estDirection: responsable }), false);
  // C22 : null JSON vaut absence.
  assert.equal(refuse({ type: 'UPDATE', ancienne: ligne({ tva: 1 }), nouvelle: ligne({ tva: 1, pourboires: null }), estDirection: responsable }), false);
});

test("l'ordre d'une liste compte : groupes inversés = autre règle", () => {
  const avant = ligne({ pourboires: REGLE });
  const inverse = { mode: 'cle', groupes: [REGLE.groupes[1], REGLE.groupes[0]] };
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ pourboires: inverse }), estDirection: responsable }), true);
});

test('échec fermé : un droit inconnu refuse', () => {
  const avant = ligne({ pourboires: REGLE });
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ pourboires: REGLE2 }), estDirection: () => undefined }), true);
  assert.equal(refuse({ type: 'UPDATE', ancienne: avant, nouvelle: ligne({ pourboires: REGLE2 }), estDirection: () => null }), true);
});
