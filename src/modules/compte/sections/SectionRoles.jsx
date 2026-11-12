import { Roles } from '../../roles/index.js';

// Section « Rôles & accès » : l'écran d'origine, tel quel.
export default function SectionRoles({ user }) {
  return <Roles user={user} />;
}
