import Inventaire from './Inventaire.jsx';

// Section « Inventaire » de la page des réglages : le module lui-même, monté
// sur son seul écran de gestion (ecranReglage). Mêmes états, mêmes écritures,
// mêmes fenêtres ; ni son accueil ni ses écrans de comptage.
export default function SectionGererInventaire({ user, etablissement }) {
  return <Inventaire user={user} etablissement={etablissement} ecranReglage="gerer" />;
}
