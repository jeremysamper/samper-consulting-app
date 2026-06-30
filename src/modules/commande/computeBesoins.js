import { convertFactor } from '../consultant-tools/ConsultantTools.constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// computeBesoins — agrège les produits nécessaires à TOUTES les cartes d'un
// établissement, de façon déterministe (aucun appel IA).
//
// Parcours : cartes ▸ plats (liés à au moins une carte) ▸ recettes (dédupliquées)
// ▸ ingrédients. Les quantités sont converties vers une unité canonique (g / ml /
// sinon l'unité telle quelle) puis sommées par produit.
//
// Clé de regroupement : produit du catalogue si l'ingrédient y est lié
// (`produitId`), sinon nom normalisé. L'unité canonique est incluse dans la clé
// pour ne jamais additionner des familles incompatibles (g vs ml vs pcs).
// ─────────────────────────────────────────────────────────────────────────────

// Slug simple pour dédupliquer les ingrédients en texte libre. On ne cherche pas
// la pureté ASCII (les accents sont conservés) : seule la cohérence compte —
// un même nom doit produire la même clé.
const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-');

// Unité canonique + facteur de conversion depuis l'unité d'un ingrédient.
// Masse → g, volume → ml ; sinon on garde l'unité (pcs, cs, cc…) telle quelle.
function toCanonical(unite) {
  const u = unite || '';
  const toG = convertFactor(u, 'g');
  if (toG !== null) return { canonical: 'g', factor: toG };
  const toMl = convertFactor(u, 'ml');
  if (toMl !== null) return { canonical: 'ml', factor: toMl };
  return { canonical: u || 'pcs', factor: 1 };
}

export function computeBesoins({ cartes = [], plats = [], recettes = [], catalogue = [] }) {
  const produitById = new Map((catalogue || []).map(p => [p.id, p]));
  const recetteById = new Map((recettes || []).map(r => [r.id, r]));

  // Plats présents sur au moins une carte de l'établissement.
  const carteIdsSet = new Set((cartes || []).map(c => c.id));
  const platsSurCarte = (plats || []).filter(p =>
    (p.carteIds || []).some(id => carteIdsSet.has(id))
  );

  // Recettes uniques rattachées à ces plats.
  const recetteIds = new Set();
  platsSurCarte.forEach(p => (p.recettes || []).forEach(pr => recetteIds.add(pr.recetteId)));

  // Agrégation des ingrédients.
  const acc = new Map(); // key -> { cle, produitId, nom, categorie, unite, besoin, ordre }
  let ordre = 0;
  recetteIds.forEach(rid => {
    const recette = recetteById.get(rid);
    if (!recette) return;
    (recette.ingredients || []).forEach(ing => {
      const nomIng = String(ing.nom || '').trim();
      if (!nomIng && !ing.produitId) return;
      const produit = ing.produitId ? produitById.get(ing.produitId) : null;
      const { canonical, factor } = toCanonical(ing.unite);
      const baseCle = produit ? ('prod:' + produit.id)
        : (ing.produitId ? ('prod:' + ing.produitId) : ('nom:' + slug(nomIng)));
      const key = `${baseCle}|${canonical}`;
      const qty = (Number(ing.quantite) || 0) * factor;

      const prev = acc.get(key);
      if (prev) {
        prev.besoin += qty;
      } else {
        acc.set(key, {
          cle: key,
          produitId: produit ? produit.id : (ing.produitId || null),
          nom: produit ? produit.nom : nomIng,
          categorie: produit ? (produit.categorie || 'Autres') : (ing.categorie || 'Autres'),
          unite: canonical,
          besoin: qty,
          ordre: ordre++,
        });
      }
    });
  });

  // Dédup finale par nom + unité : collapse les entrées qui désignent le même
  // produit écrit de deux façons (lié au catalogue d'un côté, texte libre de
  // l'autre). Mêmes nom et unité ⇒ même produit pour la commande.
  return mergeByName([...acc.values()]).map(it => ({
    ...it,
    besoin: Math.round(it.besoin * 1000) / 1000,
  }));
}

// Fusionne les lignes de même nom normalisé et même unité ; somme les besoins,
// conserve le produitId et la catégorie la plus précise rencontrés.
export function mergeByName(list) {
  const map = new Map();
  for (const it of list) {
    const key = `${slug(it.nom)}|${it.unite || ''}`;
    const prev = map.get(key);
    if (prev) {
      prev.besoin += it.besoin;
      if (!prev.produitId && it.produitId) prev.produitId = it.produitId;
      if ((!prev.categorie || prev.categorie === 'Autres') && it.categorie && it.categorie !== 'Autres') prev.categorie = it.categorie;
    } else {
      map.set(key, { ...it });
    }
  }
  return [...map.values()];
}

// Applique les regroupements de doublons proposés par l'IA : renomme chaque
// variante par son nom canonique, puis refusionne par nom + unité. L'IA ne
// touche qu'aux NOMS ; la fusion (et donc les quantités) reste déterministe,
// et les unités incompatibles ne sont jamais additionnées. En l'absence de
// groupe, la liste est renvoyée inchangée.
export function applyDedupeGroups(items = [], groupes = []) {
  if (!Array.isArray(groupes) || !groupes.length) return items;
  const alias = new Map(); // slug(variante) -> canonique
  for (const g of groupes) {
    const canon = String((g && g.canonique) || '').trim();
    if (!canon) continue;
    for (const v of (g && g.variantes) || []) {
      const sv = slug(v);
      if (sv) alias.set(sv, canon);
    }
  }
  if (!alias.size) return items;
  const remapped = items.map(it => {
    const canon = alias.get(slug(it.nom));
    return canon ? { ...it, nom: canon } : it;
  });
  return mergeByName(remapped).map(it => ({
    ...it,
    besoin: Math.round(it.besoin * 1000) / 1000,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonds de cuisine ajoutés systématiquement à chaque génération : les matières
// premières sèches « classiques » et une section d'hygiène / consommables à
// part. Pas de besoin chiffré (case à cocher selon le stock), juste un rappel
// pour ne rien oublier à la commande.
// ─────────────────────────────────────────────────────────────────────────────
export const STAPLES_SECS = [
  'Sel fin', 'Gros sel', 'Poivre noir', 'Poivre blanc', 'Sucre', 'Sucre glace',
  'Cassonade', 'Farine', 'Fécule de maïs', 'Levure chimique', 'Bicarbonate',
  "Huile d'olive", 'Huile de tournesol', 'Vinaigre', 'Moutarde', 'Miel',
  'Riz', 'Pâtes', 'Fond / bouillon', 'Concentré de tomate',
].map(nom => ({ nom, categorie: 'Épicerie sèche', unite: '' }));

export const STAPLES_HYGIENE = [
  'Éponges', 'Tampons à récurer', "Paille de fer (laine d'acier)", 'Liquide vaisselle',
  'Dégraissant', 'Désinfectant surfaces', 'Nettoyant multi-usage', 'Détartrant',
  'Film alimentaire', 'Papier cuisson', 'Papier aluminium', 'Poches sous vide',
  'Gants jetables', 'Essuie-tout', 'Sacs poubelle',
].map(nom => ({ nom, categorie: 'Hygiène & consommables', unite: '' }));

// Ajoute les fonds de cuisine à une liste de besoins, en sautant ceux dont le
// nom est déjà présent (issu des recettes ou ajouté à la main) pour ne jamais
// créer de doublon. `extraPresentNames` = noms déjà dans la liste de commande.
export function appendStaples(items = [], extraPresentNames = []) {
  const present = new Set([
    ...items.map(it => slug(it.nom)),
    ...extraPresentNames.map(n => slug(n)),
  ]);
  let ordre = 10000;
  const extra = [];
  for (const st of [...STAPLES_SECS, ...STAPLES_HYGIENE]) {
    const sg = slug(st.nom);
    if (present.has(sg)) continue;
    present.add(sg);
    extra.push({
      cle: 'staple:' + sg,
      produitId: null,
      nom: st.nom,
      categorie: st.categorie,
      unite: st.unite || '',
      besoin: 0,
      ordre: ordre++,
    });
  }
  return [...items, ...extra];
}

// Formatage lisible d'un besoin (g≥1000 → kg, ml≥1000 → L). Indicatif.
export function formatBesoin(besoin, unite) {
  const n = Number(besoin) || 0;
  if (n <= 0) return '';
  const round = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
  if (unite === 'g' && n >= 1000) return `≈ ${round(n / 1000)} kg`;
  if (unite === 'ml' && n >= 1000) return `≈ ${round(n / 1000)} L`;
  return `≈ ${round(n)}${unite ? ' ' + unite : ''}`;
}

export default computeBesoins;
