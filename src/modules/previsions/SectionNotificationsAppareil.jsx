import { PanneauNotifications, useNotificationsAppareil } from './NotificationsAppareil.jsx';

// Section « Notifications sur cet appareil » de la page des réglages : le
// panneau d'origine, posé dans la page, avec l'état et les trois gestes du
// même hook que la tuile « Prévenir cet appareil » de Réservations.
export default function SectionNotificationsAppareil({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const notifs = useNotificationsAppareil(etabId, user);
  if (!etabId) return null;
  return <PanneauNotifications notifs={notifs} />;
}
