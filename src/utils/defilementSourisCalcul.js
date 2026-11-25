// Calculs purs du défilement des bandes à la souris (defilementSouris.js),
// séparés du DOM pour être testés.

export const HAUTEUR_MAX_BANDE = 160;

// Une bande : défile à l'horizontale et déborde, pas trop haute, et ne
// défile pas aussi à la verticale (tableau, plan, liste).
export function estBande({ overflowX, overflowY, scrollWidth, clientWidth, scrollHeight, clientHeight, hauteur }) {
  if (overflowX !== 'auto' && overflowX !== 'scroll') return false;
  if (scrollWidth <= clientWidth + 1) return false;
  if (hauteur > HAUTEUR_MAX_BANDE) return false;
  const verticale = (overflowY === 'auto' || overflowY === 'scroll') && scrollHeight > clientHeight + 1;
  return !verticale;
}

// Position visée après un cran de molette, ou null quand la bande est déjà
// au bout dans ce sens : la page défile alors normalement.
// deltaMode : 0 pixels, 1 lignes, 2 pages.
export function calculerCible({ deltaY, deltaMode = 0, position, cibleEnCours = null, largeurVisible, largeurTotale }) {
  if (!deltaY) return null;
  const facteur = deltaMode === 1 ? 16 : deltaMode === 2 ? largeurVisible : 1;
  const max = Math.max(0, largeurTotale - largeurVisible);
  const depart = cibleEnCours ?? position;
  if (deltaY > 0 && depart >= max - 1) return null;
  if (deltaY < 0 && depart <= 1) return null;
  return Math.max(0, Math.min(max, depart + deltaY * facteur));
}
