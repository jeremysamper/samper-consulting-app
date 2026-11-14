// node --test : peutOuvrirPage (moduleConfig.js) rend, pour chaque page, la
// condition que LegacyModuleHost portait en dur avant le 12.11.2026. Les règles
// d'avant sont recopiées ici, telles quelles : toute différence est un accès
// gagné ou perdu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPermissions, navItems, peutAdministrerCompte, peutOuvrirCompte, peutOuvrirPage, roles } from './moduleConfig.js';

const consultant = (u, p) => u.role === 'consultant' && p.consultant_tools !== false;
const ouverte = (cle) => (u, p) => p[cle] !== false;
const stricte = (cle) => (u, p) => p[cle] === true;

const AVANT = {
  dashboard: () => true,
  accueil: () => true,
  planning: ouverte('planning'),
  pointage: ouverte('planning'),
  messages: ouverte('messages'),
  journal: (u, p) => ['consultant', 'patron'].includes(u.role) && p.journal !== false,
  comptabilite: stricte('comptabilite'),
  statistiques: stricte('statistiques'),
  cartes: ouverte('recettes'),
  inventaire: ouverte('inventaire'),
  achats: ouverte('inventaire'),
  pertes: ouverte('pertes'),
  haccp: ouverte('haccp'),
  previsions: stricte('previsions'),
  spa: ouverte('spa'),
  groupes: ouverte('groupes'),
  hebergement: ouverte('hebergement'),
  etages: ouverte('etages'),
  demandes: ouverte('demandes'),
  activites: ouverte('activites'),
  passations: ouverte('passations'),
  repas: ouverte('repas'),
  technique: ouverte('technique'),
  fiches_salle: ouverte('fiches_salle'),
  documents: ouverte('documents'),
  faq: (u) => u.role === 'consultant',
  catalogue: ouverte('catalogue'),
  sop: ouverte('sop'),
  consultant_tools: consultant,
  factures: consultant,
  parametres: consultant,
  roles: consultant,
  caisse: stricte('caisse'),
  pos: ouverte('pos'),
  commande: ouverte('commande'),
  mep: ouverte('mep'),
  kds: (u, p) => ['consultant', 'resp_cuisine', 'cuisinier'].includes(u.role) && p.kds !== false,
  // Points & boutique (14.11.2026, page neuve) : ouverte sauf clé retirée ;
  // le module ferme lui-même son écran à qui ne participe pas.
  points: ouverte('points'),
};

const ROLES = Object.keys(roles);
const CLES = Object.keys(defaultPermissions.consultant);
const tout = (valeur) => Object.fromEntries(CLES.map((c) => [c, valeur]));
// Droits d'un rôle tels que le code les donne, puis trois cas limites : tout
// accordé, tout retiré, aucune clé (ligne du rôle absente de la base).
const variantes = (role) => [
  ['défauts', defaultPermissions[role]],
  ['tout accordé', tout(true)],
  ['tout retiré', tout(false)],
  ['aucune clé', {}],
];

test('onze rôles', () => {
  assert.equal(ROLES.length, 11);
});

test('chaque page du menu a sa règle d\'avant dans ce test', () => {
  for (const item of navItems) assert.ok(AVANT[item.id], item.id);
});

test('peutOuvrirPage rend la condition d\'avant, pour chaque rôle et chaque page', () => {
  for (const role of ROLES) {
    for (const [nom, droits] of variantes(role)) {
      for (const [page, regle] of Object.entries(AVANT)) {
        assert.equal(
          peutOuvrirPage(page, { role }, droits),
          regle({ role }, droits),
          `${page}, ${role}, ${nom}`,
        );
      }
    }
  }
});

test('une clé retirée une à une ferme la page qui la lit, et elle seule parmi les pages ouvertes', () => {
  for (const role of ROLES) {
    for (const cle of CLES) {
      const droits = { ...tout(true), [cle]: false };
      for (const [page, regle] of Object.entries(AVANT)) {
        assert.equal(peutOuvrirPage(page, { role }, droits), regle({ role }, droits), `${page}, ${role}, sans ${cle}`);
      }
    }
  }
});

test('une page inconnue affiche le tableau de bord : elle s\'ouvre', () => {
  assert.equal(peutOuvrirPage('page_inconnue', { role: 'serveur' }, {}), true);
});

test('la page des réglages s\'ouvre à toute personne connectée, et à personne sans rôle', () => {
  for (const role of ROLES) assert.equal(peutOuvrirPage('compte', { role }, defaultPermissions[role]), true, role);
  assert.equal(peutOuvrirCompte(null), false);
  assert.equal(peutOuvrirPage('compte', {}, {}), false);
});

test('les trois sections d\'origine restent au consultant qui a les Outils consultant', () => {
  for (const role of ROLES) {
    assert.equal(peutAdministrerCompte({ role }, defaultPermissions[role]), role === 'consultant', role);
    assert.equal(peutAdministrerCompte({ role }, tout(true)), role === 'consultant', role);
  }
  assert.equal(peutAdministrerCompte({ role: 'consultant' }, { consultant_tools: false }), false);
});
