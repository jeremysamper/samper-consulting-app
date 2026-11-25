// ─────────────────────────────────────────────────────────────────────────────
// Vente à emporter et commande d'avance (lot 01 du panel, 25.11.2026).
// Un ticket sans table porte un nom saisi au comptoir (retrait_nom), une
// heure promise (retrait_heure, gardée en UTC) et un numéro de retrait du
// jour (retrait_numero), posé par la base au premier envoi en cuisine.
//
// libelleRetrait suit mot pour mot caisse_libelle_retrait (migration
// 20261125_panel_lot01_caisse_retrait.sql), qui écrit le libellé du bon dans
// kds_orders.table_no : « Retrait 12, Léa, à emporter, 12:30 ». Les morceaux
// absents sautent ; sans numéro le libellé commence par « Direct » ; un ticket
// de test reste « TEST Direct ». Un libellé ne se réduit jamais à des chiffres
// seuls : le KDS les lirait comme un numéro de table.
// ─────────────────────────────────────────────────────────────────────────────
import { zurichDateHeure, zurichInstantIso } from '../../utils/zurichTime.js';

export const NOM_RETRAIT_MAX = 120;
export const NOM_LIBELLE_MAX = 40;
// Une heure passée de plus de cinq minutes est refusée.
export const TOLERANCE_PASSE_MS = 5 * 60 * 1000;

// Coupe par caractères (comme left() de Postgres), pas par unités UTF-16.
const couper = (texte, n) => Array.from(texte).slice(0, n).join('');

// Nom nettoyé (espaces resserrés, 120 caractères au plus), ou null.
export function nomRetraitValide(texte) {
  const propre = String(texte ?? '').replace(/\s+/g, ' ').trim();
  if (!propre) return null;
  return couper(propre, NOM_RETRAIT_MAX).trim() || null;
}

// Heure HH:MM de Zurich d'un instant, ou null.
export function heureRetrait(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return zurichDateHeure(t).heure;
}

export function libelleRetrait({ test = false, numero = null, nom = null, aEmporter = false, heure = null } = {}) {
  if (test) return 'TEST Direct';
  const propre = String(nom ?? '').trim();
  const court = propre ? couper(propre, NOM_LIBELLE_MAX).trim() : '';
  return [
    numero != null ? `Retrait ${numero}` : 'Direct',
    court || null,
    aEmporter ? 'à emporter' : null,
    heureRetrait(heure),
  ].filter(Boolean).join(', ');
}

// Repères d'un ticket à montrer à l'écran. Un ticket de table ou de test
// n'en a jamais. Une colonne absente (base pas encore migrée) se lit nulle.
export function reperesRetrait(ticket) {
  const vide = { numero: null, nom: null, heure: null, aEmporter: false, vide: true };
  if (!ticket || ticket.table_id || ticket.test) return vide;
  const numero = ticket.retrait_numero ?? null;
  const nom = nomRetraitValide(ticket.retrait_nom);
  const heure = heureRetrait(ticket.retrait_heure);
  const aEmporter = Boolean(ticket.a_emporter);
  return { numero, nom, heure, aEmporter, vide: numero == null && !nom && !heure && !aEmporter };
}

// Heure saisie (HH:MM, Zurich) en instant UTC du jour de Zurich. Rend null
// pour une heure mal formée ou passée de plus de cinq minutes : autour de
// minuit, « 00:10 » à 23:50 se lit comme aujourd'hui 00:10, donc passé.
export function heurePromiseIso(hhmm, maintenant = new Date()) {
  const instant = maintenant instanceof Date ? maintenant : new Date(maintenant);
  const iso = zurichInstantIso(zurichDateHeure(instant).jour, hhmm);
  if (!iso) return null;
  if (new Date(iso).getTime() < instant.getTime() - TOLERANCE_PASSE_MS) return null;
  return iso;
}
