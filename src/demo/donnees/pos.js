// Ventes POS de démonstration : une caisse Lightspeed déjà reliée, ses articles
// rapprochés des fiches, et trente jours de ventes. Aucune vraie caisse.
import { ETAB, jour, jourSemaine, instant, graine } from './base.js';
import { PLATS, PLAT_RECETTES } from './cuisine.js';

const CONNEXION = 'posc-demo';

export function genererPos() {
  const alea = graine('pos');
  const connexions = [{
    id: CONNEXION, etablissement_id: ETAB, provider_id: 'pp-lightspeed', access_token_enc: null, refresh_token_enc: null,
    token_expires_at: null, status: 'connected', last_sync_at: instant(jour(0), '04:00'), last_error: null, created_by: 'demo-patron',
    created_at: '2026-06-01T08:00:00Z', updated_at: instant(jour(0), '04:00'), ls_business_id: 'demo', ls_business_location_id: 'demo',
  }];
  const articles = PLATS.map((p, i) => ({
    id: `pi-${i + 1}`, pos_connection_id: CONNEXION, external_id: String(9000 + i), name: p.nom.toUpperCase().slice(0, 32),
    sku: `BD-${String(100 + i)}`, accounting_group: p.categorie, active: true, last_seen_at: instant(jour(0), '04:00'),
    archived_at: null, created_at: '2026-06-01T08:00:00Z', updated_at: instant(jour(0), '04:00'),
  }));
  // Deux articles restent à relier : l'écran de correspondance a du travail.
  const correspondances = articles.slice(0, -2).map((a, i) => {
    const plat = PLATS[i];
    const principale = PLAT_RECETTES.find((l) => l.plat_id === plat.id && l.role === 'principal');
    return {
      id: `pim-${i + 1}`, pos_item_id: a.id, recipe_id: principale?.recette_id || null, confidence: 0.92, manually_validated: i % 3 === 0,
      created_at: '2026-06-02T08:00:00Z', updated_at: '2026-06-02T08:00:00Z', matched_at: '2026-06-02T08:00:00Z', matched_by: 'demo-chef',
    };
  });
  const ventes = [];
  let k = 0;
  for (let d = -30; d <= -1; d += 1) {
    const date = jour(d);
    const js = jourSemaine(date);
    if (js === 1) continue;
    const coef = js === 5 || js === 6 ? 1.6 : 1;
    articles.forEach((a, i) => {
      const plat = PLATS[i];
      const base = plat.categorie === 'Plats' ? 7 : plat.categorie === 'Entrées' ? 4 : 3;
      const qty = Math.max(0, Math.round(base * coef * (0.5 + alea())));
      if (!qty) return;
      k += 1;
      ventes.push({ id: `ps-${k}`, pos_item_id: a.id, date, qty, revenue_cts: Math.round(qty * plat.prix_vente * 100), created_at: instant(date, '04:00'), updated_at: instant(date, '04:00') });
    });
  }
  return { pos_connections: connexions, pos_items: articles, pos_item_recipe_mapping: correspondances, pos_sales: ventes };
}
