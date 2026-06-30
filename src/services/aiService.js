// ════════════════════════════════════════════════════════════════
// aiService — client des fonctionnalités IA.
//
// Tous les appels passent par l'edge function Supabase « ai-proxy » : la clé
// API reste côté serveur, jamais dans le bundle. Le jeton de session de
// l'utilisateur est transmis automatiquement par supabase.functions.invoke.
// ════════════════════════════════════════════════════════════════
import imageCompression from 'browser-image-compression';
import { supabase } from './supabase.js';
import { normalizeUnit, toAppUnit } from '../modules/recettes/import/UnitParser.js';

let tmpCounter = 0;
const tid = (prefix) => `${prefix}-${Date.now()}-${tmpCounter++}`;

const ACCEPTED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Appel générique de l'edge function ai-proxy.
async function callAi(task, payload) {
  const { data, error } = await supabase.functions.invoke('ai-proxy', { body: { task, payload } });
  if (error) {
    let message = error.message || 'Appel IA échoué.';
    // Le corps d'erreur de la fonction (JSON { error }) est dans error.context.
    try {
      const ctx = error.context && typeof error.context.json === 'function'
        ? await error.context.json()
        : null;
      if (ctx && ctx.error) message = ctx.error;
    } catch (e) { /* on garde le message générique */ }
    throw new Error(message);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// Lit un fichier en base64 (sans le préfixe data:...;base64,).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

// Convertit une recette renvoyée par l'IA vers la forme utilisée par le
// module d'import (compatible avec ImportPreview).
function mapAiRecipe(r) {
  const ingredients = (r.ingredients || []).map((ing) => {
    const canonical = normalizeUnit(ing.unite) || ing.unite || 'g';
    const app = toAppUnit(canonical, Number(ing.quantite) || 0);
    const nom = String(ing.nom || '').trim();
    return {
      id: tid('i'),
      nom,
      quantite: app.quantity,
      unite: app.unit,
      prixUnit: 0,
      categorie: 'Autres',
      _import: {
        warning: !nom || app.unknown,
        originalText: `${ing.quantite != null ? ing.quantite : ''} ${ing.unite || ''}`.trim(),
      },
    };
  });
  return {
    _tempId: tid('rec'),
    nom: String(r.nom || '').trim() || 'Recette importée',
    categorie: r.categorie || 'Plats',
    portions: Number(r.portions) || 4,
    prixVente: 0,
    statut: 'brouillon',
    version: 1,
    allergenesIds: [],
    notesConsultant: '',
    ingredients,
    etapes: (r.etapes || []).map(e => String(e || '').trim()).filter(Boolean),
    _warnings: ingredients.length === 0 ? ['Aucun ingrédient détecté par l\'IA'] : [],
  };
}

// OCR : extrait la/les recette(s) d'une image (photo ou scan).
// Renvoie { recipes: [...] } au format du module d'import.
export async function ocrRecipe(file) {
  // Compression pour réduire coût et latence (l'original est conservé en repli).
  let img = file;
  try {
    img = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 1800, useWebWorker: true });
  } catch (e) {
    img = file;
  }
  const imageBase64 = await fileToBase64(img);
  if (!imageBase64) throw new Error('Image vide ou illisible.');
  let mediaType = (img.type || file.type || 'image/jpeg').toLowerCase();
  if (!ACCEPTED_MEDIA.includes(mediaType)) mediaType = 'image/jpeg';

  const data = await callAi('ocr-recipe', { imageBase64, mediaType });
  const recipes = ((data && data.result && data.result.recipes) || []).map(mapAiRecipe);
  return { recipes };
}

// Détection d'allergènes : déduit les allergènes réglementaires d'une recette
// à partir de la liste des noms d'ingrédients.
// Renvoie { allergenes: string[], incertains: string[], note: string }.
export async function detectAllergens(ingredientNames, recipeName) {
  const ingredients = (ingredientNames || []).map(s => String(s || '').trim()).filter(Boolean);
  if (!ingredients.length) return { allergenes: [], incertains: [], note: '' };
  const data = await callAi('detect-allergens', { ingredients, recipeName: recipeName || '' });
  const r = (data && data.result) || {};
  return {
    allergenes: Array.isArray(r.allergenes) ? r.allergenes : [],
    incertains: Array.isArray(r.incertains) ? r.incertains : [],
    note: typeof r.note === 'string' ? r.note : '',
  };
}

// Génération HACCP : analyse des dangers et points de maîtrise d'une recette.
// Renvoie { points: [...], conservation: string, remarques: string }.
export async function generateHaccp(recipe) {
  const ingredients = ((recipe && recipe.ingredients) || [])
    .map(i => String(i.nom || '').trim()).filter(Boolean);
  const etapes = ((recipe && recipe.etapes) || [])
    .map(e => String(e || '').trim()).filter(Boolean);
  const data = await callAi('generate-haccp', {
    recipeName: (recipe && recipe.nom) || '',
    categorie: (recipe && recipe.categorie) || '',
    ingredients,
    etapes,
  });
  const r = (data && data.result) || {};
  return {
    points: Array.isArray(r.points) ? r.points : [],
    conservation: typeof r.conservation === 'string' ? r.conservation : '',
    remarques: typeof r.remarques === 'string' ? r.remarques : '',
  };
}

// Suggestions de complétion : à partir d'une recette en cours, propose des
// ingrédients manquants et des étapes. Renvoie { ingredients: [...], etapes: [...] }.
export async function suggestRecipe(recipe, catalogueNames) {
  const data = await callAi('suggest-recipe', {
    recipeName: (recipe && recipe.nom) || '',
    categorie: (recipe && recipe.categorie) || '',
    ingredients: ((recipe && recipe.ingredients) || []).map(i => String(i.nom || '').trim()).filter(Boolean),
    etapes: ((recipe && recipe.etapes) || []).map(e => String(e || '').trim()).filter(Boolean),
    catalogue: (catalogueNames || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 120),
  });
  const r = (data && data.result) || {};
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .map((ing) => {
      const canonical = normalizeUnit(ing.unite) || ing.unite || 'g';
      const app = toAppUnit(canonical, Number(ing.quantite) || 0);
      return { nom: String(ing.nom || '').trim(), quantite: app.quantity, unite: app.unit };
    })
    .filter(i => i.nom);
  const etapes = (Array.isArray(r.etapes) ? r.etapes : [])
    .map(e => String(e || '').trim())
    .filter(Boolean);
  return { ingredients, etapes };
}

// Matching sémantique : l'IA choisit le produit du catalogue le plus pertinent
// pour un nom d'ingrédient. Renvoie { produitId, confidence, raison }.
export async function matchProductSemantic(ingredientName, products) {
  const ingredient = String(ingredientName || '').trim();
  const list = (products || [])
    .filter(p => p && p.id && p.nom)
    .map(p => ({ id: p.id, nom: p.nom }));
  if (!ingredient || !list.length) return { produitId: null, confidence: 0, raison: '' };
  const data = await callAi('match-product', { ingredient, products: list.slice(0, 200) });
  const r = (data && data.result) || {};
  // On ne retient l'id que s'il existe réellement dans le catalogue fourni.
  const produitId = r.produitId && list.some(p => p.id === r.produitId) ? r.produitId : null;
  return {
    produitId,
    confidence: Number(r.confidence) || 0,
    raison: typeof r.raison === 'string' ? r.raison : '',
  };
}

// Génération de fiche salle : à partir d'une recette, l'IA rédige le contenu
// service (description commerciale, dressage, accords mets-boissons…).
// Renvoie { descriptionService, temperatureService, dressageNotes,
// infosService, tempsPreparation, accords: [...], accordsGeneraux: [...] }.
export async function generateFicheSalle(recipe, allergenLabels) {
  const ingredients = ((recipe && recipe.ingredients) || [])
    .map(i => String(i.nom || '').trim()).filter(Boolean);
  const etapes = ((recipe && recipe.etapes) || [])
    .map(e => String(e || '').trim()).filter(Boolean);
  const allergenes = (allergenLabels || []).map(s => String(s || '').trim()).filter(Boolean);
  const data = await callAi('generate-fiche-salle', {
    recipeName: (recipe && recipe.nom) || '',
    categorie: (recipe && recipe.categorie) || '',
    portions: (recipe && recipe.portions) || '',
    ingredients,
    etapes,
    allergenes,
  });
  const r = (data && data.result) || {};
  const accords = (Array.isArray(r.accords) ? r.accords : [])
    .map((a) => ({
      type: a && a.type === 'sans_alcool' ? 'sans_alcool' : 'vin',
      nom: String((a && a.nom) || '').trim(),
      region: String((a && a.region) || '').trim(),
      alternative: String((a && a.alternative) || '').trim(),
      notes: String((a && a.notes) || '').trim(),
    }))
    .filter(a => a.nom);
  const accordsGeneraux = (Array.isArray(r.accordsGeneraux) ? r.accordsGeneraux : [])
    .map(x => String(x || '').trim())
    .filter(Boolean);
  return {
    descriptionService: typeof r.descriptionService === 'string' ? r.descriptionService : '',
    temperatureService: typeof r.temperatureService === 'string' ? r.temperatureService : '',
    dressageNotes: typeof r.dressageNotes === 'string' ? r.dressageNotes : '',
    infosService: typeof r.infosService === 'string' ? r.infosService : '',
    tempsPreparation: typeof r.tempsPreparation === 'string' ? r.tempsPreparation : '',
    accords,
    accordsGeneraux,
  };
}

// Import catalogue assisté par IA : extrait et fiabilise une liste de produits
// à partir du contenu texte brut d'un fichier fournisseur (Excel/CSV converti).
// Renvoie { produits: [{ nom, categorie, uniteRef, conditionnement,
// prixUnitaire, referenceFourn, confidence, issues }] }.
const CATALOGUE_UNITS = new Set(['g', 'ml', 'pcs']);

export async function parseCatalogue(rawText) {
  const rows = String(rawText || '').trim();
  if (!rows) return { produits: [] };
  const data = await callAi('parse-catalogue', { rows });
  const r = (data && data.result) || {};
  const produits = (Array.isArray(r.produits) ? r.produits : [])
    .map((p) => {
      const nom = String((p && p.nom) || '').trim();
      let uniteRef = String((p && p.uniteRef) || '').trim().toLowerCase();
      if (!CATALOGUE_UNITS.has(uniteRef)) uniteRef = 'g';
      const prix = Number(p && p.prixUnitaire);
      const issues = Array.isArray(p && p.issues)
        ? p.issues.map(s => String(s || '').trim()).filter(Boolean)
        : [];
      const conf = Math.max(0, Math.min(100, Math.round(Number(p && p.confidence) || 0)));
      return {
        _tempId: tid('prod'),
        nom,
        categorie: String((p && p.categorie) || '').trim() || 'Autres',
        uniteRef,
        conditionnement: String((p && p.conditionnement) || '').trim(),
        prixUnitaire: Number.isFinite(prix) && prix > 0 ? prix : 0,
        referenceFourn: String((p && p.referenceFourn) || '').trim(),
        confidence: conf,
        issues,
      };
    })
    .filter(p => p.nom);
  return { produits };
}

// Dédup sémantique de la liste de commande : l'IA regroupe les noms de produits
// qui désignent le même produit à l'achat (singulier/pluriel, accents,
// synonymes, fautes), sans toucher aux quantités. Renvoie { groupes: [{
// canonique, variantes: string[] }] } — uniquement les groupes contenant un
// vrai doublon (≥ 2 variantes).
export async function dedupeCommande(produits) {
  const list = (produits || []).map(s => String(s || '').trim()).filter(Boolean);
  if (list.length < 2) return { groupes: [] };
  const data = await callAi('dedupe-commande', { produits: list.slice(0, 300) });
  const r = (data && data.result) || {};
  const groupes = (Array.isArray(r.groupes) ? r.groupes : [])
    .map(g => ({
      canonique: String((g && g.canonique) || '').trim(),
      variantes: (Array.isArray(g && g.variantes) ? g.variantes : [])
        .map(v => String(v || '').trim()).filter(Boolean),
    }))
    .filter(g => g.canonique && g.variantes.length >= 2);
  return { groupes };
}

export const aiService = {
  ocrRecipe, detectAllergens, generateHaccp, suggestRecipe, matchProductSemantic,
  generateFicheSalle, parseCatalogue, dedupeCommande,
};
export default aiService;
