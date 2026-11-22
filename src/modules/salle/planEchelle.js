import { PLAN_W, PLAN_H } from '../../hooks/planSalleCanevas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Taille des tables selon la salle. Fonctions pures, sans React : elles se
// testent sous Node (planEchelle.test.mjs).
//
// Une salle porte une échelle de ses tables (salles.echelle_tables, de 0,6 à
// 1) : une petite pièce garde ses tables à 70 % pour que le plan respire,
// une grande salle les garde en taille normale. Changer l'échelle réécrit la
// largeur et la hauteur de chaque table de la salle, depuis son centre : la
// caisse et les réservations lisent les mêmes colonnes et montrent donc la
// même taille, sans rien savoir de l'échelle.
// ─────────────────────────────────────────────────────────────────────────────

export const ECHELLE_MIN = 0.6;
export const ECHELLE_MAX = 1;
export const PAS_ECHELLE = 0.05;

// Deux décimales : la colonne est un numeric, une table réduite puis remise à
// 100 % retombe sur sa taille d'avant au centième près.
const arrondi = (v) => Math.round(v * 100) / 100;
const borne = (v, min, max) => Math.min(max, Math.max(min, v));

// Échelle lisible, ramenée dans les bornes de la base. Une valeur absente ou
// illisible vaut 1 : une salle d'avant la colonne garde ses tables telles
// quelles.
export function bornerEchelle(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n) || n <= 0) return 1;
  return arrondi(borne(n, ECHELLE_MIN, ECHELLE_MAX));
}

export function echelleDeSalle(salle) {
  return bornerEchelle(salle?.echelle_tables);
}

// Vrai quand la base connaît la colonne (migration 20261122 passée) : sans
// elle, le réglage ne s'affiche pas plutôt que d'écrire dans le vide.
export function echelleDisponible(salle) {
  return !!salle && Object.prototype.hasOwnProperty.call(salle, 'echelle_tables');
}

// Gabarits par forme : une table de 8 est plus grande qu'un deux-couverts, et
// une rectangulaire est plus large que profonde. Le plan reste lisible sans
// demander à personne de redimensionner quoi que ce soit à la main. L'échelle
// de la salle s'applique par-dessus.
export function tailleParDefaut(forme, nbPlaces, echelle = 1) {
  const e = bornerEchelle(echelle);
  const fois = ({ largeur, hauteur }) => ({ largeur: arrondi(largeur * e), hauteur: arrondi(hauteur * e) });
  // Place de bar : un tabouret, à peu près la moitié d'une table de deux,
  // quel que soit le nombre de places qu'on lui donne.
  if (forme === 'tabouret') return fois({ largeur: 50, hauteur: 50 });
  const p = Math.max(1, Number(nbPlaces) || 2);
  if (forme === 'rectangle') {
    // ~55 unités de long par paire de couverts, borné pour rester dans le plan
    const largeur = Math.min(340, 110 + Math.ceil(p / 2) * 55);
    return fois({ largeur, hauteur: 90 });
  }
  if (forme === 'carree') {
    const cote = Math.min(200, 80 + p * 8);
    return fois({ largeur: cote, hauteur: cote });
  }
  // ronde
  const d = Math.min(200, 76 + p * 9);
  return fois({ largeur: d, hauteur: d });
}

// Nouvelle géométrie d'une table quand sa salle passe de l'échelle `ancienne`
// à `nouvelle` : largeur et hauteur multipliées par le rapport, centre gardé
// (une table tournée reste tournée, sa forme et ses places ne bougent pas),
// position ramenée dans le canevas quand la table grandit contre un bord.
export function redimensionnerTable(t, ancienne, nouvelle) {
  const f = bornerEchelle(nouvelle) / bornerEchelle(ancienne);
  const w0 = Number(t.largeur) || 0;
  const h0 = Number(t.hauteur) || 0;
  const largeur = arrondi(borne(w0 * f, 1, PLAN_W));
  const hauteur = arrondi(borne(h0 * f, 1, PLAN_H));
  const cx = (Number(t.pos_x) || 0) + w0 / 2;
  const cy = (Number(t.pos_y) || 0) + h0 / 2;
  return {
    id: t.id,
    pos_x: arrondi(borne(cx - largeur / 2, 0, PLAN_W - largeur)),
    pos_y: arrondi(borne(cy - hauteur / 2, 0, PLAN_H - hauteur)),
    largeur,
    hauteur,
  };
}

// Toutes les tables d'une salle d'un coup. Même échelle : rien à écrire.
export function redimensionnerTables(tables, ancienne, nouvelle) {
  if (bornerEchelle(ancienne) === bornerEchelle(nouvelle)) return [];
  return (tables || []).map((t) => redimensionnerTable(t, ancienne, nouvelle));
}

// Taille d'une table changée de salle : elle prend l'échelle de sa nouvelle
// salle (une table de 4 à 100 % posée dans une salle à 70 % y devient une
// table de 4 à 70 %).
export function tailleChangeeDeSalle(t, echelleSource, echelleCible) {
  const f = bornerEchelle(echelleCible) / bornerEchelle(echelleSource);
  return {
    largeur: arrondi(borne((Number(t.largeur) || 0) * f, 1, PLAN_W)),
    hauteur: arrondi(borne((Number(t.hauteur) || 0) * f, 1, PLAN_H)),
  };
}

// Pourcentage affiché par le curseur (60 à 100).
export const enPourcent = (e) => Math.round(bornerEchelle(e) * 100);
