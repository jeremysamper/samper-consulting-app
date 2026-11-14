// Canevas virtuel du plan de salle. Toutes les coordonnées stockées sont
// exprimées dedans, jamais en pixels : le plan doit tomber juste sur l'iPad de
// l'entrée comme sur l'écran du bureau. Le composant met ce canevas à
// l'échelle de la largeur disponible, le ratio ne bouge pas.
export const PLAN_W = 1000;
export const PLAN_H = 700;

// Pas de la grille d'aimantation, en unités canevas. Sans elle, un plan
// dessiné au doigt part de travers : deux tables côte à côte ne sont jamais
// alignées à l'unité près.
export const PLAN_GRID = 10;
