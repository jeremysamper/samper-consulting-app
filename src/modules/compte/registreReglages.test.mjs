// node --test : le registre des réglages n'ouvre rien à personne et ne retire
// rien à personne. Pour chacun des onze rôles, les sections visibles sont
// celles que le rôle réglait déjà dans les modules avant le 12.11.2026
// (tableau écrit ici à la main, depuis les écrans d'origine), ni plus ni moins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPES, MODULES, RENVOIS, SECTIONS, cheminDe, chercherRenvois, chercherSections, entreesParGroupe, idEntree, renvoisVisibles, sectionsParGroupe, sectionsVisibles, signauxDe,
} from './registreReglages.js';
import { defaultPermissions, navItems, roles } from '../moduleConfig.js';
import { getPermissionsForRole } from '../../data/demoData.js';

const ROLES = Object.keys(roles);
const TOUS_LES_MODULES = [...new Set(navItems.map((n) => n.permKey))];
const etab = (modulesActifs = TOUS_LES_MODULES) => ({ id: 'etab-test', nom: 'Maison', type: 'Hôtel-Restaurant', modulesActifs });

// Droits personnels (table permissions_utilisateurs) : getPermissionsForRole
// les lit dans DEMO_DATA, posé sur window par l'app.
function avecEcart(role, perms, fn) {
  globalThis.window = { DEMO_DATA: { permissions: defaultPermissions, permissionsPerso: perms ? { role, perms } : null } };
  try { return fn(); } finally { delete globalThis.window; }
}
const visibles = (role, { shellMode = 'ordinateur', etablissement = etab() } = {}) => (
  sectionsVisibles({ user: { id: 'u', role }, permissions: getPermissionsForRole(role), etablissement, shellMode })
    .map((s) => s.id)
);

// Qui réglait quoi avant, droits par défaut du code, tous les modules activés,
// à l'ordinateur.
const DIRECTION = ['consultant', 'patron'];
const AVANT = {
  parametres: ['consultant'],
  logo: ['consultant'],
  ordre_menu: ['consultant'],
  alertes: ['consultant'],
  caisse: ['consultant', 'patron', 'resp_cuisine'],
  planning_modeles: ['consultant', 'patron', 'resp_cuisine'],
  planning_groupes: ['consultant', 'patron', 'resp_cuisine'],
  planning_contrats: ['consultant', 'patron', 'resp_cuisine'],
  reservation_en_ligne: DIRECTION,
  comptabilite: DIRECTION,
  haccp: ['consultant'],
  spa_en_ligne: DIRECTION,
  hebergement_tarifs: DIRECTION,
  hebergement_chambres: DIRECTION,
  activites_forfaits: DIRECTION,
  passations_taches: ['consultant', 'patron', 'resp_cuisine', 'receptionniste', 'gouvernante'],
  technique_equipements: ['consultant', 'patron', 'gouvernante', 'technicien'],
  roles: ['consultant'],
  mon_compte: ROLES,
  apparence: ROLES,
  // 15.11.2026 : préférences de l'appareil, ouvertes à toute personne connectée.
  langue: ROLES,
  demarrage: ROLES,
  menu_gestes: ROLES,
  notifications: ['consultant', 'patron', 'resp_cuisine', 'serveur', 'hote', 'receptionniste'],
  // Lot R3 : réglages sortis de leur écran de travail.
  spa_emails: DIRECTION,
  factures_textes: ['consultant'],
  factures_email: ['consultant'],
  technique_plans: ['consultant', 'patron', 'gouvernante', 'technicien'],
  plan_salle: ['consultant', 'patron', 'resp_cuisine', 'hote'],
  // 14.11.2026 : la fenêtre « Gérer » de l'accueil de l'Inventaire (droit
  // « Modifier » du module, donné par défaut à ces trois rôles).
  inventaire_gerer: ['consultant', 'patron', 'resp_cuisine'],
};

test('le registre est bien formé : ids uniques, groupes connus, une section à charger', () => {
  const ids = SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const groupes = GROUPES.map((g) => g.id);
  for (const s of SECTIONS) {
    assert.ok(groupes.includes(s.groupe), s.id);
    assert.equal(typeof s.garde, 'function', s.id);
    assert.equal(typeof s.charger, 'function', s.id);
    assert.ok(s.libelle && ['maison', 'personne', 'appareil'].includes(s.portee), s.id);
  }
  assert.deepEqual(Object.keys(AVANT).sort(), [...ids].sort(), 'chaque section a sa ligne dans le tableau de ce test');
});

test('onze rôles : sections visibles égales aux réglages accessibles avant', () => {
  for (const role of ROLES) {
    const attendu = Object.keys(AVANT).filter((id) => AVANT[id].includes(role)).sort();
    assert.deepEqual(visibles(role).sort(), attendu, role);
  }
});

test('toute personne a au moins ses préférences : la page s\'ouvre à tous', () => {
  for (const role of ROLES) {
    const vues = visibles(role, { shellMode: 'telephone', etablissement: etab(['planning']) });
    assert.ok(vues.includes('apparence') && vues.includes('mon_compte'), role);
  }
});

test('un module non activé pour l\'établissement ferme ses réglages, même au consultant', () => {
  const sansCaisse = etab(TOUS_LES_MODULES.filter((k) => !['caisse', 'spa', 'hebergement', 'planning'].includes(k)));
  const vues = visibles('consultant', { etablissement: sansCaisse });
  for (const id of ['caisse', 'spa_en_ligne', 'hebergement_tarifs', 'hebergement_chambres', 'planning_modeles', 'planning_groupes', 'planning_contrats']) {
    assert.equal(vues.includes(id), false, id);
  }
  assert.ok(vues.includes('haccp') && vues.includes('parametres'));
});

test('un établissement jamais réglé (modules_actifs absent) n\'a pas les réglages des modules à activer', () => {
  const vues = visibles('patron', { etablissement: { id: 'e', nom: 'Maison', type: 'Restaurant', modulesActifs: null } });
  for (const id of ['spa_en_ligne', 'hebergement_tarifs', 'hebergement_chambres', 'activites_forfaits', 'passations_taches', 'technique_equipements']) {
    assert.equal(vues.includes(id), false, id);
  }
  assert.ok(vues.includes('caisse') && vues.includes('reservation_en_ligne') && vues.includes('comptabilite'));
});

test('ordre du menu et logo : à l\'ordinateur seulement, comme la barre latérale', () => {
  for (const shellMode of ['tablette', 'telephone']) {
    const vues = visibles('consultant', { shellMode });
    assert.equal(vues.includes('ordre_menu'), false, shellMode);
    assert.equal(vues.includes('logo'), false, shellMode);
    assert.ok(vues.includes('parametres'), shellMode);
  }
});

test('un droit personnel qui diffère du rôle : la section suit la personne, comme le module', () => {
  // Une serveuse à qui l'on a donné « Modifier » sur le Planning.
  avecEcart('serveur', { 'manage:planning': true }, () => {
    const vues = visibles('serveur');
    for (const id of ['planning_modeles', 'planning_groupes', 'planning_contrats']) assert.ok(vues.includes(id), id);
    assert.equal(vues.includes('caisse'), false, 'la caisse se règle par rôle, pas par ce droit');
  });
  // Un patron à qui l'on a retiré la Caisse et le droit de régler les factures.
  avecEcart('patron', { caisse: false, 'manage:factures_achat': false }, () => {
    const vues = visibles('patron');
    assert.equal(vues.includes('caisse'), false);
    assert.equal(vues.includes('comptabilite'), false);
    assert.ok(vues.includes('reservation_en_ligne'));
  });
  // Un cuisinier à qui l'on a ouvert les Réservations : il peut prévenir son appareil.
  avecEcart('cuisinier', { previsions: true }, () => {
    assert.ok(visibles('cuisinier').includes('notifications'));
    assert.equal(visibles('cuisinier').includes('reservation_en_ligne'), false);
  });
});

test('signaux de changement : l\'id de la section, ou les tables nommées', () => {
  assert.deepEqual(signauxDe('caisse'), ['caisse']);
  assert.deepEqual(signauxDe('spa_emails'), ['spa_parametres', 'spa_boite']);
  assert.deepEqual(signauxDe('hebergement_tarifs'), ['table:tarifs', 'table:hotel_reglages']);
  assert.deepEqual(signauxDe('inconnue'), []);
});

test('les sections se rangent par groupe, sans groupe vide', () => {
  const groupes = sectionsParGroupe(SECTIONS.filter((s) => s.groupe !== 'maison'));
  assert.deepEqual(groupes.map((g) => g.id), ['moi', 'appareil', 'modules']);
  assert.deepEqual(GROUPES.map((g) => g.id), ['moi', 'appareil', 'maison', 'modules']);
});

test('hiérarchie : une entrée par module, ses sections en pilules nommées', () => {
  for (const s of SECTIONS.filter((x) => x.groupe === 'modules')) {
    assert.ok(MODULES[s.module], `${s.id} : module connu`);
  }
  const groupes = entreesParGroupe(sectionsVisibles({ user: { id: 'u', role: 'consultant' }, permissions: getPermissionsForRole('consultant'), etablissement: etab(), shellMode: 'ordinateur' }));
  const modules = groupes.find((g) => g.id === 'modules').entrees;
  const planning = modules.find((e) => e.id === 'module:planning');
  assert.deepEqual(planning.sections.map((s) => s.id), ['planning_modeles', 'planning_groupes', 'planning_contrats']);
  assert.deepEqual(planning.detail, ["Modèles d'horaires", 'Groupes', 'Contrats']);
  // Chaque section d'un module à plusieurs sections a sa pilule.
  for (const e of modules.filter((x) => x.sections.length > 1)) {
    for (const s of e.sections) assert.ok(s.onglet, `${s.id} : onglet`);
  }
  // Une entrée par module, jamais deux.
  assert.equal(new Set(modules.map((e) => e.id)).size, modules.length);
  // Hors modules, une entrée par section.
  const appareil = groupes.find((g) => g.id === 'appareil').entrees;
  assert.deepEqual(appareil.map((e) => e.id), ['apparence', 'langue', 'demarrage', 'menu_gestes', 'notifications']);
  assert.equal(idEntree(SECTIONS.find((s) => s.id === 'spa_emails')), 'module:spa');
  assert.equal(idEntree(SECTIONS.find((s) => s.id === 'roles')), 'roles');
});

test('recherche : libellé, mots-clés, nom du module, sans accents ; vide sans requête', () => {
  const tout = sectionsVisibles({ user: { id: 'u', role: 'consultant' }, permissions: getPermissionsForRole('consultant'), etablissement: etab(), shellMode: 'ordinateur' });
  const ids = (q) => chercherSections(tout, q).map((s) => s.id);
  assert.deepEqual(ids(''), []);
  assert.ok(ids('sombre').includes('apparence'));
  assert.ok(ids('theme').includes('apparence'));
  assert.deepEqual(ids('planning contrats'), ['planning_contrats']);
  assert.ok(ids('tablette').includes('menu_gestes'));
  assert.deepEqual(cheminDe(SECTIONS.find((s) => s.id === 'plan_salle')), ['Les modules', 'Réservations']);
  assert.deepEqual(cheminDe(SECTIONS.find((s) => s.id === 'apparence')), ['Cet appareil']);
});

// 18.11.2026 : petits réglages rendus à leur module. La recherche les trouve
// encore, pour les mêmes rôles qu'avant, et mène au module ; ils ne sont plus
// des sections.
const RENVOI_AVANT = {
  renvoi_carte_accueil: ['consultant', 'patron', 'resp_cuisine'],
  renvoi_planning_masques: DIRECTION,
  renvoi_caisse_mode_test: ['consultant', 'patron', 'resp_cuisine'],
};

test('renvois : mêmes rôles qu\'avant, trouvés par la recherche, jamais des sections', () => {
  assert.deepEqual(RENVOIS.map((r) => r.id).sort(), Object.keys(RENVOI_AVANT).sort());
  for (const r of RENVOIS) {
    assert.ok(r.page && r.ou && r.libelle, r.id);
    assert.equal(r.charger, undefined, r.id);
    assert.equal(SECTIONS.some((s) => s.id === r.id), false, r.id);
  }
  for (const role of ROLES) {
    const vus = renvoisVisibles({ user: { id: 'u', role }, permissions: getPermissionsForRole(role), etablissement: etab(), shellMode: 'ordinateur' }).map((r) => r.id).sort();
    const attendu = Object.keys(RENVOI_AVANT).filter((id) => RENVOI_AVANT[id].includes(role)).sort();
    assert.deepEqual(vus, attendu, role);
  }
  const tout = renvoisVisibles({ user: { id: 'u', role: 'patron' }, permissions: getPermissionsForRole('patron'), etablissement: etab(), shellMode: 'ordinateur' });
  assert.deepEqual(chercherRenvois(tout, 'masquées').map((r) => r.id), ['renvoi_planning_masques']);
  assert.deepEqual(chercherRenvois(tout, 'mode test').map((r) => r.id), ['renvoi_caisse_mode_test']);
  assert.deepEqual(chercherRenvois(tout, ''), []);
});
