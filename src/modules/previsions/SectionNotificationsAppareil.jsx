import { PanneauNotifications, useNotificationsAppareil } from './NotificationsAppareil.jsx';
import { ceQueRecoit, pageEssai } from '../caisse/avisPret.js';

// Section « Notifications sur cet appareil » de la page des réglages : le
// panneau d'origine, posé dans la page, avec l'état et les trois gestes du
// même hook que la tuile « Prévenir cet appareil » de Réservations.
// Ouverte à qui voit Réservations ou ouvre la Caisse (registreReglages) : le
// panneau annonce ce que la personne reçoit d'après ses droits, et l'essai de
// qui n'a pas Réservations ramène à la Caisse.
export default function SectionNotificationsAppareil({ user, etablissement, permissions }) {
  const etabId = etablissement?.id || null;
  const recoit = ceQueRecoit({ user, permissions, etablissement });
  const notifs = useNotificationsAppareil(etabId, user, { pageEssai: pageEssai(recoit) });
  if (!etabId) return null;
  return <PanneauNotifications notifs={notifs} recoit={recoit} />;
}
