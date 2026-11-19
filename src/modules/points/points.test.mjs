// node --test : logique pure du module Points & boutique (bareme.js), et
// miroir des listes JS avec celles de la migration SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACTIONS, BAREME_DEFAUT, COUT_MAX, COUT_MIN, EXPLICATIONS_ACTIONS, LIBELLES_ACTIONS, PLAFONDS_TOTAUX, ROLES_PARTICIPANTS, ROLES_JAMAIS,
  baremeEffectif, chiffresDuMois, entreeMenuVisible, erreurBareme, filtreParDefaut, filtrerCadeaux, libelleAction,
  messageCredit, peutGererPoints, prochainCadeau, raisonCommandeImpossible, MODULE_ACTION, actionsDeLEtablissement,
} from './bareme.js';
import { isModuleActiveForEtab, navItems, peutOuvrirPage, rolesEcritureBase } from '../moduleConfig.js';

const lireMigration = (nom) => readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${nom}`, import.meta.url)), 'utf8',
);
// La définition en vigueur est celle de la dernière migration qui la pose.
const MIGRATIONS = ['20261119_points_nouveaux_gestes.sql', '20261115_points_indicateurs.sql', '20261115_points_anti_fuite.sql',
  '20261114_points_boutique.sql'].map(lireMigration);

// Corps d'une fonction SQL, entre ses deux $fn$, dans la dernière migration qui la définit.
function corps(nom) {
  const migration = MIGRATIONS.find((m) => m.includes(`create or replace function public.${nom}(`));
  assert.ok(migration, `fonction ${nom} absente des migrations`);
  const debut = migration.indexOf(`create or replace function public.${nom}(`);
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

test('chaque geste a son explication, et le module qui le porte est un vrai module', () => {
  assert.deepEqual(Object.keys(EXPLICATIONS_ACTIONS).sort(), [...ACTIONS].sort());
  const cles = new Set(navItems.map((i) => i.permKey));
  for (const [action, module] of Object.entries(MODULE_ACTION)) {
    assert.ok(ACTIONS.includes(action), `${action} n'est pas au barème`);
    assert.ok(cles.has(module), `${module} n'est pas un module du menu`);
  }
});

test('gestes de l\'établissement : un module éteint retire ses gestes, la facture reste', () => {
  const restaurant = { modulesActifs: ['haccp', 'pertes', 'inventaire', 'planning', 'previsions', 'mep'] };
  const liste = actionsDeLEtablissement(restaurant, isModuleActiveForEtab);
  assert.ok(liste.includes('facture_achat'));
  assert.ok(liste.includes('reservation_saisie') && liste.includes('client_accueilli') && liste.includes('mep_cochee'));
  for (const a of ['passation_ecrite', 'tache_faite', 'chambre_prete', 'ordre_termine', 'seance_spa']) {
    assert.ok(!liste.includes(a), `${a} ne paraît pas sans son module`);
  }
  // Jamais réglé (modules_actifs NULL) : les modules « à activer » (hôtel, spa) restent éteints.
  const parDefaut = actionsDeLEtablissement({ modulesActifs: null }, isModuleActiveForEtab);
  assert.ok(parDefaut.includes('releve_haccp') && parDefaut.includes('mep_cochee'));
  assert.ok(!parDefaut.includes('chambre_prete') && !parDefaut.includes('seance_spa'));
  // Un spa : son compte rendu et le pointage, rien de la cuisine.
  const spa = actionsDeLEtablissement({ type: 'Spa', modulesActifs: ['spa', 'planning'] }, isModuleActiveForEtab);
  assert.deepEqual(spa, ['facture_achat', 'pointage_ponctuel', 'seance_spa']);
  // Sans fonction de contrôle : tout le barème, dans l'ordre.
  assert.deepEqual(actionsDeLEtablissement(null), ACTIONS);
  // Écran de l'employé : un serveur sans les Réservations (clé stricte) n'en voit pas les gestes.
  const serveur = { role: 'serveur' };
  const sansResa = actionsDeLEtablissement(restaurant, isModuleActiveForEtab, (m) => peutOuvrirPage(m, serveur, { mep: false }));
  assert.ok(!sansResa.includes('reservation_saisie') && !sansResa.includes('mep_cochee'));
  const avecResa = actionsDeLEtablissement(restaurant, isModuleActiveForEtab, (m) => peutOuvrirPage(m, serveur, { previsions: true }));
  assert.ok(avecResa.includes('reservation_saisie') && avecResa.includes('client_accueilli'));
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

test('miroir P2 : plafonds totaux, bornes du coût et catégories comme en base', () => {
  const p2 = lireMigration('20261115_points_anti_fuite.sql');
  assert.match(p2, /plafond_jour_total integer not null default 40/);
  assert.match(p2, /plafond_mois_total integer not null default 400/);
  assert.deepEqual(PLAFONDS_TOTAUX, { jour: 40, mois: 400 });
  assert.ok(p2.includes(`check (cout between ${COUT_MIN} and ${COUT_MAX})`), 'bornes du coût');
  assert.ok(p2.includes("check (categorie in ('cuisine', 'salle', 'commun'))"), 'catégories');
});

test("boutique : rangée choisie d'office selon le rôle", () => {
  assert.equal(filtreParDefaut('serveur'), 'salle');
  assert.equal(filtreParDefaut('hote'), 'salle');
  assert.equal(filtreParDefaut('cuisinier'), 'cuisine');
  assert.equal(filtreParDefaut('resp_cuisine'), 'cuisine');
  assert.equal(filtreParDefaut('receptionniste'), 'tout');
  assert.equal(filtreParDefaut('patron'), 'tout');
  assert.equal(filtreParDefaut(undefined), 'tout');
});

test('boutique : les cadeaux communs paraissent dans chaque rangée', () => {
  const cadeaux = [
    { id: 'c', categorie: 'cuisine' }, { id: 's', categorie: 'salle' }, { id: 'm', categorie: 'commun' }, { id: 'x' },
  ];
  assert.deepEqual(filtrerCadeaux(cadeaux, 'cuisine').map((c) => c.id), ['c', 'm', 'x']);
  assert.deepEqual(filtrerCadeaux(cadeaux, 'salle').map((c) => c.id), ['s', 'm', 'x']);
  assert.deepEqual(filtrerCadeaux(cadeaux, 'tout').map((c) => c.id), ['c', 's', 'm', 'x']);
  assert.deepEqual(filtrerCadeaux(null, 'salle'), []);
});

test('gestion : jamais pour un participant, même avec la case « Modifier »', () => {
  assert.equal(peutGererPoints('patron', true), true);
  assert.equal(peutGererPoints('consultant', true), true);
  assert.equal(peutGererPoints('patron', false), false);
  for (const role of ROLES_PARTICIPANTS) assert.equal(peutGererPoints(role, true), false, role);
  // La case de Rôles & accès est verrouillée hors direction (canManageModule lit rolesEcritureBase).
  assert.deepEqual(rolesEcritureBase.points, ['consultant', 'patron']);
});

test('miroir matin et soir : le texte du barème dit la même heure que la base', () => {
  const sql = lireMigration('20261115_points_haccp_matin_soir.sql');
  assert.ok(sql.includes("at time zone 'Europe/Zurich') < 15 then 'matin' else 'soir'"), 'bascule à 15 h en base');
  assert.match(EXPLICATIONS_ACTIONS.releve_haccp, /avant 15 h/);
});

// ── Lot P3 : pastilles et popup ──
import { fusionnerPopup, momentZurich, pastillePointage, pointsPastille } from './indicateurs.js';

const IND = {
  actif: true, participant: true, programme_aujourdhui: true, reste_jour: 30, reste_mois: 300,
  actions: {
    releve_haccp: { points: 2, plafond: 8, faits: 1, reste: 7 },
    photo_tracabilite: { points: 3, plafond: 3, faits: 3, reste: 0 },
    comptage_zone: { points: 10, plafond: 5, faits: 0, reste: 5 },
    inventaire_valide: { points: 20, plafond: 1, faits: 0, reste: 1 },
    pointage_ponctuel: { points: 2, plafond: 2, faits: 0, reste: 2 },
  },
  zones_payees: ['frigo-1'], perimetres_payes: ['cave'],
};

test('pastille : le geste qui paierait encore porte ses points, sinon rien', () => {
  assert.equal(pointsPastille(IND, 'releve_haccp', { zoneId: 'frigo-2' }), 2);
  assert.equal(pointsPastille(IND, 'releve_haccp', { zoneId: 'frigo-1' }), null, 'zone déjà payée pour la demi-journée');
  assert.equal(pointsPastille(IND, 'photo_tracabilite'), null, 'plafond du jour atteint');
  assert.equal(pointsPastille({ ...IND, reste_jour: 5 }, 'comptage_zone', { perimetre: 'Bar' }), null, 'reste du jour trop court');
  assert.equal(pointsPastille({ ...IND, reste_mois: 1 }, 'releve_haccp', {}), null, 'reste du mois trop court');
  assert.equal(pointsPastille(IND, 'comptage_zone', { perimetre: ' Cave ' }), null, 'périmètre payé dans les 7 jours');
  assert.equal(pointsPastille(IND, 'comptage_zone', { perimetre: 'Bar' }), 10);
  assert.equal(pointsPastille(IND, 'inconnue'), null);
});

test('pastille : aucune si éteint, non participant ou hors planning', () => {
  assert.equal(pointsPastille(null, 'releve_haccp'), null);
  assert.equal(pointsPastille({}, 'releve_haccp'), null);
  assert.equal(pointsPastille({ ...IND, actif: false }, 'releve_haccp'), null);
  assert.equal(pointsPastille({ ...IND, participant: false }, 'releve_haccp'), null);
  assert.equal(pointsPastille({ ...IND, programme_aujourdhui: false }, 'releve_haccp'), null);
});

test('demi-journée de Zurich : matin avant 15 h, soir dès 15 h, été comme hiver', () => {
  assert.equal(momentZurich(new Date('2026-11-15T13:59:59Z')), 'matin');
  assert.equal(momentZurich(new Date('2026-11-15T14:00:00Z')), 'soir');
  assert.equal(momentZurich(new Date('2026-07-15T12:59:00Z')), 'matin');
  assert.equal(momentZurich(new Date('2026-07-15T13:00:00Z')), 'soir');
});

test('pointage : pastille dans l\'heure qui précède le début du service, pas après, et pas une fois pointé', () => {
  const shift = { debut: '15:00', pointageDebut: null };
  assert.equal(pastillePointage(IND, shift, new Date('2026-11-15T13:59:00Z')), 2);
  assert.equal(pastillePointage(IND, shift, new Date('2026-11-15T13:00:00Z')), 2, '14:00, une heure avant pile');
  assert.equal(pastillePointage(IND, shift, new Date('2026-11-15T12:59:00Z')), null, "plus d'une heure avant");
  assert.equal(pastillePointage(IND, shift, new Date('2026-11-15T14:00:00Z')), 2, '15:00 pile compte');
  assert.equal(pastillePointage(IND, shift, new Date('2026-11-15T14:01:00Z')), null, 'en retard');
  assert.equal(pastillePointage(IND, { ...shift, pointageDebut: '14:50' }, new Date('2026-11-15T13:30:00Z')), null);
  assert.equal(pastillePointage(IND, { ...shift, note: 'Pointage hors planning' }, new Date('2026-11-15T13:30:00Z')), null);
  assert.equal(pastillePointage({ ...IND, programme_aujourdhui: false }, shift, new Date('2026-11-15T13:30:00Z')), null);
});

test('pointage : pas de pastille sur un service retouché par la personne elle-même', () => {
  const shift = { id: 's-1', debut: '15:00', pointageDebut: null };
  const maintenant = new Date('2026-11-15T13:30:00Z');
  assert.equal(pastillePointage(IND, shift, maintenant), 2);
  assert.equal(pastillePointage({ ...IND, services_sans_pointage: ['s-1'] }, shift, maintenant), null);
  assert.equal(pastillePointage({ ...IND, services_sans_pointage: ['s-2'] }, shift, maintenant), 2);
  const sql = lireMigration('20261115_points_shifts_retouche.sql');
  assert.ok(sql.includes("'services_sans_pointage'"), 'clé lue par la pastille, écrite par points_indicateurs');
  assert.match(EXPLICATIONS_ACTIONS.pointage_ponctuel, /que vous n'avez pas planifié vous-même/);
});

test('popup : crédits à moins de 1,5 s fondus en un seul, au-delà un popup neuf', () => {
  const a = fusionnerPopup(null, { points: 2, libelle: 'Relevé HACCP' }, 1000);
  assert.deepEqual(a, { points: 2, gestes: 1, libelle: 'Relevé HACCP', dernier: 1000 });
  const b = fusionnerPopup(a, { points: 3, libelle: 'Photo de traçabilité' }, 2400);
  assert.equal(b.points, 5);
  assert.equal(b.gestes, 2);
  const c = fusionnerPopup(b, { points: 2, libelle: 'Relevé HACCP' }, 4000);
  assert.deepEqual(c, { points: 2, gestes: 1, libelle: 'Relevé HACCP', dernier: 4000 });
});

test('miroir borne : la pastille et la base disent la même heure avant le début', () => {
  const sql = lireMigration('20261115_points_pointage_borne.sql');
  assert.ok(sql.includes("(new.date + new.debut) - interval '60 minutes'"), 'borne de 60 minutes en base');
  assert.match(EXPLICATIONS_ACTIONS.pointage_ponctuel, /dans l'heure qui précède le début/);
});

import { MOTIF_PHOTO_CADEAU, photoCadeauValide } from './bareme.js';

test('photo de cadeau : seulement le stockage Supabase, comme la contrainte en base', () => {
  const base = 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/recette-photos/etab-2/';
  assert.equal(photoCadeauValide(base + 'cadeau-catalogue-tastevin.webp'), true);
  assert.equal(photoCadeauValide('https://images.unsplash.com/photo-1.webp'), false, 'aucune autre source (CSP)');
  assert.equal(photoCadeauValide('http://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/x.webp'), false);
  assert.equal(photoCadeauValide(null), false);
  assert.equal(photoCadeauValide(base + 'x'.repeat(1000)), false, '1000 caractères au plus');
  const sql = lireMigration('20261115_points_cadeaux_photo.sql');
  assert.ok(sql.includes("photo_url ~ '" + MOTIF_PHOTO_CADEAU.source.split('\\/').join('/') + "'"), 'même motif en base et à l\'écran');
  assert.ok(sql.includes('length(photo_url) <= 1000'));
});

import { sourcePhotoValide } from './bareme.js';

test('crédit de photo : original en https, comme la contrainte en base', () => {
  assert.equal(sourcePhotoValide('https://commons.wikimedia.org/wiki/File:Paring_Knife.jpg'), true);
  assert.equal(sourcePhotoValide('http://exemple.invalid/x'), false);
  assert.equal(sourcePhotoValide('https://a b'), false);
  assert.equal(sourcePhotoValide(null), false);
  const sql = lireMigration('20261115_points_cadeaux_photo_credit.sql');
  assert.ok(sql.includes("photo_source ~ '^https://[^[:space:]]+$'"));
  assert.ok(sql.includes('length(photo_credit) <= 300'));
});

// Classement de l'équipe (17.11.2026) : podium, liste, personnes masquées.
const { classerEquipe } = await import('./classement.js');
const pers = (userId, solde, extra = {}) => ({ userId, prenom: userId, nom: '', role: 'cuisinier', actif: true, participant: true, exclu: false, solde, gagneMois: 0, ...extra });

test('classement : les personnes masquées disparaissent et les rangs se recomptent sans elles', () => {
  const soldes = [pers('a', 100), pers('b', 900), pers('c', 500), pers('d', 300), pers('e', 200)];
  const { podium, liste } = classerEquipe(soldes, new Set(['b']));
  assert.deepEqual(podium.map((p) => [p.userId, p.rang]), [['c', 1], ['d', 2], ['e', 3]]);
  assert.deepEqual(liste.map((p) => [p.userId, p.rang]), [['a', 4]]);
  assert.ok(![...podium, ...liste].some((p) => p.userId === 'b'));
});

test('classement : à solde égal même rang, puis le rang suivant saute', () => {
  const { podium, liste } = classerEquipe([pers('a', 50), pers('b', 50, { gagneMois: 10 }), pers('c', 20), pers('d', 20)], []);
  assert.deepEqual(podium.map((p) => [p.userId, p.rang]), [['b', 1], ['a', 1], ['c', 3]]);
  assert.deepEqual(liste.map((p) => [p.userId, p.rang]), [['d', 3]]);
});

test('classement : un solde nul n\'a ni rang ni place au podium', () => {
  const { podium, liste } = classerEquipe([pers('a', 0), pers('b', 40), pers('c', 0)], []);
  assert.deepEqual(podium.map((p) => p.userId), ['b']);
  assert.deepEqual(liste.map((p) => [p.userId, p.rang]), [['a', null], ['c', null]]);
});

test('classement : exclus, non participants et comptes désactivés hors classement, masqués exclus aussi', () => {
  const soldes = [pers('a', 10), pers('x', 999, { exclu: true }), pers('y', 5, { participant: false }), pers('z', 7, { actif: false }), pers('m', 3, { exclu: true })];
  const { podium, liste, hors } = classerEquipe(soldes, ['m']);
  assert.deepEqual(podium.map((p) => p.userId), ['a']);
  assert.equal(liste.length, 0);
  assert.deepEqual(hors.map((p) => p.userId), ['x', 'y', 'z']);
});
