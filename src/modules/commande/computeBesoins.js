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

  return [...acc.values()].map(it => ({
    ...it,
    besoin: Math.round(it.besoin * 1000) / 1000,
  }));
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
