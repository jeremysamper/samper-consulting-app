import { estJetonDemo, jetonValide } from './regles.js';

// Demande par le QR de la chambre (lot 17) : les trois appels de la page
// publique. Aucune session, aucun client supabase-js : trois RPC anonymes,
// appelées avec la clé publique du projet, comme src/commande/api.js. La
// sécurité est côté serveur (demande_chambre_ouvrir, _envoyer, _suivi).
// Un jeton « demo... » ne touche jamais la base. Le jeton ne s'écrit dans
// aucun journal ni aucun stockage du navigateur.

export { idAppareil } from '../commande/api.js';

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

const demo = () => import('./demo.js');

export async function ouvrirChambre(jeton) {
  if (estJetonDemo(jeton)) return (await demo()).ouvrirDemo();
  if (!jetonValide(jeton)) return { erreur: 'introuvable' };
  return rpc('demande_chambre_ouvrir', { p_jeton: jeton });
}

export async function envoyerDemande({ jeton, libelle, note, appareil }) {
  if (estJetonDemo(jeton)) return (await demo()).envoyerDemo({ libelle, note });
  if (!jetonValide(jeton)) return { erreur: 'introuvable' };
  return rpc('demande_chambre_envoyer', { p_jeton: jeton, p_libelle: libelle, p_note: note || null, p_appareil: appareil });
}

export async function suivreDemandes({ jeton, appareil }) {
  if (estJetonDemo(jeton)) return (await demo()).suiviDemo();
  if (!jetonValide(jeton)) return { erreur: 'introuvable' };
  return rpc('demande_chambre_suivi', { p_jeton: jeton, p_appareil: appareil });
}
