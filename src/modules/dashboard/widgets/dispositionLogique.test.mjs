import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOGUE, FAMILLES, PAR_ID, POSTES, TAILLES } from './catalogue.js';
import {
  ajouter, changerTaille, deplacer, deplacerA, estVisible, listeDuPoste, memeListe, modulesDuMenu, normaliser,
  normaliserListe, origine, raccourcisAffiches, retirer, taillesDeGroupe,
} from './dispositionLogique.js';

// Contexte d'un consultant dans un restaurant où tout est activé.
const CONSULTANT = {
  reperes: ['couverts', 'groupes', 'equipe'], montrerPointage: false, carteEquipe: true, cartesCouverts: true,
  equipeAPart: true, avecHotel: false, motVisible: true, direction: true, avecCouvertsLus: true, avecPlanning: true,
  avecPertes: true, avecStock: true, avecRegularite: true, avecReleves: true, avecPertesLues: true,
  avecGroupesListe: true, avecAbsences: true, avecMessages: true, modulesDuMenu: [{ id: 'haccp' }],
};
// Un cuisinier : il pointe, ne voit aucun chiffre de gestion.
const CUISINIER = {
  ...CONSULTANT, montrerPointage: true, direction: false, avecPertes: false, avecStock: false, avecRegularite: false,
  avecPertesLues: false, motVisible: false,
};
const ids = (l) => l.map((x) => x.id);

test('registre : chaque widget a une garde, des tailles permises, une famille connue et un composant', () => {
  const familles = new Set(FAMILLES.map((f) => f.id));
  const source = fs.readFileSync(new URL('./registre.js', import.meta.url), 'utf8');
  assert.equal(PAR_ID.size, CATALOGUE.length, 'identifiants uniques');
  CATALOGUE.forEach((w) => {
    assert.equal(typeof w.visible, 'function', `${w.id} : garde`);
    assert.ok(w.tailles.length > 0 && w.tailles.every((t) => TAILLES.includes(t)), `${w.id} : tailles`);
    assert.ok(familles.has(w.famille), `${w.id} : famille`);
    assert.ok(w.nom && w.description, `${w.id} : nom et description`);
    POSTES.forEach((p) => {
      const o = w.origine && w.origine[p];
      if (o) assert.ok(w.tailles.includes(o), `${w.id} : taille d'origine permise (${p})`);
    });
    assert.match(source, new RegExp(`'${w.id}': `), `${w.id} : composant dans registre.js`);
  });
});

test('origine : seulement des widgets permis, aucune carte de mise en avant de trop', () => {
  [CONSULTANT, CUISINIER].forEach((ctx) => POSTES.forEach((p) => {
    const l = origine(p, ctx);
    l.forEach((x) => {
      assert.ok(estVisible(x.id, ctx), `${x.id} permis (${p})`);
      assert.ok(PAR_ID.get(x.id).tailles.includes(x.taille), `${x.id} : taille permise`);
    });
    assert.equal(new Set(ids(l)).size, l.length, 'pas de doublon');
    const avant = l.filter((x) => PAR_ID.get(x.id).avant).map((x) => x.id);
    assert.ok(avant.filter((id) => id === 'equipe').length <= 1 && avant.length <= 3);
    if (p === 'telephone') assert.ok(avant.length <= 1, 'une seule carte de mise en avant au téléphone');
    assert.ok(!ids(l).some((id) => ['raccourcis', 'haccp-releves', 'groupes', 'absences', 'messages', 'pertes-semaines'].includes(id)), 'les widgets neufs attendent dans la galerie');
  }));
});

test('origine : même ordre de lecture que le tableau de bord d\'avant', () => {
  assert.deepEqual(ids(origine('ordinateur', CONSULTANT)), [
    'repere-couverts', 'repere-groupes', 'repere-equipe', 'a-faire', 'equipe', 'semaine', 'reservations',
    'qui-travaille', 'mot-consultant', 'a-venir', 'chiffre-couverts', 'chiffre-heures', 'chiffre-pertes', 'chiffre-stock', 'regularite',
  ]);
  assert.deepEqual(ids(origine('ordinateur', CUISINIER)), [
    'repere-couverts', 'repere-groupes', 'repere-equipe', 'pointage', 'equipe', 'a-faire', 'semaine', 'reservations', 'qui-travaille', 'a-venir',
  ]);
  // Téléphone : la carte de l'équipe seule, sans le repère qui la répète.
  assert.deepEqual(ids(origine('telephone', CUISINIER)), ['repere-couverts', 'repere-groupes', 'pointage', 'a-faire', 'equipe', 'a-venir']);
  // Sans planning : la carte de la semaine prend la place, les trois repères restent.
  const sansPlanning = { ...CUISINIER, montrerPointage: false, carteEquipe: false, equipeAPart: false, reperes: ['couverts', 'groupes'] };
  assert.deepEqual(ids(origine('telephone', sansPlanning)), ['repere-couverts', 'repere-groupes', 'a-faire', 'semaine', 'a-venir']);
});

test('origine : les groupes de petits widgets remplissent leurs rangées', () => {
  assert.deepEqual(taillesDeGroupe(3, 'ordinateur'), ['petit', 'petit', 'moyen']);
  assert.deepEqual(taillesDeGroupe(2, 'ordinateur'), ['moyen', 'moyen']);
  assert.deepEqual(taillesDeGroupe(4, 'tablette'), ['petit', 'petit', 'petit', 'petit']);
  assert.deepEqual(taillesDeGroupe(3, 'telephone'), ['petit', 'petit', 'moyen']);
  assert.deepEqual(taillesDeGroupe(2, 'telephone'), ['petit', 'petit']);
  assert.deepEqual(taillesDeGroupe(0, 'telephone'), []);
  // Sans carte de mise en avant : à faire sur toute la largeur.
  const tailles = Object.fromEntries(origine('ordinateur', CONSULTANT).map((x) => [x.id, x.taille]));
  assert.deepEqual([tailles['a-faire'], tailles.equipe, tailles.semaine, tailles.reservations], ['grand', 'moyen', 'petit', 'petit']);
  const seul = { ...CONSULTANT, carteEquipe: false, cartesCouverts: false };
  assert.equal(origine('ordinateur', seul).find((x) => x.id === 'a-faire').taille, 'pleine');
});

test('garde fermée : un chiffre de gestion gardé ne se rend pas pour un cuisinier, et garde sa place', () => {
  const gardee = normaliserListe([{ id: 'chiffre-pertes', taille: 'moyen' }, { id: 'pointage', taille: 'grand' }], 'tablette');
  assert.deepEqual(ids(gardee), ['chiffre-pertes', 'pointage']);
  assert.equal(estVisible('chiffre-pertes', CUISINIER), false);
  assert.deepEqual(ids(gardee.filter((x) => estVisible(x.id, CUISINIER))), ['pointage']);
});

test('lecture prudente : inconnu, doublon, taille non permise, valeur illisible', () => {
  assert.deepEqual(normaliserListe([
    { id: 'inconnu', taille: 'petit' }, { id: 'a-faire', taille: 'petit' }, { id: 'a-faire', taille: 'grand' }, null, 'equipe', { id: 'equipe', taille: 'grand' },
  ], 'ordinateur'), [{ id: 'a-faire', taille: 'grand' }, { id: 'equipe', taille: 'grand' }]);
  assert.equal(normaliser('pas une disposition'), null);
  assert.equal(normaliser(42), null);
  assert.equal(normaliser(null), null);
  assert.equal(normaliser([]), null);
  assert.equal(normaliser({ v: 2, ordinateur: [] }), null);
  assert.equal(normaliser({ v: 1, ordinateur: 'abc' }), null);
  const lu = normaliser(JSON.stringify({ v: 1, telephone: [{ id: 'a-venir', taille: 'petit' }], raccourcis: ['haccp', 'haccp', 3] }));
  assert.deepEqual(lu, { v: 1, telephone: [{ id: 'a-venir', taille: 'pleine' }], raccourcis: ['haccp'] });
  // Poste sans liste gardée : son origine.
  assert.deepEqual(listeDuPoste(lu, 'ordinateur', CONSULTANT), origine('ordinateur', CONSULTANT));
  assert.deepEqual(listeDuPoste(lu, 'telephone', CONSULTANT), lu.telephone);
  assert.deepEqual(listeDuPoste(null, 'tablette', CUISINIER), origine('tablette', CUISINIER));
});

test('gestes : ajouter, retirer, déplacer, glisser, changer de taille', () => {
  const l = [{ id: 'a-faire', taille: 'grand' }, { id: 'chiffre-pertes', taille: 'petit' }, { id: 'equipe', taille: 'grand' }];
  assert.deepEqual(ids(ajouter(l, 'messages', 'ordinateur')), ['a-faire', 'chiffre-pertes', 'equipe', 'messages']);
  assert.equal(ajouter(l, 'messages', 'ordinateur').at(-1).taille, 'petit');
  assert.equal(ajouter(l, 'a-faire', 'ordinateur'), l, 'un widget se pose une seule fois');
  assert.equal(ajouter(l, 'inconnu', 'ordinateur'), l);
  assert.deepEqual(ids(retirer(l, 'equipe')), ['a-faire', 'chiffre-pertes']);
  assert.deepEqual(ids(deplacer(l, 'a-faire', 1)), ['chiffre-pertes', 'a-faire', 'equipe']);
  // Le chiffre caché au cuisinier est sauté : la flèche déplace ce qu'on voit.
  const vu = (id) => estVisible(id, CUISINIER);
  assert.deepEqual(ids(deplacer(l, 'a-faire', 1, vu)), ['chiffre-pertes', 'equipe', 'a-faire']);
  assert.deepEqual(ids(deplacer(l, 'equipe', -1, vu)), ['equipe', 'a-faire', 'chiffre-pertes']);
  assert.equal(deplacer(l, 'a-faire', -1), l, 'déjà en tête');
  assert.equal(deplacer(l, 'equipe', 1), l, 'déjà en fin');
  assert.deepEqual(ids(deplacerA(l, 'a-faire', 'equipe')), ['chiffre-pertes', 'equipe', 'a-faire']);
  assert.deepEqual(ids(deplacerA(l, 'equipe', 'a-faire')), ['equipe', 'a-faire', 'chiffre-pertes']);
  assert.equal(changerTaille(l, 'a-faire', 'petit'), l, 'taille non permise');
  assert.equal(changerTaille(l, 'a-faire', 'pleine')[0].taille, 'pleine');
  assert.ok(memeListe(l, [...l]) && !memeListe(l, retirer(l, 'equipe')));
});

test('raccourcis : choix gardé, défaut, et seulement les modules du menu', () => {
  const menu = [{ id: 'dashboard' }, { id: 'haccp' }, { id: 'planning' }, { id: 'commande' }, { id: 'recettes' }, { id: 'pertes' }];
  assert.deepEqual(ids(raccourcisAffiches(null, menu)), ['haccp', 'planning', 'commande', 'recettes']);
  assert.deepEqual(ids(raccourcisAffiches(['pertes', 'caisse', 'haccp'], menu)), ['pertes', 'haccp']);
  const items = [
    { id: 'haccp', permKey: 'haccp' }, { id: 'faq', permKey: 'faq' }, { id: 'journal', permKey: 'journal' },
    { id: 'kds', permKey: 'kds' }, { id: 'pertes', permKey: 'pertes' }, { id: 'spa', permKey: 'spa' },
  ];
  const menuCuisinier = modulesDuMenu({
    items, ordre: null, role: 'cuisinier', perms: { pertes: false }, defautsRole: { spa: false }, actif: () => true,
  });
  assert.deepEqual(ids(menuCuisinier), ['haccp', 'kds']);
  const eteint = modulesDuMenu({ items, ordre: null, role: 'consultant', perms: {}, defautsRole: {}, actif: (k) => k !== 'haccp' });
  assert.deepEqual(ids(eteint), ['faq', 'journal', 'kds', 'pertes', 'spa']);
});
