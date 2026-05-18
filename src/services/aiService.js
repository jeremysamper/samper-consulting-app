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

export const aiService = { ocrRecipe, detectAllergens };
export default aiService;
