import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Signal « un réglage a changé » entre la page des réglages et les modules.
//
// Les modules restent montés quand on ouvre la page des réglages (keep-alive
// d'App.jsx). Un réglage enregistré dans la page doit s'appliquer dans son
// module sans recharger l'app ; le temps réel ne couvre pas toutes les tables
// de réglage (réservation en ligne, spa, contrats, noms des modules n'y sont
// pas). Ce signal local le fait partout de la même façon :
//
//   signalerReglage('caisse')                    la page, à chaque
//                                                enregistrement connu et à la
//                                                sortie d'une section ;
//   useReglageModifie('caisse', recharger)       le module, qui relit.
//
// L'identifiant est celui de la section (compte/registreReglages.js). Rien
// n'est mémorisé : un module monté plus tard lit de toute façon la base.
// ─────────────────────────────────────────────────────────────────────────────

const ecouteurs = new Map();

export function ecouterReglage(ids, fn) {
  const liste = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  liste.forEach((id) => {
    if (!ecouteurs.has(id)) ecouteurs.set(id, new Set());
    ecouteurs.get(id).add(fn);
  });
  return () => liste.forEach((id) => ecouteurs.get(id)?.delete(fn));
}

export function signalerReglage(id) {
  if (!id) return;
  [...(ecouteurs.get(id) || [])].forEach((fn) => {
    try { fn(id); } catch (e) { console.warn('[réglages] relecture après changement', id, e); }
  });
}

// Dans un module : relit quand une de ces sections signale un changement.
// `recharger` peut changer à chaque rendu, il est lu par référence.
export function useReglageModifie(ids, recharger) {
  const ref = useRef(recharger);
  ref.current = recharger;
  const cle = (Array.isArray(ids) ? ids : [ids]).join('|');
  useEffect(() => ecouterReglage(cle.split('|'), (id) => ref.current?.(id)), [cle]);
}
