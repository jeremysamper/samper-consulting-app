import { supabase } from '../services/supabase.js';

const TABLE = 'reservation_tags';

function mapError(error) {
  if (!error) return null;
  console.error('[useReservationTags] erreur Supabase', error);
  const MESSAGES = {
    '23505': 'Ce tag existe déjà sur cette réservation.',
    '23503': 'Réservation introuvable.',
    '42501': "Tu n'as pas les droits pour cette action.",
  };
  return MESSAGES[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

export function useReservationTags() {
  async function bulkCreate(reservationId, tags) {
    if (!Array.isArray(tags) || tags.length === 0) return { data: [], error: null };
    const rows = tags.map((t) => ({
      reservation_id: reservationId,
      type_tag: t.type_tag,
      valeur: t.valeur,
      libre: t.libre ?? false,
    }));
    console.log('[useReservationTags] bulkCreate', { reservationId, rows });
    const { data, error } = await supabase.from(TABLE).insert(rows).select();
    if (error) return { data: null, error: mapError(error) };
    return { data, error: null };
  }

  async function deleteByReservationId(reservationId) {
    console.log('[useReservationTags] deleteByReservationId', { reservationId });
    const { error } = await supabase.from(TABLE).delete().eq('reservation_id', reservationId);
    if (error) return { error: mapError(error) };
    return { error: null };
  }

  async function findByReservation(reservationId) {
    console.log('[useReservationTags] findByReservation', { reservationId });
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('reservation_id', reservationId);
    if (error) return { data: null, error: mapError(error) };
    return { data, error: null };
  }

  return { bulkCreate, deleteByReservationId, findByReservation };
}
