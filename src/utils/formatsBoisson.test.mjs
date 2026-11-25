import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colonnesFormats, formatDeLigne, formatsParPlat, ligneNueDuFormat, libelleAvecFormat, optionFormat,
  prixAffiche, validerFormats, volumeEnCl,
} from './formatsBoisson.js';
import { categorieCaisseDeRubrique, grouperParRubrique } from './categoriesBoisson.js';

test('volume d\'un libellé de format', () => {
  assert.equal(volumeEnCl('1 dl'), 10);
  assert.equal(volumeEnCl('37,5 cl'), 37.5);
  assert.equal(volumeEnCl('75 cl'), 75);
  assert.equal(volumeEnCl('1,5 l'), 150);
  assert.equal(volumeEnCl('verre'), null);
});

test('colonnes de formats rangées par volume, libellés libres en dernier', () => {
  const boissons = [
    { formats: [{ libelle: '75 cl' }, { libelle: '1 dl' }] },
    { formats: [{ libelle: '37,5 cl' }, { libelle: 'Verre' }, { libelle: '75 CL' }] },
  ];
  assert.deepEqual(colonnesFormats(boissons), ['1 dl', '37,5 cl', '75 cl', 'Verre']);
});

test('formats par plat, triés par ordre', () => {
  const m = formatsParPlat([
    { id: 'b', plat_id: 'p1', libelle: '50 cl', prix: '17', ordre: 1 },
    { id: 'a', plat_id: 'p1', libelle: '1 dl', prix: '3.5', ordre: 0 },
  ]);
  assert.deepEqual(m.get('p1').map((f) => f.libelle), ['1 dl', '50 cl']);
  assert.equal(m.get('p1')[0].prix, 3.5);
});

test('prix affiché : un format, plusieurs, aucun', () => {
  assert.deepEqual(prixAffiche({ formats: [{ prix: 49 }] }), { prix: 49, des: false });
  assert.deepEqual(prixAffiche({ formats: [{ prix: 17 }, { prix: 3.5 }] }), { prix: 3.5, des: true });
  assert.deepEqual(prixAffiche({ formats: [], prixVente: 12 }), { prix: 12, des: false });
  assert.deepEqual(prixAffiche({ formats: [], prixVente: null }), { prix: null, des: false });
});

test('ligne de caisse : libellé, option et fusion par format', () => {
  const f1 = { id: 'f1', libelle: '1 dl', prix: 3.5 };
  const f2 = { id: 'f2', libelle: '50 cl', prix: 17 };
  assert.equal(libelleAvecFormat('Fendant', '1 dl'), 'Fendant, 1 dl');
  const ligne = { options: [optionFormat(f1)], note: null };
  assert.deepEqual(formatDeLigne(ligne), { id: 'f1', libelle: '1 dl' });
  assert.equal(ligneNueDuFormat(ligne, f1), true);
  assert.equal(ligneNueDuFormat(ligne, f2), false);
  assert.equal(ligneNueDuFormat(ligne, null), false);
  assert.equal(ligneNueDuFormat({ options: [] }, null), true);
  assert.equal(ligneNueDuFormat({ options: [optionFormat(f1), { type: 'message', valeur: 'frais' }] }, f1), false);
});

test('saisie des formats', () => {
  assert.deepEqual(validerFormats([{ libelle: ' 1 dl ', prix: '3,50' }, { libelle: '', prix: '' }]).formats,
    [{ id: null, libelle: '1 dl', prix: 3.5, ordre: 0 }]);
  assert.ok(validerFormats([{ libelle: '1 dl', prix: '' }]).erreur);
  assert.ok(validerFormats([{ libelle: '1 dl', prix: '3' }, { libelle: '1 DL', prix: '4' }]).erreur);
  assert.ok(validerFormats([{ libelle: '', prix: '3' }]).erreur);
});

test('rubriques : ordre du référentiel et catégorie de caisse', () => {
  const g = grouperParRubrique([{ categorie: 'Spiritueux' }, { categorie: 'Vins rouges' }, { categorie: 'Maison' }, { categorie: '' }]);
  assert.deepEqual(g.map(([r]) => r), ['Vins rouges', 'Spiritueux', 'Boissons', 'Maison']);
  assert.equal(categorieCaisseDeRubrique('Vins blancs'), 'Vins');
  assert.equal(categorieCaisseDeRubrique('vins rosés'), 'Vins');
  assert.equal(categorieCaisseDeRubrique('Boissons'), null);
});
