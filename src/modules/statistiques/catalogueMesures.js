// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue des mesures du module Statistiques (D2) : la seule source de ce
// que le module affiche. Sans React ni service : importable par les tests.
//
// Une mesure déclare : id, famille, libellé, unité ('chf', 'nombre', 'pct',
// 'min'), nature ('flux', 'taux', 'stock'), pas disponibles, ventilations,
// calcul (`valeur`, qui lit un point rendu par la fonction d'origine de sa
// famille) et la phrase qui dit ce que le chiffre compte.
//
// Aucun calcul n'est écrit ici (D3) : la lecture et la garde de chaque famille
// sont dans lecturesFamilles.js, sa fonction de série dans son module
// d'origine. Ajouter une mesure, c'est ajouter une ligne dans sa famille.
// ─────────────────────────────────────────────────────────────────────────────

import { familleCaisse } from './familles/caisse.js';
import { familleReservations } from './familles/reservations.js';
import { familleAchats } from './familles/achats.js';
import { familleComptabilite } from './familles/comptabilite.js';
import { famillePertes } from './familles/pertes.js';
import { famillePlanning } from './familles/planning.js';
import { familleHaccp } from './familles/haccp.js';
import { familleInventaire } from './familles/inventaire.js';
import { familleGroupes } from './familles/groupes.js';
import { familleJournal, familleKds, familleMep, familleSop, familleSpa } from './familles/reste.js';

export const FAMILLES = [familleCaisse, familleReservations, familleAchats, familleComptabilite, famillePertes, famillePlanning, familleHaccp, familleInventaire, familleGroupes, familleSop, familleMep, familleKds, familleJournal, familleSpa];

const TOUS_LES_PAS = ['jour', 'semaine', 'mois'];

export const MESURES = FAMILLES.flatMap((f) => f.mesures.map((m) => ({
  pas: TOUS_LES_PAS,
  ventilations: [],
  ...m,
  famille: f.id,
})));

export const familleDe = (id) => FAMILLES.find((f) => f.id === id) || null;
export const mesureDe = (id) => MESURES.find((m) => m.id === id) || null;

// Mesures que la personne peut cocher (D11).
//   familles     : ids des familles dont elle voit aujourd'hui l'écran d'origine
//   niveauCaisse : 'direction', 'cuisine' ou null (niveau rendu par la base)
//   direction    : vrai pour la direction (salaires, soldes d'heures)
//   droits       : autres droits d'écran, par clé de `reserve` (factures_achat :
//                  « Régler les factures »)
// Une mesure ou une ventilation réservée disparaît ; elle ne s'affiche jamais
// grisée, pour ne rien dire d'un chiffre que la personne ne voit pas ailleurs.
export function mesuresVisibles({ familles = [], niveauCaisse = null, direction = false, droits = {} } = {}) {
  const ouvertes = new Set(familles);
  const niveauOk = (x) => x.niveau !== 'direction' || niveauCaisse === 'direction';
  return MESURES
    .filter((m) => ouvertes.has(m.famille))
    .filter((m) => (m.famille !== 'caisse' || niveauCaisse) && niveauOk(m))
    .filter((m) => !m.reserve || (m.reserve === 'direction' ? direction : droits[m.reserve] === true))
    .map((m) => ({ ...m, ventilations: (m.ventilations || []).filter(niveauOk) }));
}
