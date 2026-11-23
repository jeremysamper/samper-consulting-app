import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLE_VUE_ROLE, ROLES_VUE, ecrireChoix, effacerChoix, lireChoix, libelleRole, peutChangerDeVue, profilAffiche, roleEffectif,
} from './vueRole.js';

const stockage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

const consultant = { id: 'u-consultant', role: 'consultant', prenom: 'Jérémie' };
const patron = { id: 'u-patron', role: 'patron' };
const cuisinier = { id: 'u-cuisinier', role: 'cuisinier' };

test('tous les rôles de l\'app sont proposés, le consultant en tête, avec un libellé', () => {
  assert.equal(ROLES_VUE[0], 'consultant');
  for (const r of ['patron', 'resp_cuisine', 'cuisinier', 'hote', 'serveur', 'praticien_spa']) assert.ok(ROLES_VUE.includes(r), r);
  assert.equal(new Set(ROLES_VUE).size, ROLES_VUE.length);
  for (const r of ROLES_VUE) assert.ok(libelleRole(r).length > 1, r);
});

test('consultant sans choix : consultant', () => {
  assert.equal(roleEffectif(consultant, null, true), 'consultant');
  assert.equal(profilAffiche(consultant, null, true), consultant);
});

test('consultant confirmé qui choisit un rôle : l\'interface prend ce rôle, le vrai rôle reste connu', () => {
  const s = stockage();
  ecrireChoix(consultant.id, 'cuisinier', s);
  const choix = lireChoix(s);
  assert.deepEqual(choix, { userId: consultant.id, role: 'cuisinier' });
  assert.equal(roleEffectif(consultant, choix, true), 'cuisinier');
  const vu = profilAffiche(consultant, choix, true);
  assert.equal(vu.role, 'cuisinier');
  assert.equal(vu.roleReel, 'consultant');
  assert.equal(vu.id, consultant.id, 'les actions restent au nom du consultant');
  assert.equal(consultant.role, 'consultant', 'le profil chargé n\'est pas modifié');
});

test('un non-consultant ne peut jamais l\'activer, même avec un sessionStorage forgé', () => {
  for (const profil of [patron, cuisinier]) {
    const s = stockage();
    s.setItem(CLE_VUE_ROLE, JSON.stringify({ userId: profil.id, role: 'consultant' }));
    assert.equal(roleEffectif(profil, lireChoix(s), true), profil.role);
    s.setItem(CLE_VUE_ROLE, JSON.stringify({ userId: profil.id, role: 'patron' }));
    assert.equal(roleEffectif(profil, lireChoix(s), true), profil.role);
    assert.equal(profilAffiche(profil, lireChoix(s), true), profil);
    assert.equal(peutChangerDeVue(profil, true), false);
  }
});

test('un consultant dont le rôle n\'est pas relu sur le serveur garde sa vue', () => {
  const choix = { userId: consultant.id, role: 'serveur' };
  assert.equal(roleEffectif(consultant, choix, false), 'consultant');
  assert.equal(roleEffectif(consultant, choix, undefined), 'consultant');
  assert.equal(peutChangerDeVue(consultant, false), false);
});

test('un choix fait par une autre personne, illisible ou d\'un rôle inconnu ne s\'applique pas', () => {
  assert.equal(roleEffectif(consultant, { userId: 'u-autre', role: 'cuisinier' }, true), 'consultant');
  const s = stockage();
  s.setItem(CLE_VUE_ROLE, '{pas du json');
  assert.equal(lireChoix(s), null);
  s.setItem(CLE_VUE_ROLE, JSON.stringify({ userId: consultant.id, role: 'admin' }));
  assert.equal(lireChoix(s), null);
  assert.equal(ecrireChoix(consultant.id, 'admin', s), null);
});

test('revenir à sa vue et la déconnexion effacent le choix', () => {
  const s = stockage();
  ecrireChoix(consultant.id, 'hote', s);
  ecrireChoix(consultant.id, 'consultant', s);
  assert.equal(lireChoix(s), null);
  ecrireChoix(consultant.id, 'hote', s);
  effacerChoix(s);
  assert.equal(lireChoix(s), null);
  assert.equal(s.m.size, 0);
  assert.equal(roleEffectif(consultant, lireChoix(s), true), 'consultant');
  assert.equal(roleEffectif(null, { userId: consultant.id, role: 'hote' }, true), null);
});
