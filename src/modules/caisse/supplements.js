import { normalizeSearch } from '../../utils/searchText.js';

// ─────────────────────────────────────────────────────────────────────────────
// Suppléments proposés dans la fiche d'une ligne (caisse_reglages.config.supplements).
//
// Un supplément est un plat de la carte (son prix est celui que la base impose
// à toute ligne qui porte un plat_id). Réglage, par maison :
//   { plat_id, choix: 'Alcools', pour: ['Glaces'] }
//   - pour   : les catégories de caisse dont chaque produit propose le supplément ;
//   - choix  : la catégorie de caisse dont les produits forment la liste. Elle est
//              lue en direct : un alcool rangé dans « Alcools » apparaît dans la
//              liste, un alcool retiré en sort, sans autre réglage.
// La ligne ajoutée porte le plat du supplément ; son libellé dit le choix.
// ─────────────────────────────────────────────────────────────────────────────

const cle = (s) => normalizeSearch(s).trim();
const MAX_SUPPLEMENTS = 8;

// Réglage brut -> liste propre (plat_id et choix non vides, pour non vide).
export function lireSupplements(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => ({
      plat_id: String(s?.plat_id ?? '').trim().slice(0, 80),
      choix: String(s?.choix ?? '').trim().slice(0, 40),
      pour: Array.isArray(s?.pour)
        ? [...new Set(s.pour.map((p) => String(p ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 12)
        : [],
    }))
    .filter((s) => s.plat_id && s.choix && s.pour.length)
    .slice(0, MAX_SUPPLEMENTS);
}

// Les suppléments d'une ligne. `rangement` vient de rangerArticles sur TOUS les
// articles en vente (pas seulement la carte affichée), `articles` aussi.
// Rend [{ platId, nom, prix, source, choix: [noms] }] ; rien pour une ligne
// libre, pour le supplément lui-même, ou quand le plat du supplément n'est
// sur aucune carte en vente.
export function supplementsPourLigne({ ligne, supplements, rangement, articles }) {
  if (!ligne?.plat_id || !rangement?.parArticle) return [];
  const categorie = rangement.parArticle.get(ligne.plat_id);
  if (!categorie) return [];
  return (supplements || [])
    .filter((s) => s.plat_id !== ligne.plat_id && s.pour.some((p) => cle(p) === cle(categorie.nom)))
    .map((s) => {
      const plat = (articles || []).find((a) => a.id === s.plat_id);
      if (!plat) return null;
      const source = (rangement.categories || []).find((c) => cle(c.nom) === cle(s.choix));
      const choix = [...new Set((source?.articles || []).filter((a) => a.id !== s.plat_id).map((a) => a.nom))];
      return { platId: plat.id, nom: plat.nom, prix: Number(plat.prixVente ?? 0), source: s.choix, choix };
    })
    .filter(Boolean);
}

export function libelleSupplement(nom, choix) {
  return choix ? `${nom} (${choix})` : nom;
}
