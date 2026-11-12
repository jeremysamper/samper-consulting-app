import Technique from './Technique.jsx';

// Section « Technique : plans de préventif » de la page des réglages : le
// module lui-même, monté sur le seul écran des plans (ecranReglage). Mêmes
// lectures, mêmes écritures, même fenêtre de saisie. Ouverte par un bouton de
// l'écran Préventif, la fenêtre du plan s'ouvre aussitôt et la refermer ramène
// à cet écran (revenir).
export default function SectionPlansPreventif({ user, etablissement, revenir }) {
  return <Technique user={user} etablissement={etablissement} ecranReglage="plans" revenir={revenir} />;
}
