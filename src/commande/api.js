import { estAdresseDemo } from './regles.js';

// ─────────────────────────────────────────────────────────────────────────────
// Commande par QR : les deux appels de la page publique. Aucune session, aucun
// client supabase-js (la page reste légère) : deux RPC anonymes, appelées avec
// la clé publique du projet. La sécurité est côté serveur
// (commande_qr_carte, commande_qr_envoyer).
// Une adresse « demo... » ne touche jamais la base : la démo publique a sa
// carte à elle, tirée des jeux de src/demo (chargés seulement dans ce cas).
// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = import.meta.env.VITE_SUPABASE_URL || 'https://ppmtoiqgajwcdkbnrcll.supabase.co';
const CLE = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Vp4K1VX34PBe4lID0qFS1w_JD2sc5Ov';

async function rpc(nom, args) {
  let r;
  try {
    r = await fetch(`${URL_BASE}/rest/v1/rpc/${nom}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE },
      body: JSON.stringify(args),
    });
  } catch {
    return { erreur: 'reseau' };
  }
  if (!r.ok) return { erreur: 'reseau' };
  return r.json().catch(() => ({ erreur: 'reseau' }));
}

export async function lireCarte(slug) {
  if (estAdresseDemo(slug)) return (await import('./demo.js')).carteDemo();
  return rpc('commande_qr_carte', { p_slug: slug });
}

export async function envoyerCommande({ slug, table, auBar, prenom, lignes, appareil }) {
  if (estAdresseDemo(slug)) return (await import('./demo.js')).envoiDemo({ table, auBar, prenom, lignes });
  return rpc('commande_qr_envoyer', {
    p_slug: slug,
    p_table: auBar ? null : table,
    p_au_bar: Boolean(auBar),
    p_prenom: prenom,
    p_lignes: lignes,
    p_appareil: appareil,
  });
}

// Identifiant tiré au hasard, gardé sur le téléphone : il sert au plafond
// d'envois côté serveur. Ce n'est pas une preuve, et il ne dit rien de la
// personne.
export function idAppareil() {
  const CLE_APPAREIL = 'sc_commande_appareil';
  try {
    const lu = window.localStorage.getItem(CLE_APPAREIL);
    if (lu && /^[0-9a-f-]{36}$/.test(lu)) return lu;
    const neuf = window.crypto?.randomUUID ? window.crypto.randomUUID() : uuidDeRepli();
    window.localStorage.setItem(CLE_APPAREIL, neuf);
    return neuf;
  } catch {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : uuidDeRepli();
  }
}

function uuidDeRepli() {
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
