// ─────────────────────────────────────────────────────────────────────────────
// État des points pour la personne connectée dans l'établissement courant
// (actif, participant, gère, barème), partagé par le filtre du menu
// (useVisibleNav), la garde de LegacyModuleHost, le retour immédiat de la
// coque et le module lui-même : une seule lecture par (personne, établissement).
//
// Avant la réponse, ou si la lecture échoue : rien d'actif, rien de
// participant, « gère » pris dans les droits du front (canManageModule). Un
// employé ne voit donc jamais l'entrée par erreur ; qui gère la voit toujours.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { pointsService } from './pointsService.js';

const cache = new Map(); // cle -> { etat, enCours }
const abonnes = new Set();

const cle = (etabId, userId) => `${userId || ''}|${etabId || ''}`;

function prevenir() {
  abonnes.forEach((fn) => { try { fn(); } catch { /* écouteur fautif ignoré */ } });
}

function charger(etabId, userId, { force = false } = {}) {
  const k = cle(etabId, userId);
  const entree = cache.get(k);
  if (!force && entree && (entree.etat || entree.enCours)) return entree.enCours || Promise.resolve(entree.etat);
  const enCours = pointsService.etat(etabId)
    .then((etat) => {
      cache.set(k, { etat: etat || null, enCours: null });
      prevenir();
      return etat;
    })
    .catch((err) => {
      // Migration absente ou réseau coupé : on garde l'état connu, rien de plus.
      console.warn('[points] état non lu', err?.message || err);
      cache.set(k, { etat: entree?.etat || null, enCours: null, erreur: true });
      prevenir();
      return entree?.etat || null;
    });
  cache.set(k, { etat: entree?.etat || null, enCours });
  return enCours;
}

// Relit l'état après un réglage (activation, rôles, exclusions).
export function rafraichirPointsEtat(etabId, userId) {
  return charger(etabId, userId, { force: true });
}

export function lirePointsEtat(etabId, userId) {
  return cache.get(cle(etabId, userId))?.etat || null;
}

// État courant : { actif, participant, gere, bareme, roles_participants, exclus }.
// `gereFront` : droit « gérer » du front, pris tant que la base n'a pas répondu.
export function usePointsEtat(etabId, userId, { gereFront = false, enabled = true } = {}) {
  const [, forcer] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    abonnes.add(forcer);
    return () => { abonnes.delete(forcer); };
  }, []);
  React.useEffect(() => {
    if (!enabled || !etabId || !userId) return;
    charger(etabId, userId);
  }, [etabId, userId, enabled]);
  const etat = enabled && etabId && userId ? lirePointsEtat(etabId, userId) : null;
  return React.useMemo(() => ({
    pret: Boolean(etat),
    actif: Boolean(etat?.actif),
    participant: Boolean(etat?.participant),
    gere: etat ? Boolean(etat.gere) : Boolean(gereFront),
    bareme: etat?.bareme || null,
    rolesParticipants: Array.isArray(etat?.roles_participants) ? etat.roles_participants : null,
    exclus: Array.isArray(etat?.exclus) ? etat.exclus : [],
  }), [etat, gereFront]);
}
