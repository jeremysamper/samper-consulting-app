import { BOISSONS, CAISSE_CATEGORIES } from '../demo/donnees/caisse.js';
import { ETABLISSEMENT } from '../demo/donnees/base.js';
import { SALLE_TABLES } from '../demo/donnees/salle.js';
import { LIMITES, nbArticles, prenomPropre, tablePropre } from './regles.js';

const SALLE_TABLES_NOMS = SALLE_TABLES.map((t) => String(t.nom).trim().toLowerCase());

// ─────────────────────────────────────────────────────────────────────────────
// Commande par QR, adresse de la démo publique (/commande/demo) : la carte des
// boissons de la Brasserie Démo, et un envoi simulé. Rien ne part vers la
// base ; la commande n'arrive dans aucune caisse (la démo de la caisse a ses
// propres commandes en attente, posées par src/demo/donnees/caisse.js).
// ─────────────────────────────────────────────────────────────────────────────

const boissons = CAISSE_CATEGORIES.find((c) => c.nom === 'Boissons');

export function carteDemo() {
  return {
    etablissement: ETABLISSEMENT.nom,
    ouvert: true,
    plages: [],
    categories: boissons ? [{ id: boissons.id, nom: boissons.nom }] : [],
    produits: BOISSONS.map((b) => ({ id: b.id, nom: b.nom, prix: b.prix_vente, categorie_id: boissons?.id, photo: null })),
  };
}

export async function envoiDemo({ table, auBar, prenom, lignes }) {
  await new Promise((r) => setTimeout(r, 600));
  if (!auBar && !SALLE_TABLES_NOMS.includes(tablePropre(table).toLowerCase())) return { erreur: 'table' };
  const p = prenomPropre(prenom);
  if (p.length < 1 || p.length > LIMITES.prenom) return { erreur: 'prenom' };
  const panier = Object.fromEntries((lignes || []).map((l) => [l.plat_id, l.quantite]));
  const prix = new Map(BOISSONS.map((b) => [b.id, Math.round(b.prix_vente * 100)]));
  if (Object.keys(panier).some((id) => !prix.has(id))) return { erreur: 'produit', produits: [] };
  const total = Object.entries(panier).reduce((s, [id, q]) => s + q * prix.get(id), 0) / 100;
  return { ok: true, total, articles: nbArticles(panier) };
}
