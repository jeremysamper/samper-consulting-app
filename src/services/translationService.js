// ════════════════════════════════════════════════════════════════
// translationService - traduction FR → EN d'un lot de chaînes.
//
// Utilisé par le moteur de traduction à la volée (src/i18n/domTranslator.js)
// pour tout ce que le glossaire statique ne couvre pas : contenu saisi par les
// équipes (recettes, étapes, notes, libellés personnalisés…).
//
// Le tableau renvoyé a la même longueur et le même ordre que l'entrée. Une
// entrée que l'IA n'a pas su traduire vaut `null` : l'appelant la laisse en
// français et pourra réessayer, plutôt que de mettre en cache un faux positif.
//
// Si l'IA renvoie un nombre d'éléments différent de l'entrée, TOUT le lot est
// rejeté : un décalage d'un cran collerait des libellés sur les mauvais
// écrans, ce qui est pire qu'une absence de traduction.
// ════════════════════════════════════════════════════════════════
import { callAiProxy } from './aiProxy.js';
import { supabase } from './supabase.js';

// Plafond de lignes rapatriées en une fois (aligné sur le cache local).
const SHARED_LIMIT = 5000;

/**
 * Lit le cache partagé de l'établissement (table `traductions`).
 *
 * `since` = date ISO du dernier import connu de cet appareil : on ne redemande
 * alors QUE les nouveautés ajoutées entre-temps par les collègues, au lieu de
 * retélécharger tout le cache à chaque session.
 *
 * @returns {Promise<{pairs: [string,string][], latest: string|null}>}
 */
export async function fetchSharedTranslations(etablissementId, since) {
  if (!etablissementId) return { pairs: [], latest: since || null };

  let query = supabase
    .from('traductions')
    .select('source, cible, created_at')
    .eq('etablissement_id', etablissementId)
    .eq('langue', 'en')
    .order('created_at', { ascending: true })
    .limit(SHARED_LIMIT);
  if (since) query = query.gt('created_at', since);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Lecture du cache de traduction impossible.');

  const rows = data || [];
  return {
    pairs: rows.map(r => [r.source, r.cible]),
    // On repart de la date de la dernière ligne reçue, pas de l'heure locale :
    // l'horloge d'une tablette de cuisine n'est pas une référence.
    latest: rows.length ? rows[rows.length - 1].created_at : (since || null),
  };
}

/**
 * Publie de nouvelles traductions pour toute la brigade.
 * Deux appareils qui traduisent la même phrase en même temps produisent un
 * doublon : il est ignoré, la première écriture fait foi.
 */
export async function pushSharedTranslations(etablissementId, entries) {
  if (!etablissementId || !entries || !entries.length) return;

  const rows = entries.map(([source, cible]) => ({
    etablissement_id: etablissementId, langue: 'en', source, cible,
  }));
  const { error } = await supabase
    .from('traductions')
    .upsert(rows, { onConflict: 'etablissement_id,langue,source_hash', ignoreDuplicates: true });
  if (error) throw new Error(error.message || 'Écriture du cache de traduction impossible.');
}

export async function translateTexts(texts) {
  const list = (texts || []).map((s) => String(s || '')).filter(Boolean);
  if (!list.length) return [];

  const data = await callAiProxy('translate', { texts: list, target: 'en' });
  const raw = (data && data.result && data.result.t) || [];

  if (!Array.isArray(raw) || raw.length !== list.length) {
    throw new Error(`Traduction désalignée : ${raw.length} réponses pour ${list.length} entrées.`);
  }

  return list.map((source, i) => {
    const out = raw[i];
    if (typeof out !== 'string' || !out.trim()) return null;
    return out.trim();
  });
}

export default translateTexts;
