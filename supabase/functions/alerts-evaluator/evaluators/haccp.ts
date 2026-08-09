// ================================================================
// evaluators/haccp.ts
//
// Condition : aucun relevé HACCP pour la (ou les) zone(s) surveillée(s)
//             à la date d'aujourd'hui ET l'heure attendue est dépassée.
//             Une alerte par zone manquante, nommée par la zone.
//
// rule_config attendu :
//   { zone_ids: string[], expected_by: string }
//   ex: { zone_ids: ["z1778761664397"], expected_by: "12:00" }
//   Rétrocompat : { zone_id: "…" } (règles créées avant le sélecteur)
//
// Colonnes haccp_releves : etablissement_id, zone_id, date, heure
// Timezone : Europe/Zurich
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertItem, AlertRule, EvalResult } from '../types.ts';

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
  const { zone_ids, zone_id, expected_by = '12:00' } = rule.rule_config as {
    zone_ids?: string[];
    zone_id?: string;   // legacy - une seule zone
    expected_by?: string;
  };

  const ids = (Array.isArray(zone_ids) && zone_ids.length > 0)
    ? zone_ids
    : (zone_id ? [zone_id] : []);

  if (ids.length === 0) {
    console.warn(`[alerts/haccp] rule ${rule.id} sans zone - ignorée`);
    return { shouldFire: false };
  }

  const { date: today, time: nowTime } = localNow();

  // Pas encore l'heure attendue → on ne déclenche pas encore
  if (nowTime < expected_by) return { shouldFire: false };

  // Zones surveillées (nom pour le libellé) + relevés du jour, en parallèle
  const [zonesRes, relevesRes] = await Promise.all([
    sb.from('haccp_zones')
      .select('id, nom')
      .eq('etablissement_id', rule.etablissement_id)
      .in('id', ids),
    sb.from('haccp_releves')
      .select('zone_id')
      .eq('etablissement_id', rule.etablissement_id)
      .eq('date', today)
      .in('zone_id', ids),
  ]);

  if (relevesRes.error) {
    console.error('[alerts/haccp]', relevesRes.error.message);
    return { shouldFire: false };
  }
  if (zonesRes.error) console.error('[alerts/haccp] zones', zonesRes.error.message);

  const nomById = new Map<string, string>(
    ((zonesRes.data ?? []) as Array<{ id: string; nom: string | null }>)
      .map((z) => [z.id, z.nom ?? z.id]),
  );

  const releves = new Set(
    ((relevesRes.data ?? []) as Array<{ zone_id: string }>).map((r) => r.zone_id),
  );

  const missing = ids.filter((id) => !releves.has(id));
  if (missing.length === 0) return { shouldFire: false };

  const items: AlertItem[] = missing.map((id) => {
    const nom = nomById.get(id) ?? id;
    return {
      dedupeKey:  `zone:${id}`,
      title:      `Relevé HACCP manquant - ${nom}`,
      message:    `Aucun relevé enregistré aujourd'hui pour « ${nom} » (attendu avant ${expected_by}).`,
      linkModule: 'haccp',
    };
  });

  return { shouldFire: true, items };
}
