import HACCP from './HACCP.jsx';

// Section « HACCP » de la page des réglages : le module lui-même, monté sur
// son seul écran de configuration (ecranReglage). Mêmes états, mêmes
// écritures, mêmes fenêtres ; ni son accueil ni son en-tête de tâche.
export default function SectionReglagesHaccp({ user, etablissement }) {
  return <HACCP user={user} etablissement={etablissement} ecranReglage="config" />;
}
