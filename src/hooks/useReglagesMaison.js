import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { useReglageModifie } from '../services/reglagesSignal.js';
import { COLONNES, normaliserLigne, normaliserPointage, retenirReglesPointage, versBase } from '../utils/reglagesMaison.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la maison (table reglages_maison) : lecture partagée et écriture.
//
// Plusieurs écrans les lisent en même temps (Planning, tableau de bord, HACCP,
// Statistiques, page des réglages) : une lecture en vol par établissement, un
// cache de 30 s, et chaque écran monté relit au temps réel et au signal de la
// page des réglages ('reglages_maison').
//
// status : 'loading' | 'ready' | 'error' (lecture en échec : les défauts
// s'appliquent, rien n'est inventé) | 'absent' (migration pas appliquée : les
// défauts, et la page des réglages le dit).
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 30000;
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const cache = new Map(); // etabId -> { ligne, status, at }
const enVol = new Map(); // etabId -> Promise

async function lire(etabId, { force = false } = {}) {
  const c = cache.get(etabId);
  if (!force && c && c.status === 'ready' && Date.now() - c.at < TTL_MS) return c;
  if (enVol.has(etabId)) return enVol.get(etabId);
  const p = (async () => {
    const { data, error } = await supabase.from('reglages_maison').select('*').eq('etablissement_id', etabId).maybeSingle();
    let r;
    if (error) {
      r = RELATION_ABSENTE.has(error.code) ? { ligne: null, status: 'absent', at: Date.now() } : { ligne: c?.ligne || null, status: 'error', at: Date.now() };
      if (r.status === 'error') console.error('[reglages_maison] lecture', error);
    } else {
      r = { ligne: data || null, status: 'ready', at: Date.now() };
    }
    cache.set(etabId, r);
    if (r.status === 'ready') retenirReglesPointage(etabId, normaliserPointage(r.ligne?.pointage));
    return r;
  })().finally(() => enVol.delete(etabId));
  enVol.set(etabId, p);
  return p;
}

export function useReglagesMaison(etabId) {
  const depart = etabId ? cache.get(etabId) : null;
  const [etat, setEtat] = useState(() => ({
    ligne: depart?.ligne || null,
    status: !etabId ? 'ready' : (depart?.status || 'loading'),
  }));

  const recharger = useCallback(async (force = true) => {
    if (!etabId) return;
    const r = await lire(etabId, { force });
    setEtat({ ligne: r.ligne, status: r.status });
  }, [etabId]);

  useEffect(() => {
    if (!etabId) { setEtat({ ligne: null, status: 'ready' }); return undefined; }
    let vivant = true;
    lire(etabId).then((r) => { if (vivant) setEtat({ ligne: r.ligne, status: r.status }); });
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload(['reglages_maison'], () => { if (vivant) recharger(true); })
      : null;
    return () => { vivant = false; if (unsub) unsub(); };
  }, [etabId, recharger]);

  useReglageModifie('reglages_maison', () => recharger(true));

  // Écrit un bloc (fermetures, tempsTravail, pointage, objectifs), déjà sous sa
  // forme lisible ; les autres blocs de la ligne ne sont pas touchés.
  const enregistrer = useCallback(async (bloc, valeur) => {
    if (!etabId || !COLONNES[bloc]) return { error: 'Réglage inconnu.' };
    const { data, error } = await supabase.from('reglages_maison')
      .upsert({ etablissement_id: etabId, [COLONNES[bloc]]: versBase[bloc](valeur) }, { onConflict: 'etablissement_id' })
      .select().single();
    if (error) {
      console.error('[reglages_maison] écriture', error);
      return { error: error.code === '42501' ? "Ce réglage est réservé à la direction." : "L'enregistrement a échoué. Réessayez." };
    }
    cache.set(etabId, { ligne: data, status: 'ready', at: Date.now() });
    retenirReglesPointage(etabId, normaliserPointage(data?.pointage));
    setEtat({ ligne: data, status: 'ready' });
    return { error: null };
  }, [etabId]);

  // Objets stables tant que la ligne ne change pas : un écran peut les mettre
  // en dépendance d'un useMemo.
  const lisible = useMemo(() => normaliserLigne(etat.ligne), [etat.ligne]);
  return { ...lisible, status: etat.status, enregistrer, recharger };
}
