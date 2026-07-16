// ================================================================
// evaluators/haccp.ts
//
// Condition : aucun relevé HACCP pour la zone donnée à la date
//             d'aujourd'hui ET l'heure attendue est dépassée.
//
// rule_config attendu :
//   { zone_id: string, expected_by: string }
//   ex: { zone_id: "hz-001", expected_by: "12:00" }
//
// Colonnes haccp_releves : etablissement_id, zone_id, date, heure
// Timezone : Europe/Zurich
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

const TZ = 'Europe/Zurich';

function localNow(): { date: string; time: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const [date, time] = fmt.format(now).split(' ');
  return { date, time };
}

export async function evalHaccp(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { zone_id, expected_by = '12:00' } = rule.rule_config as {
    zone_id?: string;
    expected_by?: string;
  };

  if (!zone_id) {
    console.warn(`[alerts/haccp] rule ${rule.id} sans zone_id - ignorée`);
    return { shouldFire: false };
  }

  const { date: today, time: nowTime } = localNow();

  // Pas encore l'heure attendue → on ne déclenche pas encore
  if (nowTime < expected_by) return { shouldFire: false };

  // Y a-t-il un relevé pour cette zone aujourd'hui ?
  const { data, error } = await sb
    .from('haccp_releves')
    .select('id')
    .eq('etablissement_id', rule.etablissement_id)
    .eq('zone_id', zone_id)
    .eq('date', today)
    .limit(1);

  if (error) {
    console.error('[alerts/haccp]', error.message);
    return { shouldFire: false };
  }

  const hasReleve = (data?.length ?? 0) > 0;
  if (hasReleve) return { shouldFire: false };

  return {
    shouldFire: true,
    title: 'Relevé HACCP manquant',
    message: `Aucun relevé HACCP enregistré pour cette zone aujourd'hui (attendu avant ${expected_by}).`,
    linkModule: 'haccp',
  };
}
