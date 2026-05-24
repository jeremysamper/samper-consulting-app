// ================================================================
// evaluators/stock.ts
//
// Condition : dans le dernier inventaire validé, le stock réel
//             d'un produit est inférieur au seuil configuré.
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
    console.warn(`[alerts/stock] rule ${rule.id} config incomplète — ignorée`);
    return { shouldFire: false };
  }

  // Dernier inventaire validé pour cet établissement
  const { data: invRows, error } = await sb
    .from('inventaires')
    .select('id, lignes')
    .eq('etablissement_id', rule.etablissement_id)
    .eq('statut', 'valide')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[alerts/stock]', error.message);
    return { shouldFire: false };
  }

  if (!invRows?.length) return { shouldFire: false }; // Pas d'inventaire validé

  const lignes: LigneMvt[] = invRows[0].lignes ?? [];
  const nameNorm = product_name.toLowerCase().trim();

  const ligne = lignes.find(
    (l) => (l.produit ?? '').toLowerCase().trim() === nameNorm,
  );

  if (!ligne) return { shouldFire: false }; // Produit non trouvé dans l'inventaire

  const stockReel = Number(ligne.stockReel) || 0;
  if (stockReel >= threshold) return { shouldFire: false };

  const uniteStr = unite || ligne.unite || '';
  return {
    shouldFire: true,
    title: `Stock critique : ${product_name}`,
    message:
      `Stock réel : ${stockReel} ${uniteStr} (seuil : ${threshold} ${uniteStr}). ` +
      `Un réapprovisionnement est recommandé.`,
    linkModule: 'inventaire',
  };
}
