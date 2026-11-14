// node --test : logique pure du module Points & boutique (bareme.js), et
// miroir des listes JS avec celles de la migration SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACTIONS, BAREME_DEFAUT, LIBELLES_ACTIONS, ROLES_PARTICIPANTS, ROLES_JAMAIS,
  baremeEffectif, chiffresDuMois, entreeMenuVisible, erreurBareme, libelleAction,
  messageCredit, prochainCadeau, raisonCommandeImpossible,
} from './bareme.js';

const migration = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20261114_points_boutique.sql', import.meta.url)), 'utf8',
);

// Corps d'une fonction SQL de la migration, entre ses deux $fn$.
function corps(nom) {
  const debut = migration.indexOf(`create or replace function public.${nom}(`);
  assert.ok(debut >= 0, `fonction ${nom} absente de la migration`);
  const a = migration.indexOf('$fn$', debut);
  const b = migration.indexOf('$fn$', a + 4);
  return migration.slice(a + 4, b);
}

test('miroir : les clés et valeurs du barème JS sont celles de points_bareme_defaut()', () => {
  const sql = corps('points_bareme_defaut');
  const json = JSON.parse(sql.slice(sql.indexOf("'") + 1, sql.lastIndexOf("'")));
  assert.deepEqual(Object.keys(json).sort(), Object.keys(BAREME_DEFAUT).sort());
  assert.deepEqual(json, BAREME_DEFAUT);
});

test('miroir : les rôles participants par défaut sont ceux de points_roles_defaut()', () => {
  const sql = corps('points_roles_defaut');
  const roles = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(roles, ROLES_PARTICIPANTS);
  for (const r of ROLES_JAMAIS) assert.ok(!ROLES_PARTICIPANTS.includes(r), `${r} ne participe jamais`);
});

test('miroir : chaque action a le même libellé fixe des deux côtés', () => {
  const sql = corps('points_libelle_action');
  const paires = Object.fromEntries([...sql.matchAll(/when '([a-z_]+)'\s+then '((?:[^']|'')*)'/g)]
    .map((m) => [m[1], m[2].replace(/''/g, "'")]));
  assert.deepEqual(paires, LIBELLES_ACTIONS);
  assert.deepEqual(Object.keys(LIBELLES_ACTIONS).sort(), [...ACTIONS].sort());
});

test('libellés des actions : fixes, en français, repli sur la clé', () => {
  assert.equal(libelleAction('releve_haccp'), 'Relevé HACCP');
  assert.equal(libelleAction('facture_achat'), "Facture d'achat");
  assert.equal(libelleAction('inconnue'), 'inconnue');
  assert.equal(libelleAction(null), '');
  assert.equal(messageCredit({ points: 2, libelle: 'Relevé HACCP' }), '+2 points : Relevé HACCP');
  assert.equal(messageCredit({ points: 1, action: 'perte_declaree' }), '+1 point : Perte déclarée');
});

test('entrée de menu : gestionnaire toujours, employé seulement actif ET participant', () => {
  assert.equal(entreeMenuVisible({ actif: false, participant: false, gere: true }), true);
  assert.equal(entreeMenuVisible({ actif: true, participant: false, gere: true }), true);
  assert.equal(entreeMenuVisible({ actif: true, participant: true, gere: false }), true);
  assert.equal(entreeMenuVisible({ actif: false, participant: true, gere: false }), false);
  assert.equal(entreeMenuVisible({ actif: true, participant: false, gere: false }), false);
  assert.equal(entreeMenuVisible({ actif: false, participant: false, gere: false }), false);
  assert.equal(entreeMenuVisible(undefined), false);
});

test('prochain cadeau abordable : le moins cher que le solde ne couvre pas encore', () => {
  const cadeaux = [
    { id: 'a', nom: 'Café', cout: 20, stock: null, actif: true },
    { id: 'b', nom: 'Repas', cout: 150, stock: 3, actif: true },
    { id: 'c', nom: 'Bon', cout: 80, stock: 0, actif: true },
    { id: 'd', nom: 'Couteau', cout: 60, stock: 1, actif: false },
    { id: 'e', nom: 'Tablier', cout: 100, stock: null, actif: true },
  ];
  const p = prochainCadeau(cadeaux, 45);
  assert.equal(p.cadeau.id, 'e');
  assert.equal(p.manque, 55);
  assert.equal(p.part, 0.45);
  assert.equal(prochainCadeau(cadeaux, 0).cadeau.id, 'a');
  assert.equal(prochainCadeau(cadeaux, 500), null);
  assert.equal(prochainCadeau([], 10), null);
  assert.equal(prochainCadeau(null, 10), null);
});

test('commande éteinte : solde court, stock vide ou cadeau retiré, toujours expliqué', () => {
  assert.equal(raisonCommandeImpossible({ cout: 20, stock: null, actif: true }, 25), null);
  assert.equal(raisonCommandeImpossible({ cout: 20, stock: null, actif: true }, 20), null);
  assert.deepEqual(raisonCommandeImpossible({ cout: 20, stock: null, actif: true }, 19), { cle: 'manque', manque: 1 });
  assert.deepEqual(raisonCommandeImpossible({ cout: 20, stock: null, actif: true }, 5), { cle: 'manque', manque: 15 });
  assert.deepEqual(raisonCommandeImpossible({ cout: 20, stock: 0, actif: true }, 100), { cle: 'stock' });
  assert.deepEqual(raisonCommandeImpossible({ cout: 20, stock: 2, actif: false }, 100), { cle: 'retire' });
});

test('barème : valeur lisible gardée, illisible ou absente ramenée au défaut', () => {
  const eff = baremeEffectif({ releve_haccp: { points: 4, plafond: 3 }, pertes: { points: 9 }, comptage_zone: { points: 'x', plafond: 2 } });
  assert.deepEqual(eff.releve_haccp, { points: 4, plafond: 3 });
  assert.deepEqual(eff.comptage_zone, BAREME_DEFAUT.comptage_zone);
  assert.deepEqual(eff.facture_achat, BAREME_DEFAUT.facture_achat);
  assert.equal(Object.keys(eff).length, ACTIONS.length);
  assert.deepEqual(baremeEffectif(null), BAREME_DEFAUT);
  assert.equal(erreurBareme({ releve_haccp: { points: 101, plafond: 3 } }), 'Relevé HACCP : les points vont de 0 à 100.');
  assert.equal(erreurBareme({ releve_haccp: { points: 2, plafond: 51 } }), 'Relevé HACCP : le plafond va de 0 à 50.');
  assert.equal(erreurBareme(BAREME_DEFAUT), null);
});

test('chiffres du mois : crédits moins annulations, jour de Zurich', () => {
  const maintenant = new Date('2026-11-14T20:00:00Z');
  const mouvements = [
    { sens: 'credit', points: 2, createdAt: '2026-11-14T08:00:00Z' },
    { sens: 'credit', points: 3, createdAt: '2026-11-02T08:00:00Z' },
    { sens: 'annulation', points: -2, createdAt: '2026-11-14T09:00:00Z' },
    { sens: 'commande', points: -20, createdAt: '2026-11-10T09:00:00Z' },
    // 31 octobre 23 h 30 à Zurich : encore octobre
    { sens: 'credit', points: 10, createdAt: '2026-10-31T22:30:00Z' },
    // 31 octobre 23 h 30 UTC : 1er novembre à Zurich
    { sens: 'credit', points: 5, createdAt: '2026-10-31T23:30:00Z' },
  ];
  assert.deepEqual(chiffresDuMois(mouvements, maintenant), { gagnes: 8, gestes: 2 });
  assert.deepEqual(chiffresDuMois([], maintenant), { gagnes: 0, gestes: 0 });
});
