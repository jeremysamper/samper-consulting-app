import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES, demandesOuvertesAuxHotes, estJetonDemo, etatPourHote, jetonValide, notePropre, sejourPourQr,
} from './regles.js';
import { LANGUES, TEXTES, langueDe } from './textes.js';

test('jetonValide : 32 signes hexadécimaux en minuscules', () => {
  assert.equal(jetonValide('0123456789abcdef0123456789abcdef'), true);
  assert.equal(jetonValide('0'.repeat(31)), false);
  assert.equal(jetonValide('0'.repeat(33)), false);
  assert.equal(jetonValide('0123456789ABCDEF0123456789abcdef'), false);
  assert.equal(jetonValide('01234567-9abcdef0123456789abcdef'), false);
  assert.equal(jetonValide(''), false);
  assert.equal(jetonValide(null), false);
});

test('estJetonDemo : commence par demo', () => {
  assert.equal(estJetonDemo('demo'), true);
  assert.equal(estJetonDemo('demo201'), true);
  assert.equal(estJetonDemo('0'.repeat(32)), false);
  assert.equal(estJetonDemo(undefined), false);
});

test('notePropre : contrôle retiré, espaces resserrés, coupée à 140', () => {
  assert.equal(notePropre('  à\t7 h\u0007  demain \n svp '), 'à 7 h demain svp');
  assert.equal(notePropre(null), '');
  const longue = 'a'.repeat(200);
  assert.equal(notePropre(longue).length, LIMITES.note);
  assert.equal(notePropre(`${'a'.repeat(139)} b`), 'a'.repeat(139));
});

test('sejourPourQr : la règle D4', () => {
  const jour = '2026-11-26';
  const s = (id, statut, arrivee, depart, chambreId = 'c1') => ({ id, chambreId, statut, arrivee, depart });
  assert.equal(sejourPourQr([s(1, 'en_maison', '2026-11-24', '2026-11-26')], 'c1', jour)?.id, 1, 'en maison le jour du départ');
  assert.equal(sejourPourQr([s(2, 'prevu', '2026-11-26', '2026-11-28')], 'c1', jour)?.id, 2, 'prévu arrivé aujourd\'hui');
  assert.equal(sejourPourQr([s(3, 'prevu', '2026-11-27', '2026-11-29')], 'c1', jour), null, 'prévu demain');
  for (const statut of ['parti', 'annule', 'no_show']) {
    assert.equal(sejourPourQr([s(4, statut, '2026-11-25', '2026-11-28')], 'c1', jour), null, statut);
  }
  assert.equal(sejourPourQr([s(5, 'prevu', '2026-11-26', '2026-11-28'), s(6, 'en_maison', '2026-11-24', '2026-11-26')], 'c1', jour)?.id, 6,
    'le séjour en maison gagne');
  assert.equal(sejourPourQr([{ id: 7, chambre_id: 'c1', statut: 'en_maison', arrivee: '2026-11-25', depart: '2026-11-27' }], 'c1', jour)?.id, 7,
    'lignes en snake_case');
  assert.equal(sejourPourQr([s(8, 'en_maison', '2026-11-25', '2026-11-27', 'c2')], 'c1', jour), null, 'autre chambre');
  assert.equal(sejourPourQr([s(9, 'prevu', '2026-11-24', '2026-11-26')], 'c1', jour), null, 'prévu dont le départ est aujourd\'hui');
});

test('etatPourHote : les quatre statuts', () => {
  assert.equal(etatPourHote('ouverte'), 'recue');
  assert.equal(etatPourHote('en_cours'), 'prise');
  assert.equal(etatPourHote('faite'), 'faite');
  assert.equal(etatPourHote('annulee'), 'annulee');
});

test('demandesOuvertesAuxHotes : casse ignorée, ordre de la maison, libellé disparu absent', () => {
  const categories = [{ libelle: 'Taxi' }, { libelle: 'Oreillers en plus' }, { libelle: 'Interne' }, { libelle: 'Serviettes' }];
  const r = demandesOuvertesAuxHotes(categories, ['serviettes', ' TAXI ', 'Disparue']);
  assert.deepEqual(r.map((c) => c.libelle), ['Taxi', 'Serviettes']);
  assert.deepEqual(demandesOuvertesAuxHotes(categories, []), []);
  assert.deepEqual(demandesOuvertesAuxHotes([{ libelle: 'Taxi' }, { libelle: 'taxi' }], ['Taxi']).length, 1);
});

test('textes : mêmes clés dans les trois langues, aucune valeur vide', () => {
  const cles = Object.keys(TEXTES.fr).sort();
  for (const l of LANGUES) {
    assert.deepEqual(Object.keys(TEXTES[l]).sort(), cles, l);
    for (const [k, v] of Object.entries(TEXTES[l])) assert.ok(typeof v === 'string' && v.trim(), `${l}.${k}`);
  }
});

test('langueDe : fr par défaut', () => {
  assert.equal(langueDe('de-CH'), 'de');
  assert.equal(langueDe('en-GB'), 'en');
  assert.equal(langueDe('fr-CH'), 'fr');
  assert.equal(langueDe('it-CH'), 'fr');
  assert.equal(langueDe(undefined), 'fr');
});
