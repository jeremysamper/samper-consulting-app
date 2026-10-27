import { getBrowserWindow } from '../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stabilité de la saisie d'une fiche recette (éditeur de Cartes & Recettes) :
// brouillon local anti-crash, empreinte pour détecter une modification venue
// d'ailleurs, fusion des champs que l'éditeur ne tient pas.
//
// Hors de src/modules/recettes : l'empreinte et la fusion manipulent le prix
// de vente et les prix des lignes, tenus par le Chiffrage des Outils
// consultant. Cartes & Recettes n'en affiche aucun.
// ─────────────────────────────────────────────────────────────────────────────

// Préfixe des brouillons, inchangé depuis l'éditeur des Outils consultant : un
// brouillon laissé avant ce déplacement se retrouve à l'ouverture de sa fiche.
const PREFIXE = 'sc_recipe_draft_';

// Champs significatifs d'une recette (comparaison conflit / brouillon).
export function empreinteRecette(r) {
  if (!r) return '';
  return JSON.stringify({
    nom: r.nom || '', categorie: r.categorie || '', portions: r.portions || 0,
    prixVente: r.prixVente || 0, statut: r.statut || '', version: r.version || 1,
    tempsPreparation: r.tempsPreparation || 0, tempsCuisson: r.tempsCuisson || 0,
    allergenesIds: r.allergenesIds || [], notesConsultant: r.notesConsultant || '',
    dressage: r.dressage || '', conservation: r.conservation || '',
    photoUrl: r.photoUrl || null, ingredients: r.ingredients || [], etapes: r.etapes || [],
  });
}

const stockage = () => {
  try { return getBrowserWindow()?.localStorage || null; } catch (e) { return null; }
};

export function ecrireBrouillon(id, recette) {
  const s = stockage();
  if (!s || !id) return;
  try { s.setItem(PREFIXE + id, JSON.stringify({ recipe: recette, savedAt: Date.now() })); }
  catch (e) { /* quota dépassé : on ignore */ }
}

export function lireBrouillon(id) {
  const s = stockage();
  if (!s || !id) return null;
  try { const v = s.getItem(PREFIXE + id); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}

export function effacerBrouillon(id) {
  const s = stockage();
  if (!s || !id) return;
  try { s.removeItem(PREFIXE + id); } catch (e) { /* noop */ }
}

// Champs que l'éditeur ne modifie jamais : le prix de vente (Chiffrage), le
// masquage (Outils consultant), la congélation et les durées de vie (fiche
// ouverte). Pendant une saisie, la version locale garde la main sur le reste,
// mais ces champs suivent la base : sans cela, la sauvegarde suivante de
// l'éditeur écraserait un prix saisi entre-temps dans le Chiffrage.
const CHAMPS_EXTERNES = ['prixVente', 'masquee', 'congelable', 'dureeVieJours', 'dureeVieCongeleJours', 'dureeVieDecongeleJours'];

export function fusionnerChampsExternes(locale, serveur) {
  if (!locale || !serveur) return locale;
  const fusion = { ...locale };
  CHAMPS_EXTERNES.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(serveur, k)) fusion[k] = serveur[k];
  });
  // Prix d'une ligne : celui de la base tant que la ligne garde le même
  // produit et la même unité (sinon l'éditeur l'a recalculé lui-même).
  const parId = new Map((serveur.ingredients || []).map(i => [i.id, i]));
  fusion.ingredients = (locale.ingredients || []).map((ing) => {
    const s = parId.get(ing.id);
    if (!s || (s.produitId || null) !== (ing.produitId || null) || s.unite !== ing.unite) return ing;
    return { ...ing, prixUnit: s.prixUnit };
  });
  return fusion;
}

// Copie d'une recette pour « Dupliquer » : nouvel id, brouillon, version 1,
// visible ; le reste (prix compris) suit l'originale.
export function copieRecette(recette, userId) {
  const copie = JSON.parse(JSON.stringify(recette));
  const t = Date.now();
  copie.id = 'rec-' + t;
  copie.nom = (recette.nom || '') + ' (copie)';
  copie.version = 1;
  copie.statut = 'brouillon';
  // upsertRecette n'écrit pas `masquee` : la copie naît visible en base.
  copie.masquee = false;
  copie.modifie = new Date().toISOString().slice(0, 10);
  copie.modifiePar = userId || null;
  copie.ingredients = (copie.ingredients || []).map((i, idx) => ({ ...i, id: 'i' + t + '_' + idx }));
  return copie;
}
