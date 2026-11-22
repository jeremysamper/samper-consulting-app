import { supabase } from '../../services/supabase.js';
import { joursFermesEnLigne, joursFermesMaison } from './joursFermesEnLigne.js';

export { HORIZON_FERMETURES_JOURS, joursFermesEnLigne, joursFermesMaison } from './joursFermesEnLigne.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fermetures de la réservation en ligne (plan 15, lot 2) : elles se lisent
// dans Réglages > Horaires et fermetures seulement (reglages_maison). La page
// publique de réservation lit les jours fermés de reservation_en_ligne_
// parametres.jours_fermes : on y recopie, daté, chaque jour que la maison
// ferme, sur l'horizon de la réservation. Les jours fermés posés avant le
// plan dans les réglages en ligne restent tant qu'on ne les retire pas.
// ─────────────────────────────────────────────────────────────────────────────

// Après un changement des fermetures de la maison : la ligne de la
// réservation en ligne suit tout de suite. Un jour qui n'était fermé que par
// l'ancienne règle sort ; un jour hérité reste. Sans ligne (réservation en
// ligne jamais réglée), rien à faire.
export async function synchroniserFermeturesEnLigne(etabId, avant, apres, aujourdhui) {
  if (!etabId) return { error: null };
  const { data, error } = await supabase.from('reservation_en_ligne_parametres')
    .select('jours_fermes').eq('etablissement_id', etabId).maybeSingle();
  if (error) return { error };
  if (!data) return { error: null };
  const parAvant = new Set(joursFermesMaison(avant, aujourdhui));
  const herites = (data.jours_fermes || []).filter((d) => d >= aujourdhui && !parAvant.has(d));
  const jours = joursFermesEnLigne(apres, herites, aujourdhui);
  const { error: e2 } = await supabase.from('reservation_en_ligne_parametres')
    .update({ jours_fermes: jours }).eq('etablissement_id', etabId);
  return { error: e2 || null };
}
