// ================================================================
// evaluators/pertes.ts
//
// Condition : somme des pertes (quantite × valeur_unit) sur les
//             derniers period_days dépasse threshold_chf.
//
// rule_config attendu :
//   { period_days?: number, threshold_chf?: number }
//   ex: { period_days: 7, threshold_chf: 200 }
//
// Colonnes pertes : etablissement_id, date, quantite, valeur_unit
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

export async function evalPertes(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { period_days = 7, threshold_chf = 200 } = rule.rule_config as {
    period_days?: number;
    threshold_chf?: number;
  };

  const since = new Date();
  since.setDate(since.getDate() - period_days);
  const sinceStr = since.toISOString().split('T')[0]; // "YYYY-MM-DD"

  const { data, error } = await sb
    .from('pertes')
    .select('quantite, valeur_unit')
    .eq('etablissement_id', rule.etablissement_id)
    .gte('date', sinceStr);

  if (error) {
    console.error('[alerts/pertes]', error.message);
    return { shouldFire: false };
  }

  const total = (data ?? []).reduce(
    (sum, row) => sum + (Number(row.quantite) || 0) * (Number(row.valeur_unit) || 0),
    0,
  );

  if (total < threshold_chf) return { shouldFire: false };

  return {
    shouldFire: true,
    title: 'Pertes élevées',
    message:
      `Total des pertes sur ${period_days} jour(s) : ${total.toFixed(2)} CHF ` +
      `(seuil : ${threshold_chf} CHF).`,
    linkModule: 'pertes',
  };
}
