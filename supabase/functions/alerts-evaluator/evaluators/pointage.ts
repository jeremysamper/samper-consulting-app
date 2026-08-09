// ================================================================
// evaluators/pointage.ts
//
// Condition : shifts planifiés aujourd'hui dont pointage_debut IS NULL
//             ET dont l'heure de début est dépassée de plus de
//             delay_minutes (défaut : 30 min).
//
// Une alerte NOMMÉE par shift concerné : le patron sait qui manque, et
// l'employé concerné reçoit la sienne (target_user_ids) sans que tous
// ses collègues du même rôle la voient.
//
// rule_config attendu :
//   { delay_minutes?: number, notify_employee?: boolean }
//   ex: { delay_minutes: 30, notify_employee: true }
//
// Timezone : Europe/Zurich (fallback si pas de tz sur l'établissement)
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertItem, AlertRule, EvalResult } from '../types.ts';

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

interface ShiftRow { id: string; user_id: string | null; debut: string | null; poste: string | null }
interface ProfileRow { id: string; prenom: string | null; nom: string | null; email: string | null }

export async function evalPointage(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { delay_minutes = 30, notify_employee = true } = rule.rule_config as {
    delay_minutes?: number;
    notify_employee?: boolean;
  };

  const { date: today, time: nowTime } = localNow();
  const cutoff = subtractMinutes(nowTime, delay_minutes);

  // Shifts planifiés aujourd'hui, non pointés, dont l'heure de début est dépassée
  const { data, error } = await sb
    .from('shifts')
    .select('id, user_id, debut, poste')
    .eq('etablissement_id', rule.etablissement_id)
    .eq('date', today)
    .is('pointage_debut', null)
    .lte('debut', cutoff); // debut <= nowTime - delay_minutes

  if (error) {
    console.error('[alerts/pointage]', error.message);
    return { shouldFire: false };
  }

  const shifts = (data ?? []) as ShiftRow[];
  if (shifts.length === 0) return { shouldFire: false };

  // Noms des employés concernés (profiles.id = auth.users.id = shifts.user_id)
  const userIds = [...new Set(shifts.map((s) => s.user_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles, error: profErr } = await sb
      .from('profiles')
      .select('id, prenom, nom, email')
      .in('id', userIds);

    if (profErr) console.error('[alerts/pointage] profiles', profErr.message);

    for (const p of ((profiles ?? []) as ProfileRow[])) {
      const full = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim();
      nameById.set(p.id, full || p.email || 'Employé');
    }
  }

  const items: AlertItem[] = shifts.map((s) => {
    const name  = (s.user_id && nameById.get(s.user_id)) || 'Un employé';
    const debut = (s.debut ?? '').slice(0, 5);
    const poste = s.poste ? ` - ${s.poste}` : '';

    return {
      dedupeKey: `shift:${s.id}`,
      title:     `Pointage manquant - ${name}`,
      message:
        `${name} n'a pas pointé son arrivée` +
        (debut ? ` (shift de ${debut}${poste})` : '') +
        ` - plus de ${delay_minutes} min après le début du shift.`,
      linkModule: 'planning',
      // L'employé concerné voit SA seule alerte, quel que soit son rôle.
      targetUserIds: notify_employee && s.user_id ? [s.user_id] : [],
    };
  });

  return { shouldFire: true, items };
}
