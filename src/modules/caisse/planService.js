// ─────────────────────────────────────────────────────────────────────────────
// Plan du service dans la Caisse : le plan de salle tel que Réservations l'a
// organisé pour le service en cours. Fonctions pures, testées par
// planService.test.mjs ; aucune lecture ni écriture ici.
//
// Réservations garde le plan de base (salle_tables) intact et écrit les écarts
// d'un service dans salle_tables_service (une ligne par table, par date et par
// service midi ou soir : position, quart de tour, clé de tablée). La Caisse
// lit les mêmes lignes et les écrit de la même façon : une table déplacée ou
// des tables réunies dans un module se voient dans l'autre.
//
// Une tablée (tables rapprochées) porte une clé `fusion` : l'id de la table
// qui donne son numéro (même règle que PlanSalle.jsx, principaleDe). Pour la
// caisse, une tablée est une seule table : un seul ticket, ouvert sur la
// table principale, et toutes ses tables se lisent occupées.
// ─────────────────────────────────────────────────────────────────────────────
import { serviceAffiche } from '../previsions/statutsReservation.js';
import { PLAN_GRID, PLAN_H, PLAN_W } from '../../hooks/planSalleCanevas.js';

// Le service du moment : midi jusqu'à 16 h, soir ensuite (heure de Zurich).
// Le brunch se range avec le midi, comme partout dans Réservations.
export const BASCULE_SOIR_MIN = 16 * 60;
export const serviceDuMoment = (minutesZurich) => (minutesZurich < BASCULE_SOIR_MIN ? 'midi' : 'soir');

// Une réservation posée sur une table s'ouvre d'un seul toucher à partir de
// 45 minutes avant son heure : plus tôt, la table peut accueillir un passage
// avant elle, et la fiche « Qui est à cette table ? » reste le chemin.
export const FENETRE_ARRIVEE_MIN = 45;

// Une table ouverte sans rien envoyé en cuisine depuis 10 minutes : la table
// attend qu'on prenne sa commande.
export const ATTENTE_COMMANDE_MIN = 10;

const parNumero = (a, b) => String(a.nom).localeCompare(String(b.nom), undefined, { numeric: true });

const minutesDe = (heure) => {
  const [h, m] = String(heure || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};

// Écarts du service, par table.
export function ajustementsDuService(ajustements, service) {
  const m = new Map();
  (ajustements || []).forEach((a) => { if (a.service === service) m.set(a.table_id, a); });
  return m;
}

// Plan de base + écarts du service : position, quart de tour (largeur et
// hauteur échangées) et clé de tablée.
export function tablesDuService(tables, ajustParTable) {
  return (tables || []).map((t) => {
    const a = ajustParTable?.get(t.id);
    if (!a) return { ...t, fusion: null, pivotee: false };
    const deplacee = a.pos_x != null && a.pos_y != null;
    const pivotee = !!a.pivotee;
    return {
      ...t,
      pos_x: deplacee ? Number(a.pos_x) : t.pos_x,
      pos_y: deplacee ? Number(a.pos_y) : t.pos_y,
      largeur: pivotee ? t.hauteur : t.largeur,
      hauteur: pivotee ? t.largeur : t.hauteur,
      fusion: a.fusion || null,
      pivotee,
    };
  });
}

// Table qui donne son numéro à une tablée : celle dont l'id est la clé, sinon
// la plus petite des restantes.
export function principaleDe(membres) {
  if (!membres?.length) return null;
  return membres.find((t) => t.id === membres[0].fusion) || [...membres].sort(parNumero)[0];
}

// Tablée de chaque table : table_id -> { principale, membres }. Une table seule
// forme sa propre tablée. Une clé qui ne réunit qu'une table (l'autre est
// inactive ou a changé de salle) se lit comme une table seule.
export function tableesDe(tablesVues) {
  const parCle = new Map();
  (tablesVues || []).forEach((t) => {
    if (!t.fusion) return;
    if (!parCle.has(t.fusion)) parCle.set(t.fusion, []);
    parCle.get(t.fusion).push(t);
  });
  const res = new Map();
  (tablesVues || []).forEach((t) => {
    const membres = t.fusion && parCle.get(t.fusion).length > 1 ? parCle.get(t.fusion) : [t];
    res.set(t.id, { principale: principaleDe(membres), membres });
  });
  return res;
}

// Ticket lu sur chaque table du plan. Le ticket couvre sa table, les autres
// tables de sa tablée, et les tables de sa réservation (une tablée posée dans
// Réservations sans rapprocher les tables), tant que le ticket est sur l'une
// d'elles : un ticket changé de table ne laisse pas l'ancienne occupée. Une
// table qui a son propre ticket le garde.
export function ticketsSurPlan(tickets, tablees, reservations) {
  const res = {};
  (tickets || []).forEach((t) => { if (t.table_id && !res[t.table_id]) res[t.table_id] = t; });
  const resas = new Map((reservations || []).map((r) => [r.id, r]));
  (tickets || []).forEach((t) => {
    if (!t.table_id) return;
    const couvertes = new Set((tablees?.get(t.table_id)?.membres || []).map((m) => m.id));
    couvertes.add(t.table_id);
    const liens = resas.get(t.reservation_id)?.reservation_tables || [];
    const surSaReservation = liens.some((l) => couvertes.has(l.table_id));
    if (surSaReservation) liens.forEach((l) => {
      couvertes.add(l.table_id);
      (tablees?.get(l.table_id)?.membres || []).forEach((m) => couvertes.add(m.id));
    });
    couvertes.forEach((id) => { if (!res[id]) res[id] = t; });
  });
  return res;
}

// Réservations du service posées sur une tablée, sans ticket ouvert, encore à
// asseoir (confirmées ou notées arrivées), triées par heure.
export function reservationsPosees(reservations, { jour, service, tableIds, tickets = [] }) {
  const ids = new Set(tableIds || []);
  const prises = new Set((tickets || []).map((t) => t.reservation_id).filter(Boolean));
  return (reservations || [])
    .filter((r) => r.date_service === jour
      && (r.statut === 'confirme' || r.statut === 'arrive')
      && !prises.has(r.id)
      && serviceAffiche(r.service) === service
      && (r.reservation_tables || []).some((l) => ids.has(l.table_id)))
    .sort((a, b) => String(a.heure_arrivee || '').localeCompare(String(b.heure_arrivee || '')));
}

// La réservation qu'un toucher sur une tablée libre ouvre sans fiche : la seule
// réservation posée sur elle pour ce service, dès 45 minutes avant son heure
// (déjà arrivée : tout de suite). Deux réservations ou plus, ou aucune : null,
// la fiche « Qui est à cette table ? » choisit.
export function reservationDirecte(reservations, { jour, service, tableIds, tickets = [], maintenantMinutes }) {
  const posees = reservationsPosees(reservations, { jour, service, tableIds, tickets });
  if (posees.length !== 1) return null;
  const r = posees[0];
  if (r.statut === 'arrive') return r;
  const m = minutesDe(r.heure_arrivee);
  return Number.isFinite(m) && maintenantMinutes >= m - FENETRE_ARRIVEE_MIN ? r : null;
}

// ── Gestes du mode « Déplacer des tables » ──────────────────────────────────
// Chaque fonction rend les lignes à écrire dans salle_tables_service
// ({ table_id, pos_x, pos_y, fusion, pivotee }) et les tables dont l'écart
// s'efface (revenues au plan de base). Le quart de tour d'un service est
// toujours repris : écrire une ligne sans lui le perdrait.

const aimanter = (v) => Math.round(v / PLAN_GRID) * PLAN_GRID;
const borner = (v, min, max) => Math.min(max, Math.max(min, v));

// Contour d'un groupe de tables, en unités du canevas.
export function cadreDe(membres) {
  const x0 = Math.min(...membres.map((t) => Number(t.pos_x)));
  const y0 = Math.min(...membres.map((t) => Number(t.pos_y)));
  const x1 = Math.max(...membres.map((t) => Number(t.pos_x) + Number(t.largeur)));
  const y1 = Math.max(...membres.map((t) => Number(t.pos_y) + Number(t.hauteur)));
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// Décalage d'un groupe glissé de (dx, dy), aimanté sur la grille et gardé
// dans le canevas.
export function decalageBorne(membres, dx, dy) {
  const c = cadreDe(membres);
  const nx = borner(aimanter(c.x0 + dx), 0, PLAN_W - c.w);
  const ny = borner(aimanter(c.y0 + dy), 0, PLAN_H - c.h);
  return { dx: nx - c.x0, dy: ny - c.y0 };
}

// Déplacer une tablée (ou une table) : chaque membre garde sa clé.
export function lignesDeplacement(membres, dx, dy, ajustParTable) {
  return membres.map((t) => {
    const a = ajustParTable?.get(t.id);
    return {
      table_id: t.id,
      pos_x: Number(t.pos_x) + dx,
      pos_y: Number(t.pos_y) + dy,
      fusion: a?.fusion ?? null,
      pivotee: !!a?.pivotee,
    };
  });
}

// Côté où poser le groupe glissé contre la tablée cible, d'après l'endroit où
// il a été lâché : à droite, à gauche, dessous ou dessus, bord contre bord.
// Un côté qui sortirait du canevas cède la place au côté opposé, puis aux
// deux autres : borner la position ferait chevaucher les tables.
export function placeContre(source, cible, centreLache) {
  const s = cadreDe(source);
  const c = cadreDe(cible);
  const cx = (c.x0 + c.x1) / 2;
  const cy = (c.y0 + c.y1) / 2;
  const nx = (centreLache.x - cx) / ((c.w + s.w) / 2 || 1);
  const ny = (centreLache.y - cy) / ((c.h + s.h) / 2 || 1);
  const places = {
    droite: { x: c.x1, y: c.y0 },
    gauche: { x: c.x0 - s.w, y: c.y0 },
    dessous: { x: c.x0, y: c.y1 },
    dessus: { x: c.x0, y: c.y0 - s.h },
  };
  const horizontal = Math.abs(nx) >= Math.abs(ny);
  const premier = horizontal ? (nx >= 0 ? 'droite' : 'gauche') : (ny >= 0 ? 'dessous' : 'dessus');
  const oppose = { droite: 'gauche', gauche: 'droite', dessous: 'dessus', dessus: 'dessous' };
  const autres = horizontal ? (ny >= 0 ? ['dessous', 'dessus'] : ['dessus', 'dessous']) : (nx >= 0 ? ['droite', 'gauche'] : ['gauche', 'droite']);
  const dedans = (p) => p.x >= 0 && p.y >= 0 && p.x + s.w <= PLAN_W && p.y + s.h <= PLAN_H;
  const choisie = [premier, oppose[premier], ...autres].map((k) => places[k]).find(dedans) || places[premier];
  const x = borner(aimanter(choisie.x), 0, PLAN_W - s.w);
  const y = borner(aimanter(choisie.y), 0, PLAN_H - s.h);
  return { dx: x - s.x0, dy: y - s.y0 };
}

// Réunir : le groupe glissé se pose contre la cible et toutes leurs tables
// prennent la clé de la cible (son numéro reste celui de la tablée).
export function lignesReunion(source, cible, centreLache, ajustParTable) {
  const cle = cible[0].fusion || principaleDe(cible).id;
  const { dx, dy } = placeContre(source, cible, centreLache);
  const deplacees = lignesDeplacement(source, dx, dy, ajustParTable).map((l) => ({ ...l, fusion: cle }));
  const gardees = cible.map((t) => {
    const a = ajustParTable?.get(t.id);
    return { table_id: t.id, pos_x: a?.pos_x ?? null, pos_y: a?.pos_y ?? null, fusion: cle, pivotee: !!a?.pivotee };
  });
  return [...gardees, ...deplacees];
}

// Séparer une tablée : chaque table garde sa place, sans clé. Une table qui
// n'a plus d'écart (ni place ni quart de tour) revient au plan de base.
export function lignesSeparation(membres, ajustParTable) {
  const lignes = [];
  const effacer = [];
  membres.forEach((t) => {
    const a = ajustParTable?.get(t.id);
    const place = a?.pos_x != null && a?.pos_y != null;
    if (!place && !a?.pivotee) effacer.push(t.id);
    else lignes.push({ table_id: t.id, pos_x: a.pos_x ?? null, pos_y: a.pos_y ?? null, fusion: null, pivotee: !!a.pivotee });
  });
  return { lignes, effacer };
}

// La tablée qui se trouve sous un point du canevas, hors des tables exclues.
export function tableSous(tablesVues, point, exclues = new Set()) {
  return (tablesVues || []).find((t) => !exclues.has(t.id)
    && point.x >= Number(t.pos_x) && point.x <= Number(t.pos_x) + Number(t.largeur)
    && point.y >= Number(t.pos_y) && point.y <= Number(t.pos_y) + Number(t.hauteur)) || null;
}
