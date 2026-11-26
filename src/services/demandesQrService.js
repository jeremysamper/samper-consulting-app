import { supabase } from './supabase.js';

// Demande par le QR de la chambre, côté app (lot 17 du panel, migration
// 20261125_lot17_demandes_qr_chambre).
//
//   Réglages (demandes_qr_parametres) : lus par l'équipe, écrits par
//   consultant et patron (la base refuse les autres rôles).
//   Jetons (demandes_qr_chambres) : lus par la direction seule, écrits par
//   les RPC demandes_qr_preparer et demandes_qr_renouveler.
//
// Lectures : { data, error }, jamais un tableau vide en cas d'échec.

const MESSAGES = {
  42501: 'Seule la direction modifie ces réglages.',
  23514: 'Réglage refusé : 40 demandes au plus, de 60 caractères chacune.',
};

function messageErreur(error, repli) {
  if (!error) return null;
  console.error('[demandesQrService]', error.code || '', error.message || '');
  const code = String(error.code || '');
  if (MESSAGES[code]) return MESSAGES[code];
  if (/DEMANDES_QR_REFUSE/.test(String(error.message || ''))) return MESSAGES[42501];
  return repli || 'Erreur technique. Réessayez.';
}

export const REGLAGES_DEMANDES_QR_DEFAUT = { actif: false, libelles: [] };

export async function lireReglagesDemandesQr(etabId) {
  const { data, error } = await supabase
    .from('demandes_qr_parametres')
    .select('etablissement_id, actif, libelles, updated_at')
    .eq('etablissement_id', etabId)
    .maybeSingle();
  if (error) return { data: null, error: messageErreur(error, 'Réglages illisibles. Réessayez.') };
  return {
    data: data ? { actif: data.actif === true, libelles: Array.isArray(data.libelles) ? data.libelles : [] } : { ...REGLAGES_DEMANDES_QR_DEFAUT },
    error: null,
  };
}

// Écrit la ligne entière de l'établissement (upsert sur la clé).
export async function ecrireReglagesDemandesQr(etabId, { actif, libelles }) {
  const { data, error } = await supabase
    .from('demandes_qr_parametres')
    .upsert({ etablissement_id: etabId, actif: Boolean(actif), libelles: libelles || [] }, { onConflict: 'etablissement_id' })
    .select('etablissement_id, actif, libelles')
    .maybeSingle();
  if (error) return { data: null, error: messageErreur(error) };
  if (!data) return { data: null, error: MESSAGES[42501] };
  return { data: { actif: data.actif === true, libelles: Array.isArray(data.libelles) ? data.libelles : [] }, error: null };
}

// Jetons des chambres de l'établissement : { [chambreId]: jeton }.
export async function lireJetonsChambres(etabId) {
  const { data, error } = await supabase
    .from('demandes_qr_chambres')
    .select('chambre_id, jeton')
    .eq('etablissement_id', etabId);
  if (error) return { data: null, error: messageErreur(error, 'Les QR des chambres ne se lisent pas. Réessayez.') };
  const jetons = {};
  (data || []).forEach((r) => { jetons[r.chambre_id] = r.jeton; });
  return { data: jetons, error: null };
}

// Crée le jeton manquant de chaque chambre active ; rend { crees }.
export async function preparerJetons(etabId) {
  const { data, error } = await supabase.rpc('demandes_qr_preparer', { p_etablissement_id: etabId });
  if (error) return { data: null, error: messageErreur(error) };
  return { data, error: null };
}

// Nouveau jeton pour une chambre : l'ancien QR ne mène plus nulle part.
export async function renouvelerJeton(chambreId) {
  const { data, error } = await supabase.rpc('demandes_qr_renouveler', { p_chambre_id: chambreId });
  if (error) return { data: null, error: messageErreur(error) };
  return { data, error: null };
}
