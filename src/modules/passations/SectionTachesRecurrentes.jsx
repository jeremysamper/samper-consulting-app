import Passations from './Passations.jsx';

// Section « Passations : tâches récurrentes » de la page des réglages : le
// module lui-même, monté sur ce seul écran (ecranReglage). Mêmes lectures,
// mêmes écritures, même fenêtre de saisie.
export default function SectionTachesRecurrentes({ user, etablissement }) {
  return <Passations user={user} etablissement={etablissement} ecranReglage="recurrentes" />;
}
