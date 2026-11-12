import Technique from './Technique.jsx';

// Section « Technique : équipements » de la page des réglages : le module
// lui-même, monté sur ce seul écran (ecranReglage). Mêmes lectures, mêmes
// écritures, même fenêtre de saisie.
export default function SectionEquipements({ user, etablissement }) {
  return <Technique user={user} etablissement={etablissement} ecranReglage="equipements" />;
}
