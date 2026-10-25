import { createContext, useContext } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Ce que la coque (AppLayout) partage avec la page d'accueil tactile : le mode
// de présentation, la liste des modules visibles et leurs badges
// (useVisibleNav, la même source que la barre latérale), les libellés
// personnalisés, la navigation et le compte.
//
//   {
//     mode,            'ordinateur' | 'tablette' | 'telephone'
//     visibleNav, groupedNav, badges,
//     getLabelForModule(id, defaultLabel),
//     setPage(pageId),
//     etablissement, etabs,
//     accountUser,     utilisateur affiché (surcharge locale après édition)
//     openAccount(),   ouvre la fenêtre « Mon compte »
//   }
// ─────────────────────────────────────────────────────────────────────────────

const ShellContext = createContext(null);

export const ShellProvider = ShellContext.Provider;

export function useShell() {
  return useContext(ShellContext);
}
