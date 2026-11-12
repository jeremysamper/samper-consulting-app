import AccountModal from '../../auth/AccountModal.jsx';
import { useShell } from '../../../layouts/ShellContext.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Mon compte » : l'écran d'origine (prénom, nom, téléphone, mot de
// passe, double authentification du consultant, déconnexion), posé dans la
// page. La coque (AppLayout, par ShellContext) fournit ce qu'elle fournissait
// à la fenêtre : le nom affiché tout de suite après un enregistrement, la
// fenêtre du mot de passe, le rangement du menu, la déconnexion.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionMonCompte({ user }) {
  const shell = useShell();
  const coque = shell?.reglages?.compte;
  if (!coque) return null;
  return (
    <AccountModal
      user={shell.accountUser || user}
      onSaved={coque.onSaved}
      onChangePassword={coque.onChangePassword}
      onOrganize={shell.reglages.organiserMenu}
      onLogout={coque.onLogout}
    />
  );
}
