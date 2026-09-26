import { useMemo } from 'react';
import { supabase } from '../services/supabase.js';
import { normalizeSearch } from '../utils/searchText.js';

const TABLE = 'reservations';

const SUPABASE_ERROR_MESSAGES = {
  '23505': 'Cette réservation existe déjà.',
  '23503': 'Établissement introuvable.',
  '42501': "Tu n'as pas les droits pour cette action.",
};

function mapError(error) {
  if (!error) return null;
  console.error('[useReservations] erreur Supabase', error);
  return SUPABASE_ERROR_MESSAGES[String(error.code || '')]
    || 'Erreur technique. Réessaie ou contacte le support.';
}

/**
 * CRUD réservations.
 * Retour mémoïsé (useMemo) : les références des fonctions sont stables
 * tant que etablissementId ne change pas → pas de re-renders parasites
 * dans les composants qui dépendent de cet objet.
 */
export function useReservations(etablissementId) {
  return useMemo(() => {
    async function create(reservation) {
      console.log('[useReservations] create', { etablissementId, reservation });
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...reservation, etablissement_id: etablissementId })
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    async function update(id, partial) {
      console.log('[useReservations] update', { id, partial });
      const { data, error } = await supabase
        .from(TABLE)
        .update({ ...partial, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    // Soft delete via statut='annule' - déclenche le trigger qui
    // recalcule previsions_jour en excluant cette réservation
    async function deleteReservation(id) {
      return update(id, { statut: 'annule' });
    }

    // Suivi du service : attendu → arrivé → parti, ou no-show.
    // Le trigger previsions_jour exclut 'annule' et 'no_show' des couverts :
    // marquer un no-show fait donc baisser le prévisionnel du jour, ce qui est
    // exactement ce qu'on veut pour la cuisine.
    async function setStatut(id, statut) {
      return update(id, { statut });
    }

    // Recherche par nom ou téléphone sur tout l'établissement, toutes dates.
    // Sans elle, retrouver « Dupont » suppose de connaître déjà sa date - or
    // quand il rappelle pour décaler, c'est justement ce qu'on cherche.
    async function search(terme, { limit = 40 } = {}) {
      const t = String(terme || '').trim();
      if (t.length < 2) return { data: [], error: null };
      // La syntaxe .or() de PostgREST est délimitée par virgules, parenthèses
      // et guillemets : les laisser passer casserait le filtre (et permettrait
      // d'injecter d'autres conditions). On ne garde que du texte.
      // Par mots, dans n'importe quel ordre (« jean dupont » trouve « Dupont
      // Jean », « 079 123 » trouve « 0791234567 ») : le serveur filtre sur le
      // mot le plus long, les autres mots sont vérifiés ici.
      const mots = t.replace(/[,()\\%*"]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5);
      if (!mots.length) return { data: [], error: null };
      const pivot = mots.reduce((a, b) => (b.length > a.length ? b : a));

      const { data, error } = await supabase
        .from(TABLE)
        .select('*, reservation_tags(*)')
        .eq('etablissement_id', etablissementId)
        .neq('statut', 'annule')
        .or(`nom.ilike.%${pivot}%,telephone.ilike.%${pivot}%`)
        .order('date_service', { ascending: false })
        .order('heure_arrivee')
        .limit(mots.length > 1 ? 200 : limit);
      if (error) return { data: null, error: mapError(error) };
      const plier = (s) => normalizeSearch(s).replace(/\s+/g, '');
      const autres = mots.filter((m) => m !== pivot).map(plier);
      const lignes = (data || []).filter((r) => {
        const texte = plier(`${r.nom || ''}${r.telephone || ''}`);
        return autres.every((m) => texte.includes(m));
      });
      return { data: lignes.slice(0, limit), error: null };
    }

    async function findByDate(date) {
      const t0 = performance.now();
      const { data, error } = await supabase
        .from(TABLE)
        .select('*, reservation_tags(*)')
        .eq('etablissement_id', etablissementId)
        .eq('date_service', date)
        .order('heure_arrivee');
      const t1 = performance.now();
      console.log(`[useReservations] findByDate ${(t1 - t0).toFixed(0)}ms`, { date, count: data?.length });
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    async function findById(id) {
      console.log('[useReservations] findById', { id });
      const { data, error } = await supabase
        .from(TABLE)
        .select('*, reservation_tags(*)')
        .eq('id', id)
        .single();
      if (error) return { data: null, error: mapError(error) };
      return { data, error: null };
    }

    return {
      create, update, delete: deleteReservation, setStatut, search,
      findByDate, findById,
    };
  }, [etablissementId]);
}
