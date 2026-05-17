// ─────────────────────────────────────────────────────────────
// PdfImporter — extraction de recettes depuis un PDF texte.
//
// Extrait le texte via pdf.js, détecte les sections par heuristiques
// (titre = plus grande police, ingrédients = lignes « QTÉ UNITÉ NOM »,
// étapes = bloc numéroté). Multi-recettes : un saut de page sans nouveau
// titre est rattaché à la recette précédente.
//
// Si le PDF est une image scannée (aucun texte sélectionnable), renvoie
// { scanned: true } pour afficher un message dédié.
//
// API : parsePdf(arrayBuffer) -> Promise<{ scanned, recipes }>
// ─────────────────────────────────────────────────────────────
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseQuantity, normalizeUnit, toAppUnit } from './UnitParser.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

let tempCounter = 0;
const tempId = (prefix) => `${prefix}-${Date.now()}-${tempCounter++}`;

// Regroupe les items texte d'une page en lignes (par coordonnée Y).
function groupLines(items) {
  const buckets = [];
  for (const it of items) {
    const str = (it.str || '');
    if (!str.trim() && !it.hasEOL) continue;
    const y = Math.round((it.transform ? it.transform[5] : 0));
    const size = it.transform ? Math.abs(it.transform[3]) || it.height || 10 : (it.height || 10);
    let bucket = buckets.find(b => Math.abs(b.y - y) <= 3);
    if (!bucket) { bucket = { y, parts: [], size }; buckets.push(bucket); }
    bucket.parts.push(str);
    bucket.size = Math.max(bucket.size, size);
  }
  return buckets
    .sort((a, b) => b.y - a.y)
    .map(b => ({ text: b.parts.join(' ').replace(/\s+/g, ' ').trim(), size: b.size }))
    .filter(l => l.text.length > 0);
}

// Tente de lire une ligne d'ingrédient « 200 g farine », « 1/2 L lait »…
function parseIngredientLine(text) {
  const m = text.match(/^([0-9]+(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]+)?|[¼½¾⅓⅔])\s*(.*)$/);
  if (!m) return null;
  const quantity = parseQuantity(m[1]);
  if (quantity == null) return null;
  let rest = (m[2] || '').trim();
  if (!rest) return null;
  let unite = 'g';
  let unitFound = false;
  const words = rest.split(/\s+/);
  const u = normalizeUnit(words[0]);
  if (u) { unite = u; rest = words.slice(1).join(' '); unitFound = true; }
  const nom = rest.replace(/^d['e]\s+/i, '').replace(/^[:•\-–]\s*/, '').trim();
  if (!nom || nom.length < 2) return null;
  return { quantity, unite, nom, unitFound };
}

const STEP_RE = /^(?:étape\s*)?(\d{1,2})\s*[.)\-:]\s*(.+)$/i;
const SECTION_ING = /ingr[ée]dients?/i;
const SECTION_STEPS = /(pr[ée]paration|[ée]tapes?|r[ée]alisation|m[ée]thode)/i;
const SECTION_OTHER = /(dressage|conservation|allerg[èe]nes?|astuce|notes?)/i;

// Extrait une recette depuis les lignes d'une page.
function extractRecipe(lines) {
  if (!lines.length) return null;

  // Titre = plus grande police (sinon première ligne).
  const maxSize = Math.max(...lines.map(l => l.size));
  const titleLine = lines.find(l => l.size >= maxSize - 0.5) || lines[0];
  const hasTitle = titleLine.size >= maxSize - 0.5 && titleLine.text.length <= 80;

  const recipe = {
    _tempId: tempId('rec'),
    nom: (hasTitle ? titleLine.text : lines[0].text).slice(0, 120) || 'Recette importée',
    categorie: 'Plats',
    portions: 4,
    prixVente: 0,
    statut: 'brouillon',
    version: 1,
    allergenesIds: [],
    notesConsultant: '',
    ingredients: [],
    etapes: [],
    _warnings: [],
  };

  // Portions éventuelles.
  for (const l of lines) {
    const pm = l.text.match(/(\d+)\s*(?:portions?|personnes?|couverts?|pers\.?)/i);
    if (pm) { recipe.portions = parseInt(pm[1], 10) || 4; break; }
  }

  let mode = 'auto'; // 'auto' | 'ingredients' | 'steps' | 'other'
  for (const l of lines) {
    const t = l.text;
    if (t === recipe.nom) continue;
    if (SECTION_ING.test(t) && t.length < 30) { mode = 'ingredients'; continue; }
    if (SECTION_STEPS.test(t) && t.length < 30) { mode = 'steps'; continue; }
    if (SECTION_OTHER.test(t) && t.length < 30) { mode = 'other'; continue; }

    const stepM = t.match(STEP_RE);
    if (stepM && (mode === 'steps' || mode === 'auto')) {
      recipe.etapes.push(stepM[2].trim());
      mode = 'steps';
      continue;
    }

    if (mode !== 'steps' && mode !== 'other') {
      const ing = parseIngredientLine(t);
      if (ing) {
        const app = toAppUnit(ing.unite, ing.quantity);
        recipe.ingredients.push({
          id: tempId('i'),
          nom: ing.nom,
          quantite: app.quantity,
          unite: app.unit,
          prixUnit: 0,
          categorie: 'Autres',
          _import: { warning: !ing.unitFound, originalText: t },
        });
        if (mode === 'auto') mode = 'ingredients';
        continue;
      }
    }

    if (mode === 'steps' && t.length > 12) {
      recipe.etapes.push(t.trim());
    }
  }

  if (recipe.ingredients.length === 0 && recipe.etapes.length === 0) return null;
  if (recipe.ingredients.length === 0) recipe._warnings.push('Aucun ingrédient détecté');
  return { recipe, hasTitle };
}

export async function parsePdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  let totalTextLength = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    totalTextLength += content.items.reduce((s, it) => s + (it.str || '').trim().length, 0);
    pages.push(groupLines(content.items));
  }

  // Aucun texte sélectionnable -> PDF scanné / photographié.
  if (totalTextLength < 25) {
    return { scanned: true, recipes: [] };
  }

  const recipes = [];
  for (const lines of pages) {
    const extracted = extractRecipe(lines);
    if (!extracted) continue;
    if (extracted.hasTitle || recipes.length === 0) {
      recipes.push(extracted.recipe);
    } else {
      // Page sans nouveau titre : suite de la recette précédente.
      const prev = recipes[recipes.length - 1];
      prev.ingredients.push(...extracted.recipe.ingredients);
      prev.etapes.push(...extracted.recipe.etapes);
    }
  }

  recipes.forEach(rec => {
    const flagged = rec.ingredients.filter(i => i._import && i._import.warning).length;
    if (flagged > 0) rec._warnings.push(`${flagged} ingrédient(s) à vérifier (unité incertaine)`);
  });

  return { scanned: false, recipes };
}
