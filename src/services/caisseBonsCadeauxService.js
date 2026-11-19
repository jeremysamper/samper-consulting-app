import { supabase } from './supabase.js';
import { toutesLesPages } from '../utils/lirePages.js';
import { MESSAGES_BONS_CADEAUX, normaliserCode } from '../modules/caisse/bonsCadeaux/codeBon.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bons cadeaux de la caisse (migration 20261119_caisse_bons_cadeaux).
//
// Lectures directes (RLS : membres de l'établissement), écritures par les RPC
// seulement : le client n'a aucun droit d'écriture sur ces tables. Comme le
// reste de la caisse, une lecture en échec rend { error } et jamais une liste
// vide : « aucun bon » et « bons illisibles » ne se ressemblent pas à l'écran.
// Le paiement par bon passe par caisse_encaisser (caisseService.encaisserTicket,
// clé bonCadeau d'un paiement).
// ─────────────────────────────────────────────────────────────────────────────

function mapError(error, fallback) {
  if (!error) return null;
  console.error('[caisseBonsCadeaux]', error);
  const brut = String(error.message || '');
  if (MESSAGES_BONS_CADEAUX[brut]) return MESSAGES_BONS_CADEAUX[brut];
  if (String(error.code || '') === '42501' || brut === 'caisse: acces refuse') return "Vous n'avez pas les droits pour cette action.";
  if (brut === 'caisse: motif invalide (3 a 300 caracteres)') return 'Motif trop court ou trop long.';
  if (brut === 'caisse: moyen de paiement inconnu') return 'Moyen de paiement inconnu.';
  return fallback || 'Erreur technique. Réessayez.';
}

export async function listBonsCadeaux(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_bons_cadeaux')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .order('emis_at', { ascending: false })
    .limit(1000);
  if (error) return { data: null, error: mapError(error, 'Les bons cadeaux ne se lisent pas. Réessayez.') };
  return { data: data || [], error: null };
}

// Les mouvements d'argent depuis une date (repères du mois).
export async function listMouvementsDepuis(etablissementId, depuisIso) {
  const { data, error } = await supabase
    .from('caisse_bons_cadeaux_mouvements')
    .select('id, bon_id, genre, montant, moyen, libelle, jour_exploitation, created_at')
    .eq('etablissement_id', etablissementId)
    .gte('created_at', depuisIso)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) return { data: null, error: mapError(error, 'Le registre des bons ne se lit pas.') };
  return { data: data || [], error: null };
}

// Le registre d'argent des bons jusqu'à un jour d'exploitation compris, pour
// les rapports de la caisse : ventes, rendus, dépenses et recrédits ; « en
// circulation » se rejoue depuis le premier mouvement. Toutes les pages, ou
// une erreur : jamais un registre tronqué.
export async function listMouvementsRapport(etablissementId, fin) {
  const { data, error } = await toutesLesPages((de, a) => supabase
    .from('caisse_bons_cadeaux_mouvements')
    .select('id, genre, montant, moyen, libelle, jour_exploitation')
    .eq('etablissement_id', etablissementId)
    .in('genre', ['emission', 'annulation', 'utilisation', 'recredit'])
    .lte('jour_exploitation', fin)
    .order('id', { ascending: true })
    .range(de, a));
  if (error) return { data: null, error: mapError(error, 'Le registre des bons ne se lit pas.') };
  return { data: data || [], error: null };
}

export async function listMouvementsBon(bonId) {
  const { data, error } = await supabase
    .from('caisse_bons_cadeaux_mouvements')
    .select('id, genre, montant, moyen, libelle, jour_exploitation, detail, created_at, ticket:caisse_tickets(annee, numero)')
    .eq('bon_id', bonId)
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: mapError(error, "L'historique du bon ne se lit pas.") };
  return { data: data || [], error: null };
}

// Un bon par son code, dans l'établissement. data null = aucun bon de ce code.
export async function trouverBonCadeau(etablissementId, texte) {
  const code = normaliserCode(texte);
  if (!code) return { data: null, error: 'Code illisible : huit signes, comme ABCD-EFGH.' };
  const { data, error } = await supabase
    .from('caisse_bons_cadeaux')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .eq('code', code)
    .maybeSingle();
  if (error) return { data: null, error: mapError(error, 'Le bon ne se lit pas. Réessayez.') };
  return { data: data || null, error: null };
}

export async function emettreBonCadeau({ etablissementId, montant, nom, telephone, moyen, libelle = null, valableJusquAu = null, message = null }) {
  const { data, error } = await supabase.rpc('caisse_bon_cadeau_emettre', {
    p_etablissement_id: etablissementId,
    p_montant: montant,
    p_nom: nom,
    p_telephone: telephone,
    p_moyen: moyen,
    p_libelle: libelle,
    p_valable_jusqu_au: valableJusquAu,
    p_message: message,
  });
  if (error) return { data: null, error: mapError(error, "Le bon n'a pas pu être créé. Réessayez.") };
  return { data, error: null };
}

export async function annulerBonCadeau({ bonId, motif, moyen = null, libelle = null }) {
  const { data, error } = await supabase.rpc('caisse_bon_cadeau_annuler', {
    p_bon_id: bonId, p_motif: motif, p_moyen: moyen, p_libelle: libelle,
  });
  if (error) return { data: null, error: mapError(error, "Le bon n'a pas pu être annulé. Réessayez.") };
  return { data, error: null };
}

export async function prolongerBonCadeau(bonId, valableJusquAu) {
  const { data, error } = await supabase.rpc('caisse_bon_cadeau_prolonger', {
    p_bon_id: bonId, p_valable_jusqu_au: valableJusquAu,
  });
  if (error) return { data: null, error: mapError(error, "La validité n'a pas pu changer. Réessayez.") };
  return { data, error: null };
}
