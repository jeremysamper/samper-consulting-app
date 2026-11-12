import ReglagesTableEnLigne from './ReglagesTableEnLigne.jsx';

// Section « Réservation en ligne » de la page des réglages : l'écran d'origine,
// tel quel. Il lit et écrit seul ses réglages (useParametresEnLigne).
export default function SectionReservationEnLigne({ user, etablissement }) {
  if (!etablissement?.id) return null;
  return <ReglagesTableEnLigne etablissement={etablissement} consultant={user?.role === 'consultant'} />;
}
