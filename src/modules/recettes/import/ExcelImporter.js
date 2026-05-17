// ─────────────────────────────────────────────────────────────
// ExcelImporter — parse un classeur XLSX / XLS / CSV en recettes.
//
// Deux formats reconnus :
//  1. Multi-feuilles (template officiel) : feuilles Recettes / Ingrédients / Étapes
//  2. Plat (une feuille) : une ligne = un ingrédient OU une étape, recettes
//     regroupées par la colonne « titre ». Mapping de colonnes flexible.
//
// API :
//   parseWorkbook(arrayBuffer)            -> { format, recipes?, needsMapping?, headers?, rows? }
//   buildFromMapping(rows, headerRow, map)-> recipes
//   FIELD_LABELS                          -> libellés des champs cibles (assistant de mapping)
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';
import { parse as parseUnit, parseQuantity, normalizeUnit, toAppUnit } from './UnitParser.js';

const norm = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');

// Champs cibles + synonymes d'en-tête pour l'auto-détection.
const COLUMN_SYNONYMS = {
  titre: ['titre', 'nom', 'nom de la recette', 'recette', 'name', 'plat'],
  categorie: ['categorie', 'category', 'type', 'famille'],
  portions: ['portions', 'portion', 'couverts', 'pers', 'personnes', 'nb portions'],
  prixVente: ['prix de vente', 'prix vente', 'prix de vente (chf)', 'prix', 'price'],
  ingredient: ['ingredient', 'ingredients', 'produit', 'item', 'designation'],
  quantite: ['quantite', 'qte', 'qty', 'quantity', 'qt'],
  unite: ['unite', 'unit', 'u', 'mesure'],
  prixUnit: ['prix unitaire', 'prix unitaire (chf)', 'prix unite', 'prix/unite', 'cout unitaire'],
  etapeNumero: ['etape numero', 'ordre', 'numero etape', 'step number', 'no etape', 'n etape'],
  etapeTexte: ['etape texte', 'etape', 'description', 'instruction', 'instructions', 'step', 'steps'],
  allergenes: ['allergenes', 'allergene', 'allergens', 'allergenes (separes par ;)'],
};

export const FIELD_LABELS = {
  titre: 'Titre de la recette',
  categorie: 'Catégorie',
  portions: 'Portions',
  prixVente: 'Prix de vente',
  ingredient: 'Ingrédient',
  quantite: 'Quantité',
  unite: 'Unité',
  prixUnit: 'Prix unitaire',
  etapeNumero: 'N° étape',
  etapeTexte: 'Texte étape',
  allergenes: 'Allergènes',
};

const CATEGORIES_VALIDES = ['Entrées', 'Plats', 'Desserts', 'Fromages', 'Sauces', 'Fonds', 'Amuse-bouches', 'Garnitures'];
const normalizeCategorie = (raw) => {
  const n = norm(raw);
  if (!n) return 'Plats';
  const hit = CATEGORIES_VALIDES.find(c => norm(c) === n || norm(c).startsWith(n));
  if (hit) return hit;
  if (/dessert|sucr/.test(n)) return 'Desserts';
  if (/entree|froid/.test(n)) return 'Entrées';
  if (/fromage/.test(n)) return 'Fromages';
  if (/sauce/.test(n)) return 'Sauces';
  return 'Plats';
};

let tempCounter = 0;
const tempId = (prefix) => `${prefix}-${Date.now()}-${tempCounter++}`;

// Détecte la correspondance en-tête -> champ cible. Renvoie { field: colIndex }.
function detectColumns(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const h = norm(cell);
    if (!h) return;
    for (const [field, syns] of Object.entries(COLUMN_SYNONYMS)) {
      if (map[field] != null) continue;
      if (syns.some(s => s === h || h === s)) { map[field] = idx; return; }
    }
  });
  // Deuxième passe plus tolérante (inclusion partielle).
  headerRow.forEach((cell, idx) => {
    const h = norm(cell);
    if (!h) return;
    for (const [field, syns] of Object.entries(COLUMN_SYNONYMS)) {
      if (map[field] != null) continue;
      if (Object.values(map).includes(idx)) continue;
      if (syns.some(s => h.includes(s) || s.includes(h))) { map[field] = idx; }
    }
  });
  return map;
}

// Construit un ingrédient à partir des cellules brutes.
function makeIngredient(nomCell, qtyCell, uniteCell, prixCell) {
  const nom = String(nomCell ?? '').trim();
  let quantite = 0;
  let unite = 'g';
  let warning = false;
  const originalQty = String(qtyCell ?? '').trim();
  const originalUnit = String(uniteCell ?? '').trim();

  if (originalUnit) {
    const u = normalizeUnit(originalUnit);
    if (u) unite = u; else warning = true;
  }
  if (originalQty) {
    const q = parseQuantity(originalQty);
    if (q != null) {
      quantite = q;
    } else {
      // La cellule quantité contient peut-être quantité + unité ("30 g").
      const parsed = parseUnit(originalQty);
      if (parsed && parsed.quantity != null) {
        quantite = parsed.quantity;
        if (parsed.unit && !originalUnit) unite = parsed.unit;
      } else {
        warning = true;
      }
    }
  } else if (!originalUnit) {
    warning = true; // ni quantité ni unité
  }

  // Conversion vers les unités de l'éditeur (cl -> ml, c.s. -> cs…).
  const app = toAppUnit(unite, quantite);

  return {
    id: tempId('i'),
    nom,
    quantite: app.quantity,
    unite: app.unit,
    prixUnit: Number(String(prixCell ?? '').replace(',', '.')) || 0,
    categorie: 'Autres',
    _import: { originalQty, originalUnit, warning: warning || !nom },
  };
}

const splitAllergenes = (raw) => String(raw ?? '')
  .split(/[;,]/).map(s => norm(s)).filter(Boolean);

// Construit les recettes depuis les lignes + un mapping de colonnes.
export function buildFromMapping(rows, headerRowIndex, map) {
  const dataRows = rows.slice(headerRowIndex + 1);
  const byTitre = new Map();

  for (const row of dataRows) {
    const get = (field) => (map[field] != null ? row[map[field]] : undefined);
    const titre = String(get('titre') ?? '').trim();
    if (!titre) continue;

    if (!byTitre.has(titre)) {
      byTitre.set(titre, {
        _tempId: tempId('rec'),
        nom: titre,
        categorie: normalizeCategorie(get('categorie')),
        portions: Number(get('portions')) || 4,
        prixVente: Number(String(get('prixVente') ?? '').replace(',', '.')) || 0,
        statut: 'brouillon',
        version: 1,
        allergenesIds: splitAllergenes(get('allergenes')),
        notesConsultant: '',
        ingredients: [],
        etapes: [],
        _etapesBuffer: [],
        _warnings: [],
      });
    }
    const rec = byTitre.get(titre);

    const ingNom = get('ingredient');
    if (ingNom != null && String(ingNom).trim() !== '') {
      rec.ingredients.push(makeIngredient(ingNom, get('quantite'), get('unite'), get('prixUnit')));
    }
    const etapeTxt = get('etapeTexte');
    if (etapeTxt != null && String(etapeTxt).trim() !== '') {
      rec._etapesBuffer.push({ ordre: Number(get('etapeNumero')) || rec._etapesBuffer.length + 1, texte: String(etapeTxt).trim() });
    }
  }

  return Array.from(byTitre.values()).map(rec => {
    rec.etapes = rec._etapesBuffer.sort((a, b) => a.ordre - b.ordre).map(e => e.texte);
    delete rec._etapesBuffer;
    const flagged = rec.ingredients.filter(i => i._import.warning).length;
    if (flagged > 0) rec._warnings.push(`${flagged} ligne(s) ingrédient à vérifier`);
    if (rec.ingredients.length === 0) rec._warnings.push('Aucun ingrédient détecté');
    return rec;
  });
}

// Parse le template multi-feuilles (Recettes / Ingrédients / Étapes).
function parseMultiSheet(wb) {
  const findSheet = (re) => wb.SheetNames.find(n => re.test(norm(n)));
  const sRec = findSheet(/^recettes?$/);
  const sIng = findSheet(/^ingredients?$/);
  const sEta = findSheet(/^etapes?$/);
  if (!sRec || !sIng) return null;

  const recRows = XLSX.utils.sheet_to_json(wb.Sheets[sRec], { header: 1 }).filter(r => r && r.length);
  const ingRows = XLSX.utils.sheet_to_json(wb.Sheets[sIng], { header: 1 }).filter(r => r && r.length);
  const etaRows = sEta ? XLSX.utils.sheet_to_json(wb.Sheets[sEta], { header: 1 }).filter(r => r && r.length) : [];

  const byTitre = new Map();
  // Recettes : ligne 0 = en-têtes, colonnes fixes du template.
  for (const r of recRows.slice(1)) {
    const titre = String(r[0] ?? '').trim();
    if (!titre) continue;
    byTitre.set(titre, {
      _tempId: tempId('rec'),
      nom: titre,
      categorie: normalizeCategorie(r[1]),
      portions: Number(r[2]) || 4,
      prixVente: Number(String(r[3] ?? '').replace(',', '.')) || 0,
      tempsPreparation: Number(r[4]) || 0,
      tempsCuisson: Number(r[5]) || 0,
      statut: 'brouillon',
      version: 1,
      allergenesIds: splitAllergenes(r[6]),
      notesConsultant: String(r[7] ?? '').trim(),
      ingredients: [],
      etapes: [],
      _etapesBuffer: [],
      _warnings: [],
    });
  }
  for (const r of ingRows.slice(1)) {
    const titre = String(r[0] ?? '').trim();
    const rec = byTitre.get(titre);
    if (!rec || !String(r[1] ?? '').trim()) continue;
    rec.ingredients.push(makeIngredient(r[1], r[2], r[3], r[4]));
    if (r[5]) rec.ingredients[rec.ingredients.length - 1].categorie = String(r[5]).trim();
  }
  for (const r of etaRows.slice(1)) {
    const titre = String(r[0] ?? '').trim();
    const rec = byTitre.get(titre);
    if (!rec || !String(r[2] ?? '').trim()) continue;
    rec._etapesBuffer.push({ ordre: Number(r[1]) || rec._etapesBuffer.length + 1, texte: String(r[2]).trim() });
  }
  return Array.from(byTitre.values()).map(rec => {
    rec.etapes = rec._etapesBuffer.sort((a, b) => a.ordre - b.ordre).map(e => e.texte);
    delete rec._etapesBuffer;
    const flagged = rec.ingredients.filter(i => i._import.warning).length;
    if (flagged > 0) rec._warnings.push(`${flagged} ligne(s) ingrédient à vérifier`);
    return rec;
  });
}

// Trouve la première ligne non vide (en-têtes) dans une feuille plate.
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const filled = (rows[i] || []).filter(c => c != null && String(c).trim() !== '').length;
    if (filled >= 2) return i;
  }
  return 0;
}

// Point d'entrée principal.
export function parseWorkbook(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: 'array' });
  if (!wb.SheetNames.length) throw new Error('Classeur vide.');

  // Format multi-feuilles ?
  const multi = parseMultiSheet(wb);
  if (multi && multi.length) return { format: 'multi-feuilles', recipes: multi };

  // Format plat : première feuille.
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (!rows.length) throw new Error('Aucune donnée dans la feuille.');

  const headerRowIndex = findHeaderRow(rows);
  const headerRow = rows[headerRowIndex] || [];
  const map = detectColumns(headerRow);

  if (map.titre == null) {
    // Impossible d'auto-détecter la colonne titre : assistant de mapping requis.
    return {
      format: 'plat',
      needsMapping: true,
      headers: headerRow.map((h, i) => ({ index: i, label: String(h ?? `Colonne ${i + 1}`) })),
      headerRowIndex,
      rows,
      detected: map,
    };
  }
  return { format: 'plat', recipes: buildFromMapping(rows, headerRowIndex, map) };
}
