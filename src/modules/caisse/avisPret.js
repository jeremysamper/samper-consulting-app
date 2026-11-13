import { isPageActiveForEtab, peutOuvrirPage } from '../moduleConfig.js';

// ─────────────────────────────────────────────────────────────────────────────
// Avis « plats prêts » : ce que décide l'écran, sans réseau.
//
// Quand la cuisine coche au KDS des plats envoyés depuis la caisse, la
// personne qui les a envoyés reçoit une notification sur ses appareils
// abonnés (base : trg_caisse_ligne_pret_avis ; envoi : Edge Function
// notifications, action plats_prets). Ici : qui se voit proposer d'activer
// son appareil, et ce que le panneau des réglages lui annonce.
// Aucun droit n'est lu ailleurs que dans moduleConfig : rien n'est ouvert à
// personne.
// ─────────────────────────────────────────────────────────────────────────────

// Ce qu'un appareil abonné reçoit, d'après les droits de la personne :
// les réservations en ligne si elle voit Réservations (même règle que l'envoi,
// gardeReservations), les plats prêts si elle ouvre la Caisse.
export function ceQueRecoit({ user, permissions, etablissement }) {
  const ouvre = (page) => peutOuvrirPage(page, user, permissions) && isPageActiveForEtab(etablissement, page);
  return { reservations: ouvre('previsions'), platsPrets: ouvre('caisse') };
}

// Où mène le tap de la notification d'essai : la Caisse pour qui n'a pas
// Réservations. undefined = le défaut du serveur (Réservations).
export function pageEssai(recoit) {
  return recoit && !recoit.reservations && recoit.platsPrets ? 'caisse' : undefined;
}

// Choix « Plus tard » de l'invitation, gardé sur l'appareil, par personne.
export const clePlusTard = (userId) => `sc_caisse_avis_pret_plus_tard_${userId}`;

// L'invitation de l'accueil de la Caisse.
//   etat : état de cet appareil pour l'établissement (services/pushNotifications,
//          etatPush) : 'actif' | 'inactif' | 'refuse' | 'ios-a-installer' |
//          'non-supporte' | null (lecture en cours).
// Rend :
//   'activer' : la ligne « Être prévenu quand c'est prêt », Activer et Plus tard ;
//   'ios'     : iPhone ou iPad hors de l'app installée, le mode d'emploi ;
//   null      : rien (pas le droit, déjà abonné, bloqué par le navigateur,
//               appareil sans notifications, lecture en cours, ou « Plus tard »).
export function invitationAvisPret({ ouvreCaisse, etat, plusTard }) {
  if (!ouvreCaisse || plusTard) return null;
  if (etat === 'inactif') return 'activer';
  if (etat === 'ios-a-installer') return 'ios';
  return null;
}
