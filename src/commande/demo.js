import { BOISSONS, CAISSE_CATEGORIES, PLAT_FORMATS } from '../demo/donnees/caisse.js';
import { ETABLISSEMENT } from '../demo/donnees/base.js';
import { SALLE_TABLES } from '../demo/donnees/salle.js';
import { LIMITES, prenomPropre, tablePropre } from './regles.js';

const SALLE_TABLES_NOMS = SALLE_TABLES.map((t) => String(t.nom).trim().toLowerCase());

// ─────────────────────────────────────────────────────────────────────────────
// Commande par QR, adresse de la démo publique (/commande/demo) : la carte des
// boissons de la Brasserie Démo, et un envoi simulé. Rien ne part vers la
// base ; la commande n'arrive dans aucune caisse (la démo de la caisse a ses
// propres commandes en attente, posées par src/demo/donnees/caisse.js).
// Mêmes réponses que commande_qr_carte et commande_qr_envoyer, formats compris
// (Carte des boissons, lot A).
// ─────────────────────────────────────────────────────────────────────────────

const boissons = CAISSE_CATEGORIES.find((c) => c.nom === 'Boissons');

// Les formats d'un plat, rangés par ordre puis libellé.
function formatsDe(platId) {
  return PLAT_FORMATS
    .filter((f) => f.plat_id === platId)
    .sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle))
    .map((f) => ({ id: f.id, libelle: f.libelle, prix: f.prix }));
}

// Le prix de vente ; sans lui, le plus petit prix des formats.
function prixAffiche(b) {
  if (b.prix_vente > 0) return b.prix_vente;
  const formats = formatsDe(b.id);
  return formats.length ? Math.min(...formats.map((f) => f.prix)) : null;
}

export function carteDemo() {
  return {
    etablissement: ETABLISSEMENT.nom,
    ouvert: true,
    plages: [],
    categories: boissons ? [{ id: boissons.id, nom: boissons.nom }] : [],
    produits: BOISSONS.map((b) => ({
      id: b.id, nom: b.nom, prix: prixAffiche(b), categorie_id: boissons?.id, photo: null, formats: formatsDe(b.id),
    })),
  };
}

// Le prix d'une ligne : celui du format nommé ; sans format nommé, celui du
// format unique du plat, ou son prix de vente s'il n'a aucun format. Null :
// format étranger au plat, ou choix de format manquant.
function prixLigne(plat, formatId) {
  const formats = formatsDe(plat.id);
  if (formatId) return formats.find((f) => f.id === formatId)?.prix ?? null;
  if (formats.length === 1) return formats[0].prix;
  if (!formats.length && plat.prix_vente > 0) return plat.prix_vente;
  return null;
}

export async function envoiDemo({ table, auBar, prenom, lignes }) {
  await new Promise((r) => setTimeout(r, 600));
  if (!auBar && !SALLE_TABLES_NOMS.includes(tablePropre(table).toLowerCase())) return { erreur: 'table' };
  const p = prenomPropre(prenom);
  if (p.length < 1 || p.length > LIMITES.prenom) return { erreur: 'prenom' };
  const plats = new Map(BOISSONS.map((b) => [b.id, b]));
  const liste = (lignes || []).filter((l) => Number(l.quantite) > 0);
  if (liste.some((l) => !plats.has(l.plat_id))) return { erreur: 'produit', produits: [] };
  const sansFormat = new Set();
  let centimes = 0;
  let articles = 0;
  liste.forEach((l) => {
    const prix = prixLigne(plats.get(l.plat_id), l.format_id || null);
    if (prix == null) { sansFormat.add(l.plat_id); return; }
    centimes += Number(l.quantite) * Math.round(prix * 100);
    articles += Number(l.quantite);
  });
  if (sansFormat.size) return { erreur: 'format', produits: [...sansFormat] };
  return { ok: true, total: centimes / 100, articles };
}
