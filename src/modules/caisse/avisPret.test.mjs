// node --test : avis « plats prêts » de la caisse, ce que décide l'écran.
//   - l'invitation de l'accueil de la Caisse (invitationAvisPret) ;
//   - ce que le panneau des réglages annonce d'après les droits (ceQueRecoit),
//     et où mène l'essai (pageEssai) ;
//   - la section « Notifications sur cet appareil » ouverte à qui ouvre la
//     Caisse, sans qu'aucun droit ne change.
// Les règles de l'envoi sont dans platsPrets.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceQueRecoit, clePlusTard, invitationAvisPret, pageEssai } from './avisPret.js';
import { sectionsVisibles } from '../compte/registreReglages.js';
import { defaultPermissions, navItems } from '../moduleConfig.js';
import { getPermissionsForRole } from '../../data/demoData.js';

// ── L'invitation de la Caisse et le panneau des réglages ────────────────────

test('invitation : montrée à qui ouvre la Caisse sur un appareil qui peut s\'abonner et ne l\'est pas', () => {
  assert.equal(invitationAvisPret({ ouvreCaisse: true, etat: 'inactif', plusTard: false }), 'activer');
});

test('invitation : iPhone ou iPad hors de l\'app installée, le mode d\'emploi', () => {
  assert.equal(invitationAvisPret({ ouvreCaisse: true, etat: 'ios-a-installer', plusTard: false }), 'ios');
});

test('invitation : rien si l\'appareil est abonné, bloqué, sans notifications, ou en cours de lecture', () => {
  for (const etat of ['actif', 'refuse', 'non-supporte', null, undefined]) {
    assert.equal(invitationAvisPret({ ouvreCaisse: true, etat, plusTard: false }), null, String(etat));
  }
});

test('invitation : « Plus tard » la range, et qui n\'ouvre pas la Caisse ne la voit jamais', () => {
  assert.equal(invitationAvisPret({ ouvreCaisse: true, etat: 'inactif', plusTard: true }), null);
  assert.equal(invitationAvisPret({ ouvreCaisse: true, etat: 'ios-a-installer', plusTard: true }), null);
  assert.equal(invitationAvisPret({ ouvreCaisse: false, etat: 'inactif', plusTard: false }), null);
  assert.notEqual(clePlusTard('u1'), clePlusTard('u2'), 'le choix est gardé par personne');
});

const TOUS_LES_MODULES = [...new Set(navItems.map((n) => n.permKey))];
const etab = (modulesActifs = TOUS_LES_MODULES) => ({ id: 'etab-test', nom: 'Maison', type: 'Hôtel-Restaurant', modulesActifs });
// Droits tels que l'app les lit : ceux du rôle en base par-dessus les défauts
// du code (getPermissionsForRole). En production le rôle serveur a
// previsions = false et aucune clé caisse : le défaut du code (true) vaut.
function avecDroits(role, enBase, fn) {
  globalThis.window = { DEMO_DATA: { permissions: { ...defaultPermissions, [role]: enBase }, permissionsPerso: null } };
  try { return fn(getPermissionsForRole(role)); } finally { delete globalThis.window; }
}

test('ce que reçoit un serveur sans Réservations : les plats prêts seulement, essai vers la Caisse', () => {
  avecDroits('serveur', { previsions: false, kds: false }, (permissions) => {
    const recoit = ceQueRecoit({ user: { id: 'u', role: 'serveur' }, permissions, etablissement: etab() });
    assert.deepEqual(recoit, { reservations: false, platsPrets: true });
    assert.equal(pageEssai(recoit), 'caisse');
  });
});

test('ce que reçoit qui voit Réservations : essai inchangé (Réservations)', () => {
  avecDroits('patron', {}, (permissions) => {
    const recoit = ceQueRecoit({ user: { id: 'u', role: 'patron' }, permissions, etablissement: etab() });
    assert.deepEqual(recoit, { reservations: true, platsPrets: true });
    assert.equal(pageEssai(recoit), undefined);
  });
  avecDroits('hote', {}, (permissions) => {
    const recoit = ceQueRecoit({ user: { id: 'u', role: 'hote' }, permissions, etablissement: etab() });
    assert.deepEqual(recoit, { reservations: true, platsPrets: false });
    assert.equal(pageEssai(recoit), undefined);
  });
});

test('caisse non activée pour l\'établissement : pas de plats prêts annoncés', () => {
  avecDroits('serveur', { previsions: false }, (permissions) => {
    const sansCaisse = etab(TOUS_LES_MODULES.filter((k) => k !== 'caisse'));
    const recoit = ceQueRecoit({ user: { id: 'u', role: 'serveur' }, permissions, etablissement: sansCaisse });
    assert.deepEqual(recoit, { reservations: false, platsPrets: false });
    assert.equal(pageEssai(recoit), undefined);
  });
});

const sectionNotifications = (role, permissions, etablissement = etab()) => sectionsVisibles({
  user: { id: 'u', role }, permissions, etablissement, shellMode: 'telephone',
}).some((s) => s.id === 'notifications');

test('réglages : la section Notifications s\'ouvre à qui ouvre la Caisse, même sans Réservations', () => {
  avecDroits('serveur', { previsions: false, kds: false }, (permissions) => {
    assert.equal(sectionNotifications('serveur', permissions), true);
  });
});

test('réglages : aucun droit ne change, qui n\'a ni Réservations ni Caisse n\'a toujours pas la section', () => {
  avecDroits('cuisinier', {}, (permissions) => {
    assert.equal(sectionNotifications('cuisinier', permissions), false);
  });
  avecDroits('serveur', { previsions: false, caisse: false }, (permissions) => {
    assert.equal(sectionNotifications('serveur', permissions), false);
  });
  avecDroits('serveur', { previsions: false }, (permissions) => {
    const sansCaisse = etab(TOUS_LES_MODULES.filter((k) => k !== 'caisse'));
    assert.equal(sectionNotifications('serveur', permissions, sansCaisse), false, 'caisse non activée pour la maison');
  });
});
