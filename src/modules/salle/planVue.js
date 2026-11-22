import { PLAN_W, PLAN_H } from '../../hooks/planSalleCanevas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Géométrie d'affichage partagée par les plans de salle (Réservations, Caisse,
// dessin dans les réglages). Fonctions pures, sans React : elles se testent
// sous Node.
//
// Le plan est stocké dans un canevas virtuel (PLAN_W x PLAN_H). Un écran le
// montre à l'échelle k (pixels par unité), cadré sur ce qui est dessiné :
// une salle qui n'occupe qu'un coin du canevas s'affiche en grand.
// ─────────────────────────────────────────────────────────────────────────────

// Côté visé pour une table « lisible » au téléphone, en pixels (numéro et nom
// y tiennent). Le zoom lisible amène la table médiane à cette taille.
export const TABLE_LISIBLE = 64;

export const borne = (v, min, max) => Math.min(max, Math.max(min, v));

// Sous ce côté à l'écran, en pixels, une table ne porte plus que son numéro :
// le nom, l'heure ou les places y seraient écrits trop serrés pour être lus
// (une salle réduite à 60 % sur une tablette). L'état reste dit par la
// couleur de la table et de ses chaises.
export const COTE_NUMERO_SEUL = 56;
export const numeroSeul = (w, h) => Math.min(Number(w) || 0, Number(h) || 0) < COTE_NUMERO_SEUL;

// Petit côté médian des tables : la taille typique d'une table de la salle.
export function medianeTables(tables) {
  const cotes = (tables || [])
    .map((t) => Math.min(Number(t.largeur) || 0, Number(t.hauteur) || 0))
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  return cotes.length ? cotes[Math.floor(cotes.length / 2)] : 0;
}

// Vue du plan : le contour de ce qui est dessiné, avec une marge autour (la
// place des chaises), au moins 300 sur 210, dans le canevas. Sans rien :
// tout le canevas.
export function cadrage(objets, marge = 40) {
  if (!objets?.length) return { x0: 0, y0: 0, w: PLAN_W, h: PLAN_H };
  let x0 = Math.max(0, Math.min(...objets.map((o) => Number(o.pos_x))) - marge);
  let y0 = Math.max(0, Math.min(...objets.map((o) => Number(o.pos_y))) - marge);
  let x1 = Math.min(PLAN_W, Math.max(...objets.map((o) => Number(o.pos_x) + Number(o.largeur))) + marge);
  let y1 = Math.min(PLAN_H, Math.max(...objets.map((o) => Number(o.pos_y) + Number(o.hauteur))) + marge);
  if (x1 - x0 < 300) { const c = (x0 + x1) / 2; x0 = Math.max(0, c - 150); x1 = Math.min(PLAN_W, x0 + 300); }
  if (y1 - y0 < 210) { const c = (y0 + y1) / 2; y0 = Math.max(0, c - 105); y1 = Math.min(PLAN_H, y0 + 210); }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// Chaises autour d'une table, en pixels, relatives à la table (w et h : sa
// taille à l'écran, k : l'échelle). Un tabouret est déjà une place : pas de
// chaise. Sous une échelle de 0,45, les chaises ne se lisent plus : aucune.
export function chaises(t, w, h, k) {
  const n = Math.min(12, Math.max(0, Number(t.nb_places) || 0));
  if (!n || t.forme === 'tabouret' || k < 0.45) return [];
  const ep = Math.max(5, Math.round(9 * k));
  const ecart = Math.max(3, Math.round(5 * k));
  const res = [];
  if (t.forme === 'ronde') {
    const r = Math.min(w, h) / 2;
    const d = Math.max(8, Math.round(18 * k));
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      res.push({ left: w / 2 + Math.cos(a) * (r + ecart + ep / 2) - d / 2, top: h / 2 + Math.sin(a) * (r + ecart + ep / 2) - ep / 2, width: d, height: ep, rot: (a * 180) / Math.PI + 90 });
    }
    return res;
  }
  // Rectangle : les grands côtés d'abord. Carré : les quatre côtés.
  const cotes = t.forme === 'carree' && n > 2 ? ['haut', 'bas', 'gauche', 'droite'] : (w >= h ? ['haut', 'bas'] : ['gauche', 'droite']);
  const parCote = Object.fromEntries(cotes.map((c) => [c, 0]));
  for (let i = 0; i < n; i += 1) parCote[cotes[i % cotes.length]] += 1;
  Object.entries(parCote).forEach(([cote, m]) => {
    const horizontal = cote === 'haut' || cote === 'bas';
    const long = horizontal ? w : h;
    const pas = long / m;
    const lg = Math.max(8, Math.min(pas * 0.6, 26 * k));
    for (let i = 0; i < m; i += 1) {
      const centre = pas * (i + 0.5);
      if (horizontal) res.push({ left: centre - lg / 2, top: cote === 'haut' ? -ecart - ep : h + ecart, width: lg, height: ep, rot: 0 });
      else res.push({ left: cote === 'gauche' ? -ecart - ep : w + ecart, top: centre - lg / 2, width: ep, height: lg, rot: 0 });
    }
  });
  return res;
}

// Guides d'alignement pendant qu'on glisse une table au dessin : si un bord
// ou le centre de la table passe à moins de `seuil` unités d'un bord ou d'un
// centre d'une autre table, elle s'y cale. Rend la position corrigée et les
// lignes à tracer ({ axe: 'x' | 'y', v }).
export function aligner(mobile, autres, seuil = 8) {
  const { pos_x: x, pos_y: y, largeur: w, hauteur: h } = mobile;
  const pointsX = [x, x + w / 2, x + w];
  const pointsY = [y, y + h / 2, y + h];
  let meilleurX = null;
  let meilleurY = null;
  for (const o of autres || []) {
    const ox = Number(o.pos_x); const oy = Number(o.pos_y);
    const ow = Number(o.largeur); const oh = Number(o.hauteur);
    for (const cible of [ox, ox + ow / 2, ox + ow]) {
      pointsX.forEach((p, i) => {
        const d = Math.abs(p - cible);
        if (d <= seuil && (!meilleurX || d < meilleurX.d)) meilleurX = { d, dx: cible - p, v: cible, i };
      });
    }
    for (const cible of [oy, oy + oh / 2, oy + oh]) {
      pointsY.forEach((p, i) => {
        const d = Math.abs(p - cible);
        if (d <= seuil && (!meilleurY || d < meilleurY.d)) meilleurY = { d, dy: cible - p, v: cible, i };
      });
    }
  }
  const guides = [];
  if (meilleurX) guides.push({ axe: 'x', v: meilleurX.v });
  if (meilleurY) guides.push({ axe: 'y', v: meilleurY.v });
  return {
    pos_x: borne(x + (meilleurX?.dx || 0), 0, PLAN_W - w),
    pos_y: borne(y + (meilleurY?.dy || 0), 0, PLAN_H - h),
    guides,
  };
}
