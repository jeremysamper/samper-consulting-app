// node --test : réglages des modules (plan 15, lot 2). Une ligne absente vaut
// le comportement d'avant ; une valeur mal formée est lue comme absente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTIFS_PERTE_DEFAUT, TYPES_GROUPE_IDS, fusionnerConfig, lireReglagesModule, peutValider,
} from './reglagesModules.js';
import { creneauDuJour, jourSemaineIso } from '../modules/haccp/HACCP.utils.js';
import { avecEcheancesPrevues } from '../modules/factures-achats/echeancesPrevues.js';
import { joursFermesEnLigne, joursFermesMaison } from '../modules/previsions/joursFermesEnLigne.js';

test('sans ligne : les valeurs d\'avant le réglage', () => {
  assert.deepEqual(lireReglagesModule('pertes', null), { motifs: MOTIFS_PERTE_DEFAUT, motifsRegles: false, valideurs: null });
  const g = lireReglagesModule('groupes', undefined);
  assert.equal(g.delai_alerte_jours, 14);
  assert.deepEqual(g.types_actifs, TYPES_GROUPE_IDS);
  assert.equal(g.statuts.lu.actif, true);
  assert.deepEqual(lireReglagesModule('kds', {}), { son: false, attention_minutes: 7, retard_minutes: 12 });
  assert.deepEqual(lireReglagesModule('fiches_salle', {}).champs, { temps: true, accords: true, allergenes: true });
  assert.deepEqual(lireReglagesModule('catalogue', {}), { categories: [], unites: [] });
});

test('valeurs réglées, et valeurs mal formées lues comme absentes', () => {
  const p = lireReglagesModule('pertes', { motifs: ['Casse', ' casse ', '', 'Vol'], valideurs: ['patron', 'Pas Un Rôle'] });
  assert.deepEqual(p.motifs, ['Casse', 'Vol']);
  assert.deepEqual(p.valideurs, ['patron']);
  const k = lireReglagesModule('kds', { son: true, attention_minutes: 10, retard_minutes: 5 });
  assert.equal(k.son, true);
  assert.ok(k.retard_minutes > k.attention_minutes, 'le retard vient après l\'alerte');
  const g = lireReglagesModule('groupes', { delai_alerte_jours: 99, statuts: { lu: { actif: false, libelle: 'Vu' } }, types_actifs: ['mariage', 'inconnu'] });
  assert.equal(g.delai_alerte_jours, 14);
  assert.equal(g.statuts.lu.actif, false);
  assert.equal(g.statuts.lu.libelle, 'Vu');
  assert.deepEqual(g.types_actifs, ['mariage']);
  const c = lireReglagesModule('catalogue', { unites: [{ code: 'bouteille 75 cl', base: 'ml', facteur: 750 }, { code: 'x', base: 'kg', facteur: 1 }] });
  assert.deepEqual(c.unites, [{ code: 'bouteille 75 cl', base: 'ml', facteur: 750 }]);
});

test('écriture : les clés inconnues de la ligne sont gardées', () => {
  assert.deepEqual(fusionnerConfig({ motifs: ['A'], futur: 1 }, { valideurs: ['patron'] }), { motifs: ['A'], futur: 1, valideurs: ['patron'] });
});

test('qui valide : le réglage, sinon la règle d\'avant', () => {
  assert.equal(peutValider(null, 'cuisinier', true), true);
  assert.equal(peutValider(['patron'], 'cuisinier', true), false);
  assert.equal(peutValider(['cuisinier'], 'cuisinier', false), true);
});

test('HACCP : un créneau ne compte que ses jours', () => {
  assert.equal(jourSemaineIso('2026-11-23'), 1); // lundi
  assert.equal(jourSemaineIso('2026-11-22'), 7); // dimanche
  const sansLundi = { jours: [2, 3, 4, 5, 6, 7] };
  assert.equal(creneauDuJour(sansLundi, '2026-11-23'), false);
  assert.equal(creneauDuJour(sansLundi, '2026-11-24'), true);
  assert.equal(creneauDuJour({ jours: null }, '2026-11-23'), true);
});

test('échéance prévue : délai du fournisseur, sinon de la maison', () => {
  const docs = [
    { id: 1, typeDocument: 'facture', dateDocument: '2026-11-01', fournisseurId: 'f1' },
    { id: 2, typeDocument: 'facture', dateDocument: '2026-11-01', fournisseurId: 'f2' },
    { id: 3, typeDocument: 'facture', dateDocument: '2026-11-01', dateEcheance: '2026-11-05' },
    { id: 4, typeDocument: 'facture', dateDocument: '2026-11-01', regleLe: '2026-11-02' },
  ];
  const r = avecEcheancesPrevues(docs, { maison: 30, parFournisseur: new Map([['f1', 10]]) });
  assert.equal(r[0].dateEcheance, '2026-11-11');
  assert.equal(r[0].echeancePrevue, true);
  assert.equal(r[1].dateEcheance, '2026-12-01');
  assert.equal(r[2].echeancePrevue, undefined);
  assert.equal(r[3].dateEcheance, undefined);
});

test('réservation en ligne : jours fermés de la maison, plus les jours hérités', () => {
  const fermetures = { joursFermes: [1], periodes: [{ du: '2026-12-24', au: '2026-12-26' }], servicesFermes: {} };
  const jours = joursFermesMaison(fermetures, '2026-11-22', 10);
  assert.deepEqual(jours, ['2026-11-23', '2026-11-30']);
  const enLigne = joursFermesEnLigne(fermetures, ['2026-11-20', '2026-11-28'], '2026-11-22');
  assert.ok(enLigne.includes('2026-11-28'), 'un jour hérité à venir reste');
  assert.ok(!enLigne.includes('2026-11-20'), 'un jour passé sort');
  assert.ok(enLigne.includes('2026-12-25'), 'une période fermée y est');
});

test('lot 06 : sources de la prévision, pension éteinte par défaut et sur toute valeur mal formée', () => {
  for (const c of [null, {}, { sources: [] }, { sources: { pension: 'oui' } }, { sources: null }, { sources: { pension: 1 } }]) {
    assert.deepEqual(lireReglagesModule('previsions', c), { sources: { pension: false } }, JSON.stringify(c));
  }
  assert.deepEqual(lireReglagesModule('previsions', { sources: { pension: true } }), { sources: { pension: true } });
});
