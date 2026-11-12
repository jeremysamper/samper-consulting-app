import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Du service vers la section « Plan de salle » de la page des réglages.
//
// « Dessiner la salle » (PlanSalle.jsx) ouvre la section par-dessus le service
// et lui passe ce qu'il avait sous les yeux : l'établissement, la salle, le
// jour, le service et ses réservations (les clients placés restent dessinés
// sur les tables, la feuille d'une table dit toujours combien y sont assis).
// `ajouterTable` : venu du bouton « Ajouter une table » d'un plan vide, la
// section pose la première table à l'arrivée, une seule fois.
//
// La demande n'est pas effacée : c'est le contexte du dessin tant qu'on vient
// du service. Ouverte par la liste des réglages, la section l'ignore.
// ─────────────────────────────────────────────────────────────────────────────

let demande = null;
let compteur = 0;
const abonnes = new Set();
const sAbonner = (fn) => { abonnes.add(fn); return () => abonnes.delete(fn); };
const prevenir = () => abonnes.forEach((fn) => fn());

export function demanderDessin(contexte) {
  compteur += 1;
  demande = { ...contexte, n: compteur };
  prevenir();
}

export function marquerAjoutFait() {
  if (!demande?.ajouterTable) return;
  demande = { ...demande, ajouterTable: false };
  prevenir();
}

export function useDemandeDessin() {
  return useSyncExternalStore(sAbonner, () => demande, () => null);
}
