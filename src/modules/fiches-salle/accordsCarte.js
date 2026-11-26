// ─────────────────────────────────────────────────────────────────────────────
// Accords d'une fiche salle reliés aux boissons de la maison (lot 15 du panel,
// 26.11.2026). Fonctions pures, sans React ni service : testées sous Node.
//
// Un accord reste l'objet libre { type, nom, region, alternative, notes } ; un
// accord relié porte en plus platId, l'identifiant de la boisson (un plat). Il
// garde toujours une copie du nom : si la boisson disparaît, si la lecture des
// plats échoue ou si un ancien front lit la fiche, l'accord reste lisible.
//
// La rupture se lit par la règle de la caisse (enRupture, rupture.js), jamais
// réécrite ici.
// ─────────────────────────────────────────────────────────────────────────────

import { enRupture } from '../caisse/rupture.js';
import { categorieDuPlat } from '../../utils/categoriesPlat.js';

const comparer = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { sensitivity: 'base' });

// Boissons proposables dans le formulaire, rangées par carte puis par nom.
// plats : plats de l'établissement (mapPlatFromDB) ; cartes : cartes que la
// personne voit (useCartes, cachées déjà retirées). Est une boisson un plat
// actif posé sur une carte visible et non archivée de genre « boissons », ou
// un plat actif de catégorie « Boissons » sans carte ou sur une carte visible.
// Entrée : { platId, nom, carteNom } (carteNom vide pour une boisson sans carte).
export function boissonsDeLaMaison(plats, cartes) {
  const visibles = new Map();
  (cartes || []).forEach((c) => {
    if (c && c.id && c.archive !== true) visibles.set(c.id, c);
  });
  const vues = new Set();
  const liste = [];
  (plats || []).forEach((p) => {
    if (!p || !p.id || p.actif === false || vues.has(p.id)) return;
    const ids = Array.isArray(p.carteIds) ? p.carteIds : [];
    const sesCartes = ids.map((id) => visibles.get(id)).filter(Boolean);
    const carteBoissons = sesCartes.find((c) => c.genre === 'boissons');
    let carteNom = null;
    if (carteBoissons) carteNom = carteBoissons.nom || '';
    else if (categorieDuPlat(p) === 'Boissons') {
      if (ids.length === 0) carteNom = '';
      else if (sesCartes.length > 0) carteNom = sesCartes[0].nom || '';
    }
    if (carteNom === null) return;
    vues.add(p.id);
    liste.push({ platId: p.id, nom: String(p.nom || ''), carteNom });
  });
  return liste.sort((a, b) => {
    if (!a.carteNom !== !b.carteNom) return a.carteNom ? -1 : 1;
    return comparer(a.carteNom, b.carteNom) || comparer(a.nom, b.nom);
  });
}

// { nom, etat } d'un accord. etat : 'libre' (pas de platId), 'lie',
// 'rupture' (la caisse l'a mis en rupture ce jour-là), 'retire' (plat
// introuvable ou inactif). platsParId : Map ou objet id -> plat ; vide ou
// absent (lecture en échec ou pas encore arrivée) : jamais 'retire'.
// boutonsParPlat : table plat_id -> ligne de caisse_boutons (listBoutons).
export function resoudreAccord(accord, platsParId, boutonsParPlat, jourZurich) {
  const nomGarde = String(accord?.nom || '');
  const platId = typeof accord?.platId === 'string' && accord.platId ? accord.platId : null;
  if (!platId) return { nom: nomGarde, etat: 'libre' };
  const taille = platsParId instanceof Map ? platsParId.size : Object.keys(platsParId || {}).length;
  const plat = platsParId instanceof Map ? platsParId.get(platId) : platsParId?.[platId];
  const bouton = boutonsParPlat ? boutonsParPlat[platId] : undefined;
  if (taille > 0) {
    if (!plat || plat.actif === false) return { nom: nomGarde, etat: 'retire' };
    const nom = String(plat.nom || '') || nomGarde;
    return { nom, etat: enRupture(bouton, jourZurich) ? 'rupture' : 'lie' };
  }
  return { nom: nomGarde, etat: enRupture(bouton, jourZurich) ? 'rupture' : 'lie' };
}

// L'accord relié à une boisson : platId et nom de la boisson, le reste nomGarde.
export function lierAccord(accord, boisson) {
  return { ...(accord || {}), platId: boisson.platId, nom: boisson.nom };
}

// L'accord rendu libre : platId retiré, nom nomGarde.
export function delierAccord(accord) {
  const { platId, ...reste } = accord || {};
  return reste;
}

// Avant l'enregistrement : un platId qui n'est pas une chaîne non vide est
// retiré ; tout le reste passe tel quel (clés inconnues comprises).
export function nettoyerAccords(accords) {
  return (accords || []).map((a) => {
    if (!a || typeof a !== 'object' || !('platId' in a)) return a;
    if (typeof a.platId === 'string' && a.platId.trim()) return a;
    const { platId, ...reste } = a;
    return reste;
  });
}
