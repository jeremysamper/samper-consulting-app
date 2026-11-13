// ─────────────────────────────────────────────────────────────────────────────
// Gardes légères du module Statistiques, importables par LegacyModuleHost sans
// charger le module (aucune lecture, aucun service).
//
// Garde d'une famille (D11) : la personne voit la famille si, et seulement
// si, elle voit aujourd'hui l'écran d'origine, par la même condition, importée
// du module d'origine.
//
// Accès par raccourci (S3) : un écran d'analyse devenu raccourci ouvre
// Statistiques préréglé. Une personne qui voyait cet écran sans avoir la clé
// `statistiques` garde l'accès par ce raccourci, sans entrée de menu de plus ;
// dans le module, elle ne voit que les familles dont elle passe la garde.
// FAMILLES_A_RACCOURCI ne nomme que les familles dont l'écran est déjà parti.
// ─────────────────────────────────────────────────────────────────────────────

import { isModuleActiveForEtab, isPageActiveForEtab, peutOuvrirPage } from '../moduleConfig.js';
import { peutHabillerCaisse } from '../caisse/gardesCaisse.js';
import { lireModeTest } from '../caisse/modeTest.js';
import { ROLES_RAPPORT } from '../previsions/rapport/gardeRapport.js';
import { estDirection, peutReglerFactures } from '../comptabilite/gardesCompta.js';

// Garde d'un écran d'origine, la chaîne même de LegacyModuleHost.jsx : page
// active pour l'établissement, puis droit d'ouvrir la page.
export const ecranOuvert = (page, { role, permissions, etablissement }) => isPageActiveForEtab(etablissement, page)
  && peutOuvrirPage(page, { role }, permissions || {});

//   contexte : { role, permissions, etablissement }
export const GARDES_ECRANS = {
  // Tuile « Rapports » de la caisse : habillage, hors mode test.
  caisse: ({ role, permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'caisse')
    && permissions?.caisse === true && peutHabillerCaisse(role) && !lireModeTest(etablissement?.id),
  // « Le rapport » des réservations : ROLES_RAPPORT.
  reservations: ({ role, permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'previsions')
    && permissions?.previsions === true && ROLES_RAPPORT.includes(role),
  // Analyses des dépenses : droits de l'Inventaire, aucune garde propre.
  achats: ({ permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'inventaire') && permissions?.inventaire !== false,
  // Comptabilité : la direction ou qui règle les factures.
  comptabilite: ({ role, permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'comptabilite')
    && permissions?.comptabilite === true && (estDirection(role) || peutReglerFactures(role)),
  // Meilleures ventes de Ventes POS : qui ouvre le module.
  pos: (ctx) => ecranOuvert('pos', ctx),
};

// Familles dont l'écran d'analyse est devenu un raccourci (S3).
export const FAMILLES_A_RACCOURCI = ['achats'];

// La page Statistiques : la clé, ou un écran d'analyse parti vers elle.
export function peutOuvrirStatistiques(user, permissions, etablissement) {
  if (peutOuvrirPage('statistiques', user, permissions || {})) return true;
  const contexte = { role: user?.role, permissions: permissions || {}, etablissement };
  return FAMILLES_A_RACCOURCI.some((f) => GARDES_ECRANS[f](contexte));
}
