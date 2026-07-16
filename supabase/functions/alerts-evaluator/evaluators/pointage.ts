// ================================================================
// evaluators/pointage.ts
//
// Condition : shifts planifiés aujourd'hui dont pointage_debut IS NULL
//             ET dont l'heure de début est dépassée de plus de
//             delay_minutes (défaut : 30 min).
//
// rule_config attendu :
//   { delay_minutes?: number }   ex: { delay_minutes: 30 }
//
// Timezone : Europe/Zurich (fallback si pas de tz sur l'établissement)
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

const TZ = 'Europe/Zurich';

/** Retourne la date et l'heure locales au format { date: "YYYY-MM-DD", time: "HH:MM" } */
function localNow(): { date: string; time: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const [date, time] = fmt.format(now).split(' ');
  return { date, time }; // "2026-05-24", "14:30"
}

/** Soustrait N minutes à une string "HH:MM" - retourne "HH:MM" */
function subtractMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m - minutes;
  const clamped = Math.max(0, total);
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export async function evalPointage(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { delay_minutes = 30 } = rule.rule_config as { delay_minutes?: number };

  const { date: today, time: nowTime } = localNow();
  const cutoff = subtractMinutes(nowTime, delay_minutes);

  // Shifts planifiés aujourd'hui, non pointés, dont l'heure de début est dépassée
  const { data, error } = await sb
    .from('shifts')
    .select('id, user_id, debut')
    .eq('etablissement_id', rule.etablissement_id)
    .eq('date', today)
    .is('pointage_debut', null)
    .lte('debut', cutoff); // debut <= nowTime - delay_minutes

  if (error) {
    console.error('[alerts/pointage]', error.message);
    return { shouldFire: false };
  }

  const count = data?.length ?? 0;
  if (count === 0) return { shouldFire: false };

  const s = count > 1;
  return {
    shouldFire: true,
    title: `${count} pointage${s ? 's' : ''} manquant${s ? 's' : ''}`,
    message:
      `${count} employé${s ? 's n'ont' : ' n'a'} pas pointé alors que ` +
      `le shift a débuté il y a plus de ${delay_minutes} min.`,
    linkModule: 'planning',
  };
}
