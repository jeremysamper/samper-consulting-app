// node --test : rangement des fiches en vitrine (rangementFiches.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estCategorieTechnique, recettesOuvrablesDuPlat, platsDeRecette,
  photoDeRecette, photoDeFicheSalle, platsACompleter,
  platsAEcrire, sectionsDeFiches, SECTION_PREPARATIONS, allergenesDuPlat,
} from './rangementFiches.js';
import { ALLERGENES } from '../../utils/allergenes.js';

const rec = (id, nom, categorie, patch) => ({ id, nom, categorie, statut: 'validée', masquee: false, photoUrl: null, ...patch });
const lien = (recetteId, ordre, role = 'composant') => ({ recetteId, ordre, role });
const plat = (id, nom, recettes, patch) => ({ id, nom, categorie: 'Plats', actif: true, photoUrl: null, carteIds: ['c1'], recettes, ...patch });

const fera = rec('r-fera', 'Filet de féra du Léman', 'Poissons');
const beurre = rec('r-beurre', 'Beurre blanc', 'Sauces');
const tarte = rec('r-tarte', 'Tarte aux pruneaux', 'Desserts');
const pate = rec('r-pate', 'Pâte brisée', 'Bases');
const visibles = [fera, beurre, tarte, pate];

const platFera = plat('p-fera', 'Filet de féra, beurre blanc', [lien('r-fera', 0, 'principal'), lien('r-beurre', 1)], { photoUrl: '/fera.jpg' });
const platTarte = plat('p-tarte', 'Tarte aux pruneaux', [lien('r-pate', 1), lien('r-tarte', 0, 'principal')], { photoUrl: '/tarte.jpg' });

test('catégories techniques : sauces, fonds, bases, garnitures, préparations, sans accents', () => {
  for (const c of ['Sauces', 'Fonds', 'Fonds & sauces', 'Bases', 'Garnitures', 'Préparations', 'preparation']) assert.equal(estCategorieTechnique(c), true, c);
  for (const c of ['Entrées', 'Plats', 'Desserts', 'Petit-déjeuner', 'Fondue', '', null]) assert.equal(estCategorieTechnique(c), false, String(c));
});

test('photo de la recette d\'abord, même si son plat en a une', () => {
  const avecPhoto = { ...fera, photoUrl: '/ma-fera.jpg' };
  assert.equal(photoDeRecette(avecPhoto, [platFera], [avecPhoto, beurre]), '/ma-fera.jpg');
});

test('sans photo, la première fiche ouvrable prend la photo de son plat', () => {
  assert.equal(photoDeRecette(fera, [platFera], visibles), '/fera.jpg');
  assert.equal(photoDeRecette(tarte, [platTarte], visibles), '/tarte.jpg');
});

test('une sous-recette technique ne prend jamais la photo du plat', () => {
  assert.equal(photoDeRecette(beurre, [platFera], visibles), null);
  // Même première du plat, la pâte brisée (Bases) reste sans photo de tarte.
  const platPate = plat('p-pate', 'Tarte', [lien('r-pate', 0, 'principal')], { photoUrl: '/tarte.jpg' });
  assert.equal(photoDeRecette(pate, [platPate], visibles), null);
});

test('ordre de composition : ordre saisi, puis recette principale d\'abord', () => {
  assert.deepEqual(recettesOuvrablesDuPlat(platTarte, visibles).map((r) => r.id), ['r-tarte', 'r-pate']);
  const egalite = plat('p-x', 'X', [lien('r-pate', 0), lien('r-tarte', 0, 'principal')]);
  assert.deepEqual(recettesOuvrablesDuPlat(egalite, visibles).map((r) => r.id), ['r-tarte', 'r-pate']);
  // Une deuxième fiche du plat n'en prend pas la photo.
  assert.equal(photoDeRecette({ ...pate, categorie: 'Desserts' }, [platTarte], visibles), null);
});

test('un plat inactif ne prête pas sa photo et ne compte nulle part', () => {
  const inactif = { ...platFera, actif: false };
  assert.equal(photoDeRecette(fera, [inactif], visibles), null);
  assert.deepEqual(platsDeRecette('r-fera', [inactif]), []);
  assert.deepEqual(platsACompleter([inactif], visibles), []);
  assert.equal(photoDeFicheSalle({ nom: 'Filet de féra, beurre blanc' }, [inactif], []), null);
});

test('fiche salle : rapprochement par nom normalisé, « Bœuf » = « boeuf »', () => {
  const joue = plat('p-joue', 'Joue de Bœuf  braisée', [], { photoUrl: '/joue.jpg' });
  assert.equal(photoDeFicheSalle({ nom: 'joue de boeuf braisée' }, [joue], []), '/joue.jpg');
  assert.equal(photoDeFicheSalle({ nom: 'Joue de veau' }, [joue], []), null);
  assert.equal(photoDeFicheSalle({ nom: '' }, [joue], []), null);
});

test('fiche salle : repli sur la recette de même nom, ni archivée ni cachée', () => {
  const r = rec('r-1', 'Risotto aux bolets', 'Pâtes & Risottos', { photoUrl: '/risotto.jpg' });
  const sansPhoto = plat('p-r', 'Risotto aux bolets', []);
  assert.equal(photoDeFicheSalle({ nom: 'Risotto aux Bolets' }, [sansPhoto], [r]), '/risotto.jpg');
  assert.equal(photoDeFicheSalle({ nom: 'Risotto aux bolets' }, [], [{ ...r, statut: 'archivée' }]), null);
  assert.equal(photoDeFicheSalle({ nom: 'Risotto aux bolets' }, [], [{ ...r, masquee: true }]), null);
});

test('recettes cachées ou archivées : jamais ouvrables depuis un plat', () => {
  const cachee = rec('r-cachee', 'Base secrète', 'Bases', { masquee: true });
  // La liste des visibles exclut déjà cachées et archivées : un lien vers elles ne s'ouvre pas.
  const p = plat('p-c', 'Plat', [lien('r-cachee', 0, 'principal'), lien('r-fera', 1)]);
  assert.deepEqual(recettesOuvrablesDuPlat(p, visibles).map((r) => r.id), ['r-fera']);
  assert.ok(!visibles.includes(cachee));
});

test('plats à compléter : sans fiche visible, ou hors carte', () => {
  const sorbet = plat('p-sorbet', 'Sorbet poire', []);
  const seulCachee = plat('p-c', 'Plat caché', [lien('r-cachee', 0)]);
  const horsCarte = plat('p-h', 'Plat hors carte', [lien('r-tarte', 0)], { carteIds: [] });
  const complet = platFera;
  const res = platsACompleter([sorbet, seulCachee, horsCarte, complet], visibles);
  assert.deepEqual(res.map((x) => [x.plat.id, x.raison]), [['p-sorbet', 'sansFiche'], ['p-c', 'sansFiche'], ['p-h', 'horsCarte']]);
});

test('plats d\'une fiche : ceux qui la contiennent, dans l\'ordre reçu', () => {
  assert.deepEqual(platsDeRecette('r-beurre', [platTarte, platFera]).map((p) => p.id), ['p-fera']);
  assert.deepEqual(platsDeRecette('r-inconnue', [platTarte, platFera]), []);
});

test('ligne « Plat : » : le plat qui porte le nom de la fiche est tu', () => {
  const risotto = rec('r-ris', 'Risotto aux bolets', 'Pâtes & Risottos');
  const platRisotto = plat('p-ris', 'Risotto  aux Bolets', [lien('r-ris', 0, 'principal')]);
  const platLong = plat('p-ris2', 'Risotto aux bolets, copeaux de sbrinz', [lien('r-ris', 0, 'principal')]);
  assert.deepEqual(platsAEcrire(risotto, [platRisotto, platLong]), []);
  // Le plat plus court que la fiche, au mot près : « Tarte » sous « Tarte aux pruneaux ».
  assert.deepEqual(platsAEcrire(tarte, [plat('p-t', 'Tarte', [])]), []);
  assert.deepEqual(platsAEcrire(tarte, [plat('p-tl', 'Tartelettes', [])]).map((p) => p.id), ['p-tl']);
  // La sous-recette garde son plat : il apprend quelque chose.
  assert.deepEqual(platsAEcrire(beurre, [platFera]).map((p) => p.id), ['p-fera']);
  assert.deepEqual(platsAEcrire(pate, [platTarte]).map((p) => p.id), ['p-tarte']);
});

test('sections : fiches servies dans l\'ordre de service, préparations de base en une seule section', () => {
  const fond = rec('r-fond', 'Fond brun', 'Fonds');
  const gnocchi = rec('r-gn', 'Gnocchi', 'Garnitures');
  const muesli = rec('r-mu', 'Birchermüesli', 'Petit-déjeuner');
  const sections = sectionsDeFiches([beurre, tarte, fond, fera, pate, gnocchi, muesli]);
  assert.deepEqual(sections.map(([cat]) => cat), ['Poissons', 'Desserts', 'Petit-déjeuner', SECTION_PREPARATIONS]);
  assert.deepEqual(sections[3][1].map((r) => r.id).sort(), ['r-beurre', 'r-fond', 'r-gn', 'r-pate']);
  assert.deepEqual(sectionsDeFiches([fera]).map(([cat]) => cat), ['Poissons']);
  assert.deepEqual(sectionsDeFiches([]), []);
});

test('allergènes d\'une fiche salle : les recettes du plat du même nom, plus la fiche', async () => {
  const { allergenesDeFicheSalle } = await import('./rangementFiches.js');
  const plats = [{ nom: 'Risotto aux cèpes', recettes: [{ recetteId: 'r1' }, { recetteId: 'r2' }] }];
  const recettes = [{ id: 'r1', allergenesIds: ['lactose'] }, { id: 'r2', allergenesIds: ['sulfites'], masquee: true }];
  assert.deepEqual(allergenesDeFicheSalle({ nom: 'Risotto aux Cèpes', allergenes: ['celeri'] }, plats, recettes).sort(), ['celeri', 'lactose', 'sulfites']);
  assert.deepEqual(allergenesDeFicheSalle({ nom: 'Autre plat', allergenes: ['gluten'] }, plats, recettes), ['gluten']);
});

// ─── allergenesDuPlat : source unique de la vitrine et des documents client ───
const idA = ALLERGENES[0].id; // premier du référentiel
const idB = ALLERGENES[1].id;
const idC = ALLERGENES[2].id;
const rA = rec('ra', 'Sauce', 'Sauces', { allergenesIds: [idC, idA] });
const rB = rec('rb', 'Base', 'Plats', { allergenesIds: [idA, idB, 'trace de céleri'] });
const rCachee = rec('rc', 'Cachée', 'Bases', { masquee: true, allergenesIds: [idB] });
const rVide = rec('rv', 'Sans allergène', 'Plats', { allergenesIds: [] });

test('allergenesDuPlat : union sans doublon, ordre du référentiel dans ids', () => {
  const a = allergenesDuPlat(plat('p', 'P', [lien('ra', 0), lien('rb', 1)]), [rA, rB]);
  assert.deepEqual(a.ids, [idA, idB, idC]);
  assert.equal(new Set(a.valeurs).size, a.valeurs.length);
  assert.deepEqual([...a.valeurs].sort(), [idA, idB, idC, 'trace de céleri'].sort());
  assert.equal(a.sansFiche, false);
});

test('allergenesDuPlat : une recette cachée compte, une archivée absente de la liste non', () => {
  const a = allergenesDuPlat(plat('p', 'P', [lien('rc', 0), lien('r-archivee', 1)]), [rCachee]);
  assert.deepEqual(a.ids, [idB]);
  assert.equal(a.recettes.length, 1);
});

test('allergenesDuPlat : valeur libre rangée dans libres et gardée dans valeurs', () => {
  const a = allergenesDuPlat(plat('p', 'P', [lien('rb', 0)]), [rB]);
  assert.deepEqual(a.libres, ['trace de céleri']);
  assert.ok(a.valeurs.includes('trace de céleri'));
  assert.ok(!a.ids.includes('trace de céleri'));
});

test('allergenesDuPlat : sans lien ou liens hors liste, sansFiche vrai', () => {
  assert.equal(allergenesDuPlat(plat('p', 'P', []), [rA]).sansFiche, true);
  assert.equal(allergenesDuPlat(plat('p', 'P', undefined), [rA]).sansFiche, true);
  assert.equal(allergenesDuPlat(plat('p', 'P', [lien('inconnue', 0)]), [rA]).sansFiche, true);
});

test('allergenesDuPlat : fiche sans allergène, sansFiche faux et ids vide', () => {
  const a = allergenesDuPlat(plat('p', 'P', [lien('rv', 0)]), [rVide]);
  assert.equal(a.sansFiche, false);
  assert.deepEqual(a.ids, []);
  assert.deepEqual(a.libres, []);
});

test('allergenesDuPlat : même résultat avec une liste et avec une Map', () => {
  const p = plat('p', 'P', [lien('ra', 0), lien('rb', 1), lien('rc', 2)]);
  const liste = [rA, rB, rCachee];
  assert.deepEqual(allergenesDuPlat(p, liste), allergenesDuPlat(p, new Map(liste.map((r) => [r.id, r]))));
});
