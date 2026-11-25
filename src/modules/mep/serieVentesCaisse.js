// Ventes de la Caisse native pour la « Mise en place de demain », fonctions
// pures (sans React ni client Supabase).
//
// ventesCaisseParFiche : les lignes de caisse lues ({ jour, platId, qty }) sont
// additionnées par plat et par jour, puis chaque plat passe par la règle de
// moyenne partagée (moyenneJourSemaine). Chaque fiche du plat reçoit la
// quantité du plat (liste plate de plat_recettes), dans la forme que
// listeDemain reçoit déjà de Ventes POS. dowDemain va de 0 (dimanche) à 6.
//
// choisirSource : la Caisse dès que sa lecture réussit avec au moins une ligne
// comptée, sinon Ventes POS. Jamais l'addition des deux. Un échec n'est jamais
// pris pour une absence de vente.

import { moyenneJourSemaine } from './moyenneVentes.js';

export function dowDeJour(jour) {
  const [a, m, j] = String(jour).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay();
}

export function ventesCaisseParFiche({ lignes = [], plats = [], recettes = [], dowDemain }) {
  const platParId = new Map((plats || []).map((p) => [String(p.id), p]));
  const nomFiche = new Map((recettes || []).map((r) => [String(r.id), r.nom]));
  const parPlat = new Map(); // platId -> Map(jour -> qty)
  const joursComparables = new Set();
  let total = 0;
  (lignes || []).forEach((l) => {
    if (!l || l.platId == null || !l.jour) return;
    const plat = platParId.get(String(l.platId));
    const qty = Number(l.qty);
    if (!plat || !(qty > 0)) return;
    total += 1;
    const parJour = parPlat.get(String(plat.id)) || new Map();
    parJour.set(l.jour, (parJour.get(l.jour) || 0) + qty);
    parPlat.set(String(plat.id), parJour);
    if (dowDeJour(l.jour) === dowDemain) joursComparables.add(l.jour);
  });
  const items = [];
  const sansFiche = [];
  parPlat.forEach((parJour, platId) => {
    const plat = platParId.get(platId);
    const fiches = [...new Set((plat.recetteIds || []).filter(Boolean).map(String))];
    if (!fiches.length) {
      let qty = 0;
      parJour.forEach((q) => { qty += q; });
      sansFiche.push({ platId: plat.id, nom: plat.nom || '', qty });
      return;
    }
    const ventes = [...parJour.entries()].map(([jour, qty]) => ({ dow: dowDeJour(jour), qty }));
    const { qty, reliable, occurrences } = moyenneJourSemaine(ventes, dowDemain);
    fiches.forEach((recipeId) => {
      items.push({
        recipeId,
        recipeName: nomFiche.has(recipeId) ? nomFiche.get(recipeId) : '-',
        name: plat.nom || '',
        qty,
        reliable,
        occurrences,
      });
    });
  });
  items.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'fr'));
  sansFiche.sort((a, b) => b.qty - a.qty || a.nom.localeCompare(b.nom, 'fr'));
  return { items, sansFiche, joursComparables: joursComparables.size, total };
}

// caisse : { loading, error, items, sansFiche, joursComparables, total }
// pos : le retour de useMiseEnPlace ({ loading, error, items, unmappedCount })
export function choisirSource({ caisse = {}, pos = {} }) {
  const vide = { source: null, items: [], sansFiche: [], joursComparables: 0, nonRelies: 0 };
  if (caisse.loading) return { ...vide, loading: true, error: null };
  if (caisse.error) return { ...vide, loading: false, error: caisse.error };
  if (Number(caisse.total) > 0) {
    const sansFiche = caisse.sansFiche || [];
    return {
      source: 'caisse',
      items: caisse.items || [],
      sansFiche,
      joursComparables: caisse.joursComparables || 0,
      nonRelies: sansFiche.length,
      loading: false,
      error: null,
    };
  }
  if (pos.loading) return { ...vide, loading: true, error: null };
  if (pos.error) return { ...vide, loading: false, error: pos.error };
  const items = pos.items || [];
  if (!items.length) return { ...vide, loading: false, error: null };
  return { ...vide, source: 'pos', items, nonRelies: Number(pos.unmappedCount) || 0, loading: false, error: null };
}
