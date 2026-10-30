// ─────────────────────────────────────────────────────────────
// Rangement des fiches en vitrine (Cartes & Recettes, Fiches salle).
//
// Util pur (ni React ni DOM), testé par rangementFiches.test.mjs :
// quelle fiche s'ouvre depuis un plat, dans quels plats sert une
// fiche, quelle photo montrer, quels plats restent à compléter.
// Rien n'est écrit : tout se déduit des lectures déjà faites
// (recettes, plats + plat_recettes + carte_plats, fiches_salle).
// ─────────────────────────────────────────────────────────────
import { normalizeSearch } from '../../utils/searchText.js';
import { grouperParCategorie } from '../../utils/categoriesPlat.js';

// Catégories de préparations techniques : sauces, fonds, bases, garnitures,
// préparations. Ce ne sont pas des plats servis au client : elles ne donnent
// pas de fiche salle et ne prennent jamais la photo d'un plat (une photo de
// féra sur la fiche du beurre blanc tromperait). Liste reprise des Fiches
// salle, comparée sans accents.
const CATEGORIES_TECHNIQUES = ['sauce', 'sauces', 'fond', 'fonds', 'garniture', 'garnitures', 'base', 'bases', 'preparation', 'preparations'];

export const estCategorieTechnique = (categorie) => {
  const c = normalizeSearch(categorie).trim();
  if (!c) return false; // sans catégorie : traitée comme un plat servi
  return CATEGORIES_TECHNIQUES.some((x) => c === x || c.startsWith(x + ' '));
};

// Ordre de composition d'un plat : l'ordre saisi, puis la recette
// principale avant les composants, puis l'ordre d'arrivée.
const rangRole = (role) => (role === 'principal' ? 0 : 1);

const indexParId = (recettes) => (recettes instanceof Map ? recettes : new Map((recettes || []).map((r) => [r.id, r])));

// Fiches ouvrables d'un plat : ses recettes visibles (ni archivées ni
// cachées, c'est la liste passée), dans l'ordre de composition. La première
// est celle que la vignette du plat ouvre.
export function recettesOuvrablesDuPlat(plat, recettesVisibles) {
  const parId = indexParId(recettesVisibles);
  const vues = new Set();
  return (plat?.recettes || [])
    .map((pr, i) => ({ pr, i }))
    .sort((a, b) => (a.pr.ordre || 0) - (b.pr.ordre || 0) || rangRole(a.pr.role) - rangRole(b.pr.role) || a.i - b.i)
    .map(({ pr }) => parId.get(pr.recetteId))
    .filter((r) => {
      if (!r || vues.has(r.id)) return false;
      vues.add(r.id);
      return true;
    });
}

// Plats actifs qui contiennent une recette, dans l'ordre reçu (ordre des
// plats, puis nom, comme listPlats les rend).
export function platsDeRecette(recetteId, plats) {
  return (plats || []).filter((p) => p && p.actif !== false && (p.recettes || []).some((pr) => pr.recetteId === recetteId));
}

// Photo d'une fiche recette : la sienne ; sinon, pour une recette servie, la
// photo du plat dont elle est la première fiche ouvrable ; sinon aucune (le
// visuel de remplacement prend le relais).
export function photoDeRecette(recette, plats, recettesVisibles) {
  if (!recette) return null;
  if (recette.photoUrl) return recette.photoUrl;
  if (estCategorieTechnique(recette.categorie)) return null;
  const parId = indexParId(recettesVisibles);
  for (const p of plats || []) {
    if (!p || p.actif === false || !p.photoUrl) continue;
    const premiere = recettesOuvrablesDuPlat(p, parId)[0];
    if (premiere && premiere.id === recette.id) return p.photoUrl;
  }
  return null;
}

// Nom comparé sans accents ni casse, ligatures repliées (« Bœuf » = « boeuf »),
// espaces réduits.
const nomCompare = (s) => normalizeSearch(s).replace(/\s+/g, ' ').trim();

// Photo d'une fiche salle : la table n'a pas de colonne photo. La fiche porte
// le nom exact de son plat (la génération la crée ainsi) : photo du plat
// actif de même nom, sinon de la recette de même nom (ni archivée ni cachée).
export function photoDeFicheSalle(fiche, plats, recettes) {
  const cle = nomCompare(fiche?.nom);
  if (!cle) return null;
  const plat = (plats || []).find((p) => p && p.actif !== false && p.photoUrl && nomCompare(p.nom) === cle);
  if (plat) return plat.photoUrl;
  const recette = (recettes || []).find((r) => r && r.statut !== 'archivée' && r.masquee !== true && r.photoUrl && nomCompare(r.nom) === cle);
  return recette ? recette.photoUrl : null;
}

// a commence par b, au mot près (« tarte aux pruneaux maison » commence par
// « tarte aux pruneaux », « tartelette » ne commence pas par « tarte »).
const commencePar = (a, b) => a.startsWith(b) && (a.length === b.length || /[^a-z0-9]/.test(a[b.length]));

// Plats à écrire sous une fiche (« Plat : … ») : on tait celui qui porte le
// nom de la fiche ou qui le prolonge, la ligne ne ferait que répéter le
// titre. Restent ceux qui apprennent quelque chose : le beurre blanc sert
// dans « Filet de féra, beurre blanc ».
export function platsAEcrire(recette, plats) {
  const nom = nomCompare(recette?.nom);
  if (!nom) return plats || [];
  return (plats || []).filter((p) => {
    const n = nomCompare(p?.nom);
    return !n || !(commencePar(n, nom) || commencePar(nom, n));
  });
}

// Section unique des préparations techniques dans « Je cherche une fiche » :
// une section par catégorie technique alignait un titre par fiche (« Bases »,
// « Fonds », « Sauces », une fiche chacune). Chaque vignette garde sa
// catégorie écrite sur elle.
export const SECTION_PREPARATIONS = 'Préparations de base';

// Sections de « Je cherche une fiche » : les fiches servies par catégorie,
// dans l'ordre de service, puis les préparations de base en dernier.
export function sectionsDeFiches(fiches) {
  const servies = [];
  const techniques = [];
  (fiches || []).forEach((r) => (estCategorieTechnique(r?.categorie) ? techniques : servies).push(r));
  const sections = grouperParCategorie(servies);
  if (techniques.length) sections.push([SECTION_PREPARATIONS, techniques]);
  return sections;
}

// Plats actifs à compléter : sans fiche visible (raison « sansFiche »), ou
// avec fiche mais sur aucune carte (raison « horsCarte »).
export function platsACompleter(plats, recettesVisibles) {
  const parId = indexParId(recettesVisibles);
  return (plats || [])
    .filter((p) => p && p.actif !== false)
    .map((plat) => {
      if (recettesOuvrablesDuPlat(plat, parId).length === 0) return { plat, raison: 'sansFiche' };
      if ((plat.carteIds || []).length === 0) return { plat, raison: 'horsCarte' };
      return null;
    })
    .filter(Boolean);
}
