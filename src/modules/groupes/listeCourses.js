import { toCanonical, mergeByName } from '../commande/computeBesoins.js';
import { labelAllergene, isAllergeneId } from '../../utils/allergenes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Liste de courses d'un groupe : les ingrédients du menu, mis à l'échelle du
// nombre de couverts. Déterministe, aucun appel IA.
//
// Parcours : lignes du menu ▸ plat ▸ recettes rattachées au plat ▸ ingrédients.
// `plat_recettes` est une liste PLATE : toute la chaîne des préparations d'un
// plat y est rattachée (le jus, la garniture, la sauce), on ne descend donc
// dans aucune recette imbriquée.
//
// MISE À L'ÉCHELLE
// Une fiche dit « pour N portions ». Pour `pax` couverts servis `parPersonne`
// fois (3 pièces par personne sur un apéro dînatoire), chaque ingrédient est
// multiplié par  pax × parPersonne ÷ N.  Une fiche sans nombre de portions
// exploitable n'est PAS extrapolée : inventer un facteur produirait une
// commande fausse qui a l'air juste. Elle est remontée dans `aVerifier`.
//
// Mêmes règles d'agrégation que la liste de commande (computeBesoins) : unité
// canonique g / ml, clé produit catalogue sinon nom normalisé, jamais de somme
// entre familles d'unités incompatibles.
//
// Util pur (ni React ni DOM).
// ─────────────────────────────────────────────────────────────────────────────

const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-');

function catSort(a, b) {
  if (a === 'Autres') return 1;
  if (b === 'Autres') return -1;
  return a.localeCompare(b, 'fr');
}

/**
 * @returns {{
 *   items: Array<{cle, produitId, nom, categorie, unite, besoin}>,
 *   groupes: Array<{categorie, items}>,
 *   nonChiffres: string[],   lignes du menu sans plat ni fiche : à commander à la main
 *   aVerifier: string[],     fiches sans nombre de portions : non comptées
 * }}
 */
export function computeListeCourses({ lignes = [], pax = 0, plats = [], recettes = [], catalogue = [] }) {
  const platById = new Map((plats || []).map((p) => [p.id, p]));
  const recetteById = new Map((recettes || []).map((r) => [r.id, r]));
  const produitById = new Map((catalogue || []).map((p) => [p.id, p]));
  const couverts = Math.max(0, Number(pax) || 0);

  const acc = new Map();
  const nonChiffres = [];
  const aVerifier = new Set();
  let ordre = 0;

  (Array.isArray(lignes) ? lignes : []).forEach((ligne) => {
    if (!ligne) return;
    const titre = String(ligne.libelle || '').trim();
    const plat = ligne.platId ? platById.get(ligne.platId) : null;
    const liens = plat ? (plat.recettes || []) : [];
    const fiches = liens.map((l) => recetteById.get(l.recetteId)).filter(Boolean);

    if (!fiches.length) {
      if (titre || plat) nonChiffres.push(titre || plat.nom);
      return;
    }

    const parPersonne = Number(ligne.parPersonne) > 0 ? Number(ligne.parPersonne) : 1;

    fiches.forEach((recette) => {
      const portions = Number(recette.portions);
      if (!(portions > 0)) { aVerifier.add(recette.nom || titre); return; }
      const facteur = (couverts * parPersonne) / portions;

      (recette.ingredients || []).forEach((ing) => {
        const nomIng = String(ing.nom || '').trim();
        if (!nomIng && !ing.produitId) return;
        const produit = ing.produitId ? produitById.get(ing.produitId) : null;
        const { canonical, factor } = toCanonical(ing.unite);
        const baseCle = produit ? ('prod:' + produit.id)
          : (ing.produitId ? ('prod:' + ing.produitId) : ('nom:' + slug(nomIng)));
        const key = `${baseCle}|${canonical}`;
        const qty = (Number(ing.quantite) || 0) * factor * facteur;

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
  });

  const items = mergeByName([...acc.values()]).map((it) => ({
    ...it,
    besoin: Math.round(it.besoin * 1000) / 1000,
  }));

  const parCategorie = new Map();
  items.forEach((it) => {
    const c = it.categorie || 'Autres';
    if (!parCategorie.has(c)) parCategorie.set(c, []);
    parCategorie.get(c).push(it);
  });
  const groupes = [...parCategorie.keys()].sort(catSort).map((categorie) => ({
    categorie,
    items: parCategorie.get(categorie).slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')),
  }));

  return { items, groupes, nonChiffres, aVerifier: [...aVerifier] };
}

// Quantité à l'achat. Une commande de groupe s'arrondit au-dessus : 3,42 kg de
// filet ne se commandent pas, 3,5 kg oui - et il vaut mieux 80 g de trop que
// trois assiettes de moins. Toujours au-dessus, jamais en dessous du besoin.
//
// Le pas d'arrondi suit la grandeur : 10 g sur 3 kg ne pèsent rien, mais sur
// 2,4 g d'agar-agar ou 1 g de safran un pas fixe de 10 g multipliait la
// commande par quatre à dix. Sous 10 on arrondit à l'unité, sous 100 à 5.
//
// L'unité se choisit APRÈS l'arrondi : 999 g arrondis donnent « 1 kg », pas
// « 1000 g » à côté d'un « 1 kg » sur la même liste.
const pasPour = (x) => (x < 10 ? 1 : x < 100 ? 5 : 10);

export function formatQuantiteCourses(besoin, unite) {
  const n = Number(besoin) || 0;
  if (n <= 0) return '';
  const fr = (x) => String(x).replace('.', ',');
  const auDessus = (x, pas) => Math.ceil(x / pas - 1e-9) * pas;
  if (unite === 'g' || unite === 'ml') {
    const gros = unite === 'g' ? 'kg' : 'L';
    const arrondi = auDessus(n, pasPour(n));
    if (arrondi >= 1000) return `${fr(Math.round(auDessus(n / 1000, 0.1) * 10) / 10)} ${gros}`;
    return `${fr(arrondi)} ${unite}`;
  }
  // Pièces, bottes, cuillères : une demi-unité ne s'achète pas.
  const entier = Math.ceil(n - 1e-9);
  return `${fr(entier)}${unite ? ' ' + unite : ''}`;
}

// Charge utile du PDF « liste de courses », au format attendu par
// pdfUtils.exportCommandePdf (même mise en page que la liste de commande).
export function payloadCoursesPdf({ liste, titre, sousTitre }) {
  const total = liste.items.length;
  return {
    titre: titre || 'Liste de courses',
    sousTitre: sousTitre || '',
    totalCount: total,
    cocheCount: 0,
    sansCompteurCoche: true,
    groups: liste.groupes.map((g) => ({
      categorie: g.categorie,
      items: g.items.map((it) => ({
        nom: it.nom,
        qtyText: formatQuantiteCourses(it.besoin, it.unite),
        coche: false,
      })),
    })),
  };
}

// Allergènes signalés par le groupe ET présents dans les fiches du menu.
// Simple croisement d'ids du référentiel partagé : il attire l'œil, il ne
// remplace ni la lecture des fiches ni l'échange avec le client.
export function allergenesEnConflit({ lignes = [], allergenesGroupe = [], plats = [], recettes = [] }) {
  const signales = new Set((allergenesGroupe || []).filter(isAllergeneId));
  if (!signales.size) return [];
  const platById = new Map((plats || []).map((p) => [p.id, p]));
  const recetteById = new Map((recettes || []).map((r) => [r.id, r]));
  const conflits = new Map(); // allergeneId -> Set(libellés de plats)

  (Array.isArray(lignes) ? lignes : []).forEach((ligne) => {
    const plat = ligne?.platId ? platById.get(ligne.platId) : null;
    if (!plat) return;
    (plat.recettes || []).forEach((lien) => {
      const recette = recetteById.get(lien.recetteId);
      (recette?.allergenesIds || []).forEach((aid) => {
        if (!signales.has(aid)) return;
        if (!conflits.has(aid)) conflits.set(aid, new Set());
        conflits.get(aid).add(String(ligne.libelle || plat.nom || '').trim());
      });
    });
  });

  return [...conflits.entries()].map(([id, platsConcernes]) => ({
    id,
    label: labelAllergene(id),
    plats: [...platsConcernes].filter(Boolean),
  }));
}
