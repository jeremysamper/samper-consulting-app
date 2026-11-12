import { useCallback, useSyncExternalStore } from 'react';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carte d'accueil de Cartes & Recettes : la carte qui s'ouvre à l'arrivée dans
// le module. Préférence de la personne, par établissement (user_settings,
// clé cartes_default:<etab>, cache hydraté à la connexion).
//
// Un seul état pour deux endroits : le bouton « Définir par défaut » de la
// carte affichée (Recettes.jsx) et la section « Carte d'accueil » de la page
// des réglages lisent et écrivent ici, ils sont toujours d'accord.
// ─────────────────────────────────────────────────────────────────────────────

const cle = (etabId) => 'cartes_default:' + etabId;
// Valeur choisie pendant cette session, par établissement : elle s'affiche
// tout de suite, sans attendre l'écriture (comme le faisait le module).
const choisies = new Map();
const abonnes = new Set();
const sAbonner = (fn) => { abonnes.add(fn); return () => abonnes.delete(fn); };

export function lireCarteAccueil(etabId) {
  if (!etabId) return null;
  if (choisies.has(etabId)) return choisies.get(etabId);
  return dbService.getDb()?.getUserSettingSync?.(cle(etabId), null) || null;
}

// Pose la carte d'accueil (null : aucune, la première carte s'ouvre). L'écran
// suit tout de suite ; une écriture refusée remonte à l'appelant, qui le dit.
export async function choisirCarteAccueil(etabId, carteId) {
  if (!etabId) return;
  choisies.set(etabId, carteId || null);
  abonnes.forEach((fn) => fn());
  await dbService.getDb()?.setUserSetting?.(cle(etabId), carteId || null);
}

export function useCarteAccueil(etabId) {
  const carteId = useSyncExternalStore(sAbonner, () => lireCarteAccueil(etabId), () => null);
  const choisir = useCallback((id) => choisirCarteAccueil(etabId, id), [etabId]);
  return { carteId, choisir };
}
