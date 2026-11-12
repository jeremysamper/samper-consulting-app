import { Parametres } from '../../parametres/index.js';

// Section « Paramètres » : l'écran d'origine, tel quel (mêmes props que dans
// l'espace Compte du 28.10.2026).
export default function SectionParametres({ user }) {
  return <Parametres user={user} />;
}
