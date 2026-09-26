// ================================================================
// evaluators/reservation.ts
//
// Condition : réservations non confirmées depuis plus de delay_hours.
//
// Les statuts réels de l'app sont 'confirme', 'arrive', 'parti', 'no_show'
// et 'annule' (src/modules/previsions/statutsReservation.js) : toute
// réservation saisie est d'emblée confirmée. L'ancienne liste ('confirmee',
// 'arrivee'…) ne correspondait à rien et comptait CHAQUE réservation comme
// non confirmée. Le type est retiré du formulaire ; l'évaluateur reste juste
// pour une règle éventuellement créée avant.
//
// rule_config attendu :
//   { delay_hours?: number }   ex: { delay_hours: 24 }
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

const CONFIRMED_STATUTS = [
  'confirme', 'arrive', 'parti', 'no_show', 'annule',
  // anciennes graphies, par prudence
  'confirmee', 'arrivee', 'en_cours',
];

export async function evalReservation(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { delay_hours = 24 } = rule.rule_config as { delay_hours?: number };

  const cutoffIso = new Date(Date.now() - delay_hours * 3600 * 1000).toISOString();

  const { data, error } = await sb
    .from('reservations')
    .select('id, statut, created_at')
    .eq('etablissement_id', rule.etablissement_id)
    .not('statut', 'in', `(${CONFIRMED_STATUTS.map((s) => `"${s}"`).join(',')})`)
    .lt('created_at', cutoffIso);

  if (error) {
    console.error('[alerts/reservation]', error.message);
    return { shouldFire: false };
  }

  const count = data?.length ?? 0;
  if (count === 0) return { shouldFire: false };

  const s = count > 1;
  return {
    shouldFire: true,
    title: `${count} réservation${s ? 's' : ''} non confirmée${s ? 's' : ''}`,
    message:
      `${count} réservation${s ? 's sont' : ' est'} en attente de confirmation ` +
      `depuis plus de ${delay_hours}h.`,
    linkModule: 'previsions',
  };
}
