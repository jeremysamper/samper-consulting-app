// ─────────────────────────────────────────────────────────────────────────────
// Liste « Mise en place de demain » (plan 15, lot 4), fonction pure :
// les lignes du modèle choisi, puis les plats vendus (Caisse native, ou Ventes
// POS sans vente à la Caisse ; moyenne du même jour de semaine), regroupés par fiche et ajustés par la prévision des
// couverts (prévus contre référence, borné de 0,5 à 2). Une fiche déjà dans le
// modèle prend la plus grande des deux quantités (le modèle dit le minimum).
// ─────────────────────────────────────────────────────────────────────────────

export function facteurPrevision(prevision) {
  const p = Number(prevision?.prevus);
  const r = Number(prevision?.reference);
  if (!(p > 0) || !(r > 0)) return 1;
  return Math.min(2, Math.max(0.5, Math.round((p / r) * 100) / 100));
}

export function listeDemain({ modele, ventes = [], prevision, jourSemaine = null }) {
  const facteur = facteurPrevision(prevision);
  const lignes = [];
  const parFiche = new Map();
  (Array.isArray(modele?.lignes) ? modele.lignes : []).forEach((l, i) => {
    const ligne = {
      cle: `modele-${i}`, label: l.label || 'Préparation', recetteId: l.recette_id || null,
      quantite: l.quantite ?? null, unite: l.unite || null, congelable: l.congelable ?? null, origine: 'modele',
    };
    lignes.push(ligne);
    if (ligne.recetteId) parFiche.set(ligne.recetteId, ligne);
  });
  const ventesParFiche = new Map();
  ventes.forEach((v) => {
    if (!v?.recipeId || !(Number(v.qty) > 0)) return;
    const prev = ventesParFiche.get(v.recipeId) || { label: v.recipeName, qty: 0 };
    prev.qty += Number(v.qty);
    ventesParFiche.set(v.recipeId, prev);
  });
  ventesParFiche.forEach((v, recetteId) => {
    const quantite = Math.ceil(v.qty * facteur);
    const dansModele = parFiche.get(recetteId);
    if (dansModele) {
      if (dansModele.quantite == null || quantite > Number(dansModele.quantite)) {
        Object.assign(dansModele, { quantite, unite: dansModele.unite || 'portions', origine: facteur !== 1 ? 'prevision' : 'ventes' });
      }
      return;
    }
    lignes.push({
      cle: `ventes-${recetteId}`, label: v.label && v.label !== '-' ? v.label : 'Préparation', recetteId,
      quantite, unite: 'portions', congelable: null, origine: facteur !== 1 ? 'prevision' : 'ventes',
    });
  });
  return { lignes, facteur, jourSemaine };
}
