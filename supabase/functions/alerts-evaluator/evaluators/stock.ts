// ================================================================
// evaluators/stock.ts
//
// Condition : le stock réel consolidé d'un produit est inférieur au seuil.
//             Stock consolidé = dernier inventaire validé de CHAQUE périmètre
//             (inventaires.nom : Cuisine, Boissons…), additionnés - même
//             règle que l'écran Inventaire.
//
// Le front enregistre statut = 'validé' (accentué) : l'ancien filtre sur
// 'valide' ne trouvait jamais rien, l'alerte ne pouvait pas se déclencher.
//
// rule_config attendu :
//   { product_name: string, threshold: number, unite?: string }
//   ex: { product_name: "Farine T55", threshold: 5, unite: "kg" }
//
// Structure inventaires.lignes (JSONB) :
//   [{ produit, categorie, unite, stockTheo, stockReel, prixUnit,
//      ecart, valeur, ecartValeur }, ...]
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AlertRule, EvalResult } from '../types.ts';

interface LigneMvt {
  produit: string;
  stockReel: number;
  unite?: string;
}

export async function evalStock(
  sb: SupabaseClient,
  rule: AlertRule,
): Promise<EvalResult> {
  const { product_name, threshold, unite } = rule.rule_config as {
    product_name?: string;
    threshold?: number;
    unite?: string;
  };

  if (!product_name || threshold === undefined) {
    console.warn(`[alerts/stock] rule ${rule.id} config incomplète - ignorée`);
    return { shouldFire: false };
  }

  // Inventaires validés, du plus récent au plus ancien
  const { data: invRows, error } = await sb
    .from('inventaires')
    .select('id, nom, lignes, created_at')
    .eq('etablissement_id', rule.etablissement_id)
    .in('statut', ['validé', 'valide'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[alerts/stock]', error.message);
    return { shouldFire: false };
  }

  if (!invRows?.length) return { shouldFire: false }; // Pas d'inventaire validé

  // Le plus récent de chaque périmètre
  const seen = new Set<string>();
  const latest = invRows.filter((inv) => {
    const key = (inv.nom ?? '').trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const nameNorm = product_name.toLowerCase().trim();
  const matches: LigneMvt[] = latest.flatMap((inv) =>
    ((inv.lignes ?? []) as LigneMvt[]).filter(
      (l) => (l.produit ?? '').toLowerCase().trim() === nameNorm,
    ),
  );

  if (!matches.length) {
    // Visible dans les logs de la fonction : la règle vise un produit absent.
    console.warn(`[alerts/stock] rule ${rule.id} : produit « ${product_name} » absent des inventaires validés`);
    return { shouldFire: false };
  }

  const stockReel = matches.reduce((sum, l) => sum + (Number(l.stockReel) || 0), 0);
  if (stockReel >= threshold) return { shouldFire: false };

  const uniteStr = unite || matches[0].unite || '';
  return {
    shouldFire: true,
    title: `Stock critique : ${product_name}`,
    message:
      `Stock réel : ${stockReel} ${uniteStr} (seuil : ${threshold} ${uniteStr}). ` +
      `Un réapprovisionnement est recommandé.`,
    linkModule: 'inventaire',
  };
}
