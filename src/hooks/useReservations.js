import { supabase } from '../services/supabase.js';

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

export function useReservations(etablissementId) {
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

  // Soft delete via statut='annule' — déclenche le trigger qui
  // recalcule previsions_jour en excluant cette réservation
  async function deleteReservation(id) {
    return update(id, { statut: 'annule' });
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

  async function findByWeek(dateDebut) {
    const end = new Date(dateDebut);
    end.setDate(end.getDate() + 6);
    const dateFin = end.toISOString().slice(0, 10);
    console.log('[useReservations] findByWeek', { etablissementId, dateDebut, dateFin });
    const { data, error } = await supabase
      .from(TABLE)
      .select('*, reservation_tags(*)')
      .eq('etablissement_id', etablissementId)
      .gte('date_service', dateDebut)
      .lte('date_service', dateFin)
      .order('date_service')
      .order('heure_arrivee');
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

  return { create, update, delete: deleteReservation, findByDate, findByWeek, findById };
}
