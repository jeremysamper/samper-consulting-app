// ─────────────────────────────────────────────────────────────────────────────
// Documents : gardes et visibilité des dossiers par rôle (plan 15, lot 5),
// fichier pur (testé par node --test, gardesDocuments.test.mjs).
//
//   - Un module ouvre son dossier (HACCP, Contrats, Fournisseurs) pour qui
//     ouvre Documents : le droit de la page et le module activé.
//   - Un dossier peut être réservé à des rôles (documents.roles_visibles,
//     migration 20261122_lot5_bureau). Ce qu'il contient, sous-dossiers
//     compris, suit la même règle. Le consultant et le patron voient tout, et
//     eux seuls règlent qui voit un dossier. La base applique la même règle
//     (fonction document_visible, policies de documents) : ce filtre n'est
//     que son miroir à l'écran, pour la démo et entre deux lectures.
// ─────────────────────────────────────────────────────────────────────────────

import { isPageActiveForEtab, peutOuvrirPage } from '../moduleConfig.js';

export const DOSSIERS_MODULES = { haccp: 'HACCP', contrats: 'Contrats', fournisseurs: 'Fournisseurs' };

export const ROLES_TOUT_VOIR = ['consultant', 'patron'];
export const peutReglerVisibilite = (role) => ROLES_TOUT_VOIR.includes(role);

export function peutOuvrirDocuments(user, etablissement, permissions) {
  return Boolean(user) && isPageActiveForEtab(etablissement, 'documents') && peutOuvrirPage('documents', user, permissions);
}

// Un document est-il visible pour ce rôle ? `parId` : Map id -> document
// ({ parentId, rolesVisibles }). Chaque dossier au-dessus (et le document
// lui-même s'il est un dossier) doit laisser passer le rôle. rolesVisibles :
// null = toute l'équipe ; [] = la direction seule ; sinon ces rôles en plus.
export function documentVisible(doc, role, parId) {
  if (ROLES_TOUT_VOIR.includes(role)) return true;
  let cur = doc;
  for (let i = 0; cur && i < 30; i += 1) {
    if (Array.isArray(cur.rolesVisibles) && !cur.rolesVisibles.includes(role)) return false;
    cur = cur.parentId ? parId.get(cur.parentId) : null;
  }
  return true;
}

// Nom de dossier comparé sans casse ni accents.
export const cleNom = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Dossiers d'un module créés réservés à la direction (contrats de l'équipe).
export const DOSSIERS_RESERVES = [cleNom(DOSSIERS_MODULES.contrats)];

// Le dossier demandé par un module : à la racine d'abord, sinon le premier
// trouvé dans l'arborescence.
export function trouverDossier(docs, nom) {
  const cle = cleNom(nom);
  if (!cle) return null;
  const dossiers = (docs || []).filter((d) => d.type === 'folder' && cleNom(d.nom) === cle);
  return dossiers.find((d) => !d.parentId) || dossiers[0] || null;
}
