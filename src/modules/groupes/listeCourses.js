import { toCanonical, mergeByName } from '../commande/computeBesoins.js';
import { labelAllergene, isAllergeneId } from '../../utils/allergenes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Liste de courses d'un groupe : les ingrédients de ce que le client a CHOISI,
// mis à l'échelle des portions de chaque plat. Déterministe, aucun appel IA.
//
// Entrée : les postes de production (choixMenu.postesProduction), un par plat
// retenu avec son nombre de portions : 30 écrevisses pour ceux qui les ont
// choisies, 6 pour la version végétarienne, 156 pièces d'apéritif. Un menu à
// choix n'est jamais compté en entier : seul ce qui est servi part en cuisine.
//
// Parcours : poste ▸ fiches (celles du plat de la carte, ou les fiches
// reliées directement à la ligne du menu) ▸ ingrédients. `plat_recettes` est
// une liste PLATE : toute la chaîne des préparations d'un plat y est
// rattachée (le jus, la garniture, la sauce), on ne descend donc dans aucune
// recette imbriquée.
//
// MISE À L'ÉCHELLE
// Une fiche dit « pour N portions ». Pour P portions à servir, chaque
// ingrédient est multiplié par  P ÷ N.  Une fiche sans nombre de portions
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

// Fiches techniques d'une ligne de menu ou d'un poste : celles qui lui sont
// reliées directement, sinon celles de son plat de la carte.
export function fichesDe(ligne, platById, recetteById) {
  const directes = (Array.isArray(ligne?.recetteIds) ? ligne.recetteIds : [])
    .map((id) => recetteById.get(id)).filter(Boolean);
  if (directes.length) return directes;
  const plat = ligne?.platId ? platById.get(ligne.platId) : null;
  return plat ? (plat.recettes || []).map((l) => recetteById.get(l.recetteId)).filter(Boolean) : [];
}

/**
 * @returns {{
 *   items: Array<{cle, produitId, nom, categorie, unite, besoin}>,
 *   groupes: Array<{categorie, items}>,
 *   nonChiffres: string[],   plats retenus sans fiche technique : à commander à la main
 *   aVerifier: string[],     fiches sans nombre de portions : non comptées
 * }}
 */
export function computeListeCourses({ postes = [], plats = [], recettes = [], catalogue = [] }) {
  const platById = new Map((plats || []).map((p) => [p.id, p]));
  const recetteById = new Map((recettes || []).map((r) => [r.id, r]));
  const produitById = new Map((catalogue || []).map((p) => [p.id, p]));

  const acc = new Map();
  const nonChiffres = [];
  const aVerifier = new Set();
  let ordre = 0;

  (Array.isArray(postes) ? postes : []).forEach((poste) => {
    if (!poste) return;
    const titre = String(poste.libelle || '').trim();
    const fiches = fichesDe(poste, platById, recetteById);
    const aServir = Math.max(0, Number(poste.portions) || 0);

    if (!fiches.length) {
      if (titre && !nonChiffres.includes(titre)) nonChiffres.push(titre);
      return;
    }

    fiches.forEach((recette) => {
      const portions = Number(recette.portions);
      if (!(portions > 0)) { aVerifier.add(recette.nom || titre); return; }
      const facteur = aServir / portions;

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

// Allergènes signalés par le groupe ET présents dans les fiches des plats
// servis. Simple croisement d'ids du référentiel partagé : il attire l'œil, il
// ne remplace ni la lecture des fiches ni l'échange avec le client. Un plat
// sans fiche n'a pas d'allergènes CONNUS, pas « aucun allergène » :
// `nonVerifies` les nomme, pour que l'écran ne se taise pas à leur sujet.
export function allergenesEnConflit({ postes = [], allergenesGroupe = [], plats = [], recettes = [] }) {
  const signales = new Set((allergenesGroupe || []).filter(isAllergeneId));
  const platById = new Map((plats || []).map((p) => [p.id, p]));
  const recetteById = new Map((recettes || []).map((r) => [r.id, r]));
  const conflits = new Map(); // allergeneId -> Set(libellés de plats)
  const nonVerifies = new Set();

  (Array.isArray(postes) ? postes : []).forEach((poste) => {
    const fiches = fichesDe(poste, platById, recetteById);
    const titre = String(poste?.libelle || '').trim();
    if (!fiches.length) { if (titre) nonVerifies.add(titre); return; }
    fiches.forEach((recette) => {
      (recette?.allergenesIds || []).forEach((aid) => {
        if (!signales.has(aid)) return;
        if (!conflits.has(aid)) conflits.set(aid, new Set());
        conflits.get(aid).add(titre);
      });
    });
  });

  return {
    conflits: [...conflits.entries()].map(([id, platsConcernes]) => ({
      id,
      label: labelAllergene(id),
      plats: [...platsConcernes].filter(Boolean),
    })),
    nonVerifies: [...nonVerifies],
  };
}
