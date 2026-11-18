import { useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Demande d'écran d'un module, posée par une autre page avant d'y aller : le
// widget « Hausses de prix » du tableau de bord ouvre Factures & achats sur
// l'écran des hausses. Le module peut être déjà monté (gardé derrière la page
// courante) : une clé de stockage lue au montage n'y suffirait pas. La demande
// est servie tout de suite au module à l'écoute, sinon gardée jusqu'à son
// montage, puis effacée.
// ─────────────────────────────────────────────────────────────────────────────

const enAttente = new Map();
const ecouteurs = new Map();

export function demanderEcran(module, ecran) {
  if (!module || !ecran) return;
  const fn = ecouteurs.get(module);
  if (fn) fn(ecran);
  else enAttente.set(module, ecran);
}

// `servir(ecran)` : ouvre l'écran demandé ; `actif` faux : rien n'est écouté
// (la demande attend le montage d'un module qui peut la servir).
export function useDemandeEcran(module, servir, actif = true) {
  useEffect(() => {
    if (!actif) return undefined;
    if (enAttente.has(module)) {
      const ecran = enAttente.get(module);
      enAttente.delete(module);
      servir(ecran);
    }
    ecouteurs.set(module, servir);
    return () => { if (ecouteurs.get(module) === servir) ecouteurs.delete(module); };
  }, [module, servir, actif]);
}
