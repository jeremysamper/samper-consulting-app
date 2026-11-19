// ─────────────────────────────────────────────────────────────────────────────
// Un bon ouvert depuis son QR (lien « /?bon=CODE », lienDuBon). Le code est lu
// une fois au chargement de l'app, retiré de l'adresse et gardé pour la durée
// de l'onglet (sessionStorage), le temps de se connecter. App.jsx mène à la
// Caisse un compte qui y a accès, et la Caisse ouvre la fiche du bon ; les
// autres sont prévenus et le code est oublié. Rien d'autre que le code n'est
// gardé.
// ─────────────────────────────────────────────────────────────────────────────

import { normaliserCode } from './codeBon.js';

const CLE = 'sc_bon_a_ouvrir';

export function bonEnAttente() {
  try {
    return normaliserCode(window.sessionStorage.getItem(CLE));
  } catch {
    return null;
  }
}

export function oublierBonEnAttente() {
  try {
    window.sessionStorage.removeItem(CLE);
  } catch { /* stockage indisponible : rien à oublier */ }
}

// Au chargement : le code du lien, s'il y en a un, sinon celui déjà gardé
// (un rechargement pendant la connexion).
export function retenirBonDuLien() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('bon')) return bonEnAttente();
    const code = normaliserCode(u.searchParams.get('bon'));
    u.searchParams.delete('bon');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    if (code) window.sessionStorage.setItem(CLE, code);
    return code;
  } catch {
    return null;
  }
}
