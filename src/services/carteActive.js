import { dbService } from './dbService.js';
import { getDemoData } from '../data/demoData.js';
import { readLegacyStorage, writeLegacyStorage } from '../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Publier sur la carte active » de l'éditeur de fiches : la recette entre
// dans la liste `plats` (JSON) de la première carte non archivée de
// l'établissement, et passe au statut « active ». Mécanisme repris tel quel de
// l'éditeur des Outils consultant (27.10.2026). Le prix de la recette est
// recopié dans l'entrée de carte, comme avant ; rien ne l'affiche dans
// Cartes & Recettes, d'où ce service hors du module.
// ─────────────────────────────────────────────────────────────────────────────

const carteActiveDe = (cartes, etabId) =>
  (cartes || []).find(c => (c.etablissementId || 'etab-1') === etabId && !c.archive) || null;

export function estSurCarteActive(recette, cartes, etabId) {
  if (!recette) return false;
  const source = dbService.getBridge() ? cartes : readLegacyStorage('sc_cartes', getDemoData().cartes);
  return carteActiveDe(source, etabId)?.plats?.some(p => p.recetteId === recette.id) || false;
}

// Renvoie le nouveau statut de la recette ; lève une erreur si la carte n'a
// pas pu être enregistrée (la recette n'est alors pas touchée).
export async function publierSurCarteActive(recette, actif, cartes, etabId) {
  const db = dbService.getBridge()?.db;
  const demoData = getDemoData();
  const source = db ? cartes : readLegacyStorage('sc_cartes', demoData.cartes);
  let carte = carteActiveDe(source, etabId);
  if (!carte) {
    carte = {
      id: 'carte-' + etabId + '-' + Date.now(),
      etablissementId: etabId,
      nom: 'Carte principale',
      dateDebut: new Date().toISOString().slice(0, 10),
      dateFin: null,
      plats: [],
    };
  } else {
    carte = { ...carte, plats: [...(carte.plats || [])] };
  }
  if (actif) {
    if (!carte.plats.find(p => p.recetteId === recette.id)) {
      carte.plats.push({
        id: 'p-' + Date.now(),
        nom: recette.nom,
        categorie: recette.categorie,
        prix: recette.prixVente || 0,
        allergenes: recette.allergenesIds || [],
        recetteId: recette.id,
      });
    }
  } else {
    carte.plats = carte.plats.filter(p => p.recetteId !== recette.id);
  }
  if (db) {
    await db.upsertCarte(carte);
  } else {
    const toutes = readLegacyStorage('sc_cartes', demoData.cartes);
    const i = toutes.findIndex(c => c.id === carte.id);
    if (i >= 0) toutes[i] = carte; else toutes.push(carte);
    demoData.cartes = toutes;
    writeLegacyStorage('sc_cartes', toutes);
  }
  return actif ? 'active' : 'brouillon';
}
