import { supabase } from '../../../services/supabase.js';
import { generateUuid, isNetworkError, withTimeout } from '../../../services/offline/offlineNet.js';
import { normaliserFile, suiteDuRejeu } from './borneLogique.js';
import { CLE_FILE, lire } from './borneAppareil.js';

export { borneAuLancement, borneDeCetAppareil, oublierBorne, retenirBorne, revenirALaBorne, sortirDeLaBorne } from './borneAppareil.js';

// ─────────────────────────────────────────────────────────────────────────────
// Badgeuse : ce que l'appareil garde et ce qu'il demande à la base.
//
// Ce que l'appareil garde : le jeton remis à la déclaration (64 caractères
// hexadécimaux, 256 bits tirés par la base), avec le nom de la borne et de
// l'établissement pour l'affichage. La base n'a que son empreinte.
// Ce que la base exige à chaque appel : ce jeton (pointer_borne, borne_etat),
// jamais un nom ni un identifiant lisible.
// Qui révoque : la direction, dans Réglages > Planning > Pointage.
//
// La borne n'a pas de session : à l'ouverture, une session restée sur
// l'appareil est fermée, et la sortie de la borne mène à la connexion.
// ─────────────────────────────────────────────────────────────────────────────

// Aucune session personnelle sur une borne. La déconnexion attend les
// abonnés à l'authentification (ceux de l'app, quand elle est montée) :
// l'attente est bornée à 2 secondes, la borne refermera la session à son
// ouverture de toute façon.
export async function fermerSessionLocale() {
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((ok) => { setTimeout(ok, 2000); }),
    ]);
  } catch (err) { console.warn('[borne] fermeture de session', err); }
}

// ── Appels à la base ─────────────────────────────────────────────────────────

export async function etatDeLaBorne(jeton) {
  const { data, error } = await withTimeout(supabase.rpc('borne_etat', { p_jeton: jeton }));
  if (error) throw error;
  return data;
}

async function appelBorne(jeton, code, clientUuid, eventAt = null) {
  const { data, error } = await withTimeout(supabase.rpc('pointer_borne', {
    p_jeton: jeton, p_code: code, p_client_uuid: clientUuid, p_event_at: eventAt,
  }));
  if (error) throw error;
  return data;
}

// File hors ligne : codes tapés sans réseau, rejoués dans l'ordre du geste.
export const fileDeLaBorne = () => normaliserFile(lire(window.localStorage, CLE_FILE));
const ecrireFile = (file) => window.localStorage.setItem(CLE_FILE, JSON.stringify(file));

// Pointe en ligne ; réseau coupé ou trop lent : le code part en file, avec
// l'heure du geste, et la réponse dit « gardé sur la borne ». Un refus de la
// base (code faux, attente) revient tel quel.
export async function pointerALaBorne(jeton, code) {
  const clientUuid = generateUuid();
  const horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!horsLigne) {
    try {
      const r = await appelBorne(jeton, code, clientUuid);
      if (fileDeLaBorne().length) rejouerFile(jeton);
      return r;
    } catch (err) {
      if (!isNetworkError(err)) return { ok: false, raison: 'erreur', message: err?.message || '' };
    }
  }
  ecrireFile([...fileDeLaBorne(), { clientUuid, code, eventAt: new Date().toISOString() }]);
  return { ok: false, raison: 'hors_ligne' };
}

let rejeuEnCours = false;

// Rejoue la file. Rend 'oublier' quand la base ne reconnaît plus la borne.
export async function rejouerFile(jeton) {
  if (rejeuEnCours) return 'occupe';
  rejeuEnCours = true;
  try {
    for (const e of fileDeLaBorne()) {
      let r;
      try {
        r = await appelBorne(jeton, e.code, e.clientUuid, e.eventAt);
      } catch (err) {
        if (isNetworkError(err)) return 'reseau';
        r = { ok: false, raison: 'erreur' };
      }
      const suite = suiteDuRejeu(r);
      if (suite === 'attendre') return 'attendre';
      if (suite === 'oublier') return 'oublier';
      ecrireFile(fileDeLaBorne().filter((x) => x.clientUuid !== e.clientUuid));
    }
    return 'vide';
  } finally {
    rejeuEnCours = false;
  }
}

// ── Réglages (direction) et compte ───────────────────────────────────────────

export async function declarerBorne(etablissementId, nom) {
  const { data, error } = await supabase.rpc('borne_declarer', { p_etablissement_id: etablissementId, p_nom: nom });
  if (error) throw error;
  return data;
}

export async function revoquerBorne(id) {
  const { error } = await supabase.rpc('borne_revoquer', { p_borne_id: id });
  if (error) throw error;
}

export async function listerBornes(etablissementId) {
  const { data, error } = await supabase.from('bornes_pointage')
    .select('id, nom, creee_le, revoquee_le, dernier_usage_le')
    .eq('etablissement_id', etablissementId)
    .order('creee_le', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function codesDeLEquipe(etablissementId) {
  const { data, error } = await supabase.rpc('pointage_codes_equipe', { p_etablissement_id: etablissementId });
  if (error) throw error;
  return data || [];
}

export async function reinitialiserCode(userId, etablissementId) {
  const { error } = await supabase.rpc('pointage_code_reinitialiser', { p_user_id: userId, p_etablissement_id: etablissementId });
  if (error) throw error;
}

export async function etatDeMonCode(etablissementId) {
  const { data, error } = await supabase.rpc('pointage_code_etat', { p_etablissement_id: etablissementId });
  if (error) throw error;
  return data || { defini: false };
}

export async function definirMonCode(etablissementId, code) {
  const { data, error } = await supabase.rpc('pointage_code_definir', { p_etablissement_id: etablissementId, p_code: code });
  if (error) throw error;
  return data;
}
