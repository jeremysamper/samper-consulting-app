// ================================================================
// evaluators/ventes.ts
//
// Condition : aucune vente POS enregistrée depuis inactive_days
//             pour cet établissement.
//
// rule_config attendu :
//   { inactive_days?: number }   ex: { inactive_days: 2 }
//
// Jointure : pos_sales → pos_items → pos_connections(etablissement_id)
// Skippé si aucune connexion POS active pour l'établissement.
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

export async function evalVentes(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { inactive_days = 2 } = rule.rule_config as { inactive_days?: number };

  // Vérifier qu'une connexion POS active existe
  const { data: conn, error: connErr } = await sb
    .from('pos_connections')
    .select('id')
    .eq('etablissement_id', rule.etablissement_id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (connErr) {
    console.error('[alerts/ventes] pos_connections:', connErr.message);
    return { shouldFire: false };
  }
  if (!conn) return { shouldFire: false }; // Pas de POS configuré → on skip

  // Date limite : aujourd'hui - inactive_days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - inactive_days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0]; // "YYYY-MM-DD"

  // Chercher la vente la plus récente via jointure
  const { data: salesRows, error: salesErr } = await sb
    .from('pos_sales')
    .select('date, pos_items!inner(pos_connections!inner(etablissement_id))')
    .eq('pos_items.pos_connections.etablissement_id', rule.etablissement_id)
    .order('date', { ascending: false })
    .limit(1);

  if (salesErr) {
    console.error('[alerts/ventes] pos_sales:', salesErr.message);
    return { shouldFire: false };
  }

  if (!salesRows?.length) {
    // Aucune vente enregistrée du tout
    return {
      shouldFire: true,
      title: 'Ventes POS inactives',
      message: `Aucune vente POS enregistrée depuis plus de ${inactive_days} jour(s).`,
      linkModule: 'pos',
    };
  }

  const lastDate = salesRows[0].date as string; // "YYYY-MM-DD"
  if (lastDate >= cutoffStr) return { shouldFire: false }; // Ventes récentes

  const daysSince = Math.floor(
    (Date.now() - new Date(lastDate).getTime()) / 86_400_000,
  );

  return {
    shouldFire: true,
    title: 'Ventes POS inactives',
    message: `Aucune vente POS depuis ${daysSince} jour(s) (dernière : ${lastDate}).`,
    linkModule: 'pos',
  };
}
