// node --test : note de mise à jour (lot N1). Cartes par droits, ligne des
// échéances, fenêtre de 7 jours, cartes Points, vu une fois, pages exclues,
// textes présents dans les deux glossaires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPermissions, getDefaultManageRoles, isModuleActiveForEtab } from '../../modules/moduleConfig.js';
import { lookupGlossary } from '../../i18n/glossary.js';
import {
  NOTE_ID, NOTE_DEBUT, cartesModules, composerNote, dansLaFenetre, fusionnerVues, marquerVues,
  memesVues, normaliserVues, pageExclue, rangDuJour, textesATraduire,
} from './nouveautesLogique.js';

// Clés de droit des modules du menu d'un rôle, avec ses défauts et les modules
// actifs de l'établissement, comme useVisibleNav (garde du KDS comprise).
const KDS = ['consultant', 'resp_cuisine', 'cuisinier'];
function droitsDuRole(role, etablissement = null) {
  return new Set(Object.entries(defaultPermissions[role])
    .filter(([cle, v]) => v === true && isModuleActiveForEtab(etablissement, cle))
    .filter(([cle]) => cle !== 'kds' || KDS.includes(role))
    .map(([cle]) => cle));
}
const gereFactures = (role) => getDefaultManageRoles('factures_achat').includes(role);
const ids = (cartes) => cartes.map((c) => c.id);
const J0 = NOTE_DEBUT;
const jour = (n) => {
  const d = new Date(`${NOTE_DEBUT}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const note = (role, extra = {}) => composerNote({
  jour: J0, vues: null, droits: droitsDuRole(role), gereFacturesAchat: gereFactures(role), ...extra,
});

test('cartes par rôle, dans l’ordre du brief', () => {
  assert.deepEqual(ids(note('cuisinier').cartes), ['dashboard', 'caisse', 'commande', 'messages']);
  assert.deepEqual(ids(note('serveur').cartes), ['dashboard', 'caisse', 'commande', 'messages']);
  assert.deepEqual(ids(note('resp_cuisine').cartes), ['dashboard', 'caisse', 'commande', 'messages', 'achats']);
  assert.deepEqual(ids(note('patron').cartes), ['dashboard', 'caisse', 'commande', 'messages', 'achats']);
  assert.deepEqual(ids(note('consultant').cartes), ['dashboard', 'caisse', 'commande', 'messages', 'achats']);
  // Hôte : ni tableau de bord, ni caisse, ni KDS dans ses défauts.
  assert.deepEqual(ids(note('hote').cartes), ['commande', 'messages']);
});

test('caisse et cuisine : caisse seule ou KDS seul suffisent', () => {
  assert.deepEqual(ids(cartesModules(new Set(['kds']))), ['caisse']);
  assert.deepEqual(ids(cartesModules(new Set(['caisse']))), ['caisse']);
  assert.deepEqual(ids(cartesModules(new Set(['planning']))), []);
});

test('modules actifs de l’établissement : un module retiré retire sa carte', () => {
  const etab = { id: 'e1', modulesActifs: ['dashboard', 'commande', 'messages'] };
  const r = composerNote({ jour: J0, droits: droitsDuRole('patron', etab), gereFacturesAchat: true });
  assert.deepEqual(ids(r.cartes), ['dashboard', 'commande', 'messages']);
});

test('ligne des échéances seulement avec le droit factures_achat', () => {
  const achats = (role) => note(role).cartes.find((c) => c.id === 'achats');
  const texte = (c) => c.lignes.map((l) => l.join(' '));
  assert.ok(texte(achats('patron')).includes('Suivez les échéances et les paiements.'));
  assert.ok(texte(achats('consultant')).includes('Suivez les échéances et les paiements.'));
  assert.ok(!texte(achats('resp_cuisine')).includes('Suivez les échéances et les paiements.'));
  assert.equal(achats('resp_cuisine').lignes.length, 2);
});

test('fenêtre de 7 jours : jour 0 et jour 6 oui, jour 7 et la veille non', () => {
  assert.equal(rangDuJour(jour(0)), 0);
  assert.equal(dansLaFenetre(jour(0)), true);
  assert.equal(dansLaFenetre(jour(6)), true);
  assert.equal(dansLaFenetre(jour(7)), false);
  assert.equal(dansLaFenetre(jour(-1)), false);
  assert.equal(dansLaFenetre('n’importe quoi'), false);
  assert.equal(note('cuisinier', { jour: jour(6) }).cartes.length, 4);
  assert.equal(note('cuisinier', { jour: jour(7) }).cartes.length, 0);
});

test('cartes Points selon allumé, participe, gère', () => {
  const p = (actif, participant, gere) => ({ actif, participant, gere });
  // Allumé et participe : carte équipe en tête.
  assert.equal(note('cuisinier', { points: p(true, true, false) }).cartes[0].id, 'points-equipe');
  // Allumé, ne participe pas ; éteint : rien.
  assert.ok(!ids(note('cuisinier', { points: p(true, false, false) }).cartes).includes('points-equipe'));
  assert.ok(!ids(note('cuisinier', { points: p(false, true, false) }).cartes).includes('points-equipe'));
  // Gère : carte gestion, allumé ou non, dans la note.
  assert.equal(note('patron', { points: p(false, false, true) }).cartes[0].id, 'points-gestion');
  assert.equal(note('patron', { points: p(true, false, true) }).cartes[0].id, 'points-gestion');
  // Hors de la fenêtre : la carte équipe se montre seule, la carte gestion non.
  const tard = note('cuisinier', { jour: jour(20), points: p(true, true, false) });
  assert.deepEqual(ids(tard.cartes), ['points-equipe']);
  assert.deepEqual(tard.marquer, ['points-equipe']);
  assert.deepEqual(ids(note('patron', { jour: jour(20), points: p(true, false, true) }).cartes), []);
  // Module Points absent du menu : aucune carte Points.
  const sansPoints = droitsDuRole('cuisinier');
  sansPoints.delete('points');
  assert.deepEqual(ids(composerNote({ jour: J0, droits: sansPoints, points: p(true, true, false) }).cartes), ['dashboard', 'caisse', 'commande', 'messages']);
});

test('vu une fois : la note puis chaque carte Points', () => {
  const premier = note('patron', { points: { gere: true } });
  assert.deepEqual(premier.marquer, [NOTE_ID, 'points-gestion']);
  const vues = marquerVues(null, premier.marquer, '2026-11-15T08:00:00.000Z');
  assert.deepEqual(note('patron', { vues, points: { gere: true } }).cartes, []);
  // Note vue, système allumé plus tard : la carte équipe vient seule, une fois.
  const vuesCuisinier = marquerVues(null, [NOTE_ID], '2026-11-15T08:00:00.000Z');
  const ensuite = note('cuisinier', { jour: jour(2), vues: vuesCuisinier, points: { actif: true, participant: true } });
  assert.deepEqual(ids(ensuite.cartes), ['points-equipe']);
  const apres = marquerVues(vuesCuisinier, ensuite.marquer, '2026-11-17T08:00:00.000Z');
  assert.deepEqual(note('cuisinier', { jour: jour(3), vues: apres, points: { actif: true, participant: true } }).cartes, []);
});

test('valeur gardée : lecture prudente, union poste et compte', () => {
  assert.deepEqual(normaliserVues('cassé'), { v: 1, vues: {} });
  assert.deepEqual(normaliserVues({ vues: { a: 'x', b: 3, c: '' } }), { v: 1, vues: { a: 'x' } });
  const poste = { v: 1, vues: { [NOTE_ID]: '2026-11-15T08:00:00Z' } };
  const compte = { v: 1, vues: { 'points-equipe': '2026-11-16T08:00:00Z', [NOTE_ID]: '2026-11-15T09:00:00Z' } };
  assert.deepEqual(fusionnerVues(poste, compte).vues, { [NOTE_ID]: '2026-11-15T08:00:00Z', 'points-equipe': '2026-11-16T08:00:00Z' });
  assert.equal(memesVues(fusionnerVues(poste, compte), compte), false);
  assert.equal(memesVues(compte, { ...compte }), true);
  // marquer ne réécrit pas une date déjà gardée.
  assert.equal(marquerVues(poste, [NOTE_ID], 'plus tard').vues[NOTE_ID], '2026-11-15T08:00:00Z');
});

test('aucune ouverture sur le KDS ni sur le pointage', () => {
  assert.equal(pageExclue('kds'), true);
  assert.equal(pageExclue('pointage'), true);
  assert.equal(pageExclue('dashboard'), false);
  assert.equal(pageExclue('accueil'), false);
});

test('chaque texte est dans les deux glossaires', () => {
  const manquants = [];
  textesATraduire().forEach((t) => {
    if (!lookupGlossary(t, 'en')) manquants.push(`en: ${t}`);
    if (!lookupGlossary(t, 'es')) manquants.push(`es: ${t}`);
  });
  assert.deepEqual(manquants, []);
  assert.ok(textesATraduire().length >= 30);
});
