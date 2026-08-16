import { useMemo } from 'react';
import { supabase } from '../services/supabase.js';

const TABLE_PLAN   = 'salle_tables';
const TABLE_LIENS  = 'reservation_tables';
const TABLE_SALLES = 'salles';

// Canevas virtuel du plan. Toutes les coordonnées stockées sont exprimées
// dedans, jamais en pixels : le plan doit tomber juste sur l'iPad de l'entrée
// comme sur l'écran du bureau. Le composant met ce canevas à l'échelle de la
// largeur disponible, le ratio ne bouge pas.
export const PLAN_W = 1000;
export const PLAN_H = 700;

// Pas de la grille d'aimantation, en unités canevas. Sans elle, un plan
// dessiné au doigt part de travers : deux tables côte à côte ne sont jamais
// alignées à l'unité près.
export const PLAN_GRID = 10;

const MESSAGES = {
  '23505': 'Doublon : cette table est déjà attribuée, ou une salle porte déjà ce nom.',
  '23503': 'Réservation ou table introuvable.',
  '23514': 'Valeur hors limites (nom vide, places ou position invalides).',
  '42501': "Tu n'as pas les droits pour modifier le plan de salle.",
};

function mapError(error) {
  if (!error) return null;
  console.error('[usePlanSalle] erreur Supabase', error);
  return MESSAGES[String(error.code || '')]
    || 'Erreur technique. Réessaie ou contacte le support.';
}

// Gabarits par forme : une table de 8 est plus grande qu'un deux-couverts, et
// une rectangulaire est plus large que profonde. Le plan reste lisible sans
// demander à personne de redimensionner quoi que ce soit à la main.
export function tailleParDefaut(forme, nbPlaces) {
  const p = Math.max(1, Number(nbPlaces) || 2);
  if (forme === 'rectangle') {
    // ~55 unités de long par paire de couverts, borné pour rester dans le plan
    const largeur = Math.min(340, 110 + Math.ceil(p / 2) * 55);
    return { largeur, hauteur: 90 };
  }
  if (forme === 'carree') {
    const cote = Math.min(200, 80 + p * 8);
    return { largeur: cote, hauteur: cote };
  }
  // ronde
  const d = Math.min(200, 76 + p * 9);
  return { largeur: d, hauteur: d };
}

/**
 * Plan de salle : les tables (le mobilier) et leur placement (qui est assis
 * où pour un service donné).
 *
 * Comme useReservations, le retour est mémoïsé : les références des fonctions
 * restent stables tant que etablissementId ne change pas.
 *
 * Toutes les lectures renvoient { data, error } et JAMAIS un tableau vide en
 * cas d'échec : un plan vide et un plan qu'on n'a pas réussi à lire ne se
 * ressemblent pas du tout à l'écran, et confondre les deux afficherait
 * « aucune table » à une brigade dont le plan est simplement hors de portée.
 */
export function usePlanSalle(etablissementId) {
  return useMemo(() => {
    // ── Les salles ────────────────────────────────────────────────────
    async function listSalles() {
      const { data, error } = await supabase
        .from(TABLE_SALLES)
        .select('*')
        .eq('etablissement_id', etablissementId);
      if (error) return { data: null, error: mapError(error) };
      // Tri client : `ordre` d'abord, nom en départage. Trier dans .order()
      // rendrait l'ordre dépendant du serveur alors que la maison le choisit.
      const rows = [...(data || [])].sort((a, b) =>
        (a.ordre ?? 0) - (b.ordre ?? 0)
        || String(a.nom).localeCompare(String(b.nom), undefined, { numeric: true }));
      return { data: rows, error: null };
    }

    async function createSalle(nom, ordre = 0) {
      const { data, error } = await supabase
        .from(TABLE_SALLES)
        .insert({ etablissement_id: etablissementId, nom: String(nom).trim(), ordre })
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    async function updateSalle(id, partial) {
      const { data, error } = await supabase
        .from(TABLE_SALLES)
        .update({ ...partial, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    // Supprimer une salle emporte ses tables (ON DELETE CASCADE), donc leur
    // placement. C'est pour ça que l'appelant confirme en annonçant le nombre
    // de tables perdues.
    async function deleteSalle(id) {
      const { error } = await supabase.from(TABLE_SALLES).delete().eq('id', id);
      if (error) return { error: mapError(error) };
      return { error: null };
    }

    // ── Le plan (mobilier) ────────────────────────────────────────────
    async function listTables() {
      const { data, error } = await supabase
        .from(TABLE_PLAN)
        .select('*')
        .eq('etablissement_id', etablissementId)
        .order('nom');
      if (error) return { data: null, error: mapError(error) };
      return { data: data || [], error: null };
    }

    async function createTable(partial) {
      const forme  = partial.forme || 'ronde';
      const places = partial.nb_places ?? 2;
      const taille = tailleParDefaut(forme, places);
      const { data, error } = await supabase
        .from(TABLE_PLAN)
        .insert({
          etablissement_id: etablissementId,
          salle_id:  partial.salle_id ?? null,
          nom:       String(partial.nom ?? '').trim(),
          nb_places: places,
          forme,
          pos_x:     partial.pos_x ?? 40,
          pos_y:     partial.pos_y ?? 40,
          largeur:   partial.largeur ?? taille.largeur,
          hauteur:   partial.hauteur ?? taille.hauteur,
          actif:     partial.actif ?? true,
        })
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    async function updateTable(id, partial) {
      const { data, error } = await supabase
        .from(TABLE_PLAN)
        .update({ ...partial, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    // Suppression franche : une table retirée du plan emporte ses liaisons
    // (ON DELETE CASCADE). Pour retirer une table d'un service sans perdre
    // le meuble, passer par actif = false.
    async function deleteTable(id) {
      const { error } = await supabase.from(TABLE_PLAN).delete().eq('id', id);
      if (error) return { error: mapError(error) };
      return { error: null };
    }

    // ── Le placement (liaisons résa ↔ table) ──────────────────────────
    // Chargé par lot pour toute une journée : une requête par service serait
    // trois allers-retours pour la même information.
    async function listLiensPourResas(reservationIds) {
      const ids = (reservationIds || []).filter(Boolean);
      if (ids.length === 0) return { data: [], error: null };
      const { data, error } = await supabase
        .from(TABLE_LIENS)
        .select('*')
        .in('reservation_id', ids);
      if (error) return { data: null, error: mapError(error) };
      return { data: data || [], error: null };
    }

    async function assigner(reservationId, tableId) {
      const { data, error } = await supabase
        .from(TABLE_LIENS)
        .insert({ reservation_id: reservationId, table_id: tableId })
        .select()
        .single();
      // 23505 = la liaison existe déjà. Reposer une résa sur la table qu'elle
      // occupe déjà n'est pas une erreur pour l'utilisateur : c'est un
      // glisser-déposer qui n'a rien changé.
      if (error && String(error.code) === '23505') {
        return { data: null, error: null, dejaPlace: true };
      }
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    async function retirer(lienId) {
      const { error } = await supabase.from(TABLE_LIENS).delete().eq('id', lienId);
      if (error) return { error: mapError(error) };
      return { error: null };
    }

    // Vider le placement d'une réservation (bouton « retirer du plan »).
    async function retirerToutesPourResa(reservationId) {
      const { error } = await supabase
        .from(TABLE_LIENS)
        .delete()
        .eq('reservation_id', reservationId);
      if (error) return { error: mapError(error) };
      return { error: null };
    }

    return {
      listSalles, createSalle, updateSalle, deleteSalle,
      listTables, createTable, updateTable, deleteTable,
      listLiensPourResas, assigner, retirer, retirerToutesPourResa,
    };
  }, [etablissementId]);
}
