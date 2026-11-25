import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { useReglageModifie } from '../services/reglagesSignal.js';
import { fusionnerConfig, lireReglagesModule } from '../utils/reglagesModules.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages d'un module (table reglages_modules) : lecture partagée et écriture.
//
// Le module et sa section des réglages lisent la même ligne : une lecture en
// vol par établissement et par module, un cache de 30 s, et chaque écran monté
// relit au temps réel et au signal de la page des réglages
// ('reglages_modules:<module>').
//
// status : 'loading' | 'ready' | 'error'. En échec de lecture, les défauts
// s'appliquent (le comportement d'avant le réglage) et rien n'est inventé.
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 30000;
const cache = new Map(); // `${etab}:${module}` -> { config, status, at }
const enVol = new Map();

export const signalReglagesModule = (module) => `reglages_modules:${module}`;

async function lire(etabId, module, { force = false } = {}) {
  const cle = `${etabId}:${module}`;
  const c = cache.get(cle);
  if (!force && c && c.status === 'ready' && Date.now() - c.at < TTL_MS) return c;
  if (enVol.has(cle)) return enVol.get(cle);
  const p = (async () => {
    const { data, error } = await supabase.from('reglages_modules')
      .select('config').eq('etablissement_id', etabId).eq('module', module).maybeSingle();
    let r;
    if (error) {
      console.error('[reglages_modules] lecture', module, error);
      r = { config: c?.config || null, status: 'error', at: Date.now() };
    } else {
      r = { config: data?.config || null, status: 'ready', at: Date.now() };
    }
    cache.set(cle, r);
    return r;
  })().finally(() => enVol.delete(cle));
  enVol.set(cle, p);
  return p;
}

// Écrit les clés changées sur la config d'avant (les autres clés de la ligne
// sont gardées). Hors du crochet pour la reprise d'un autre établissement
// (lot 02 du panel), qui écrit par le même chemin : même requête, mêmes
// messages, même cache. Le crochet passe la config de son cache, la reprise
// celle qu'elle vient de relire.
export async function ecrireConfigModule(etabId, module, changes, configAvant) {
  if (!etabId) return { error: 'Aucun établissement choisi.' };
  const config = fusionnerConfig(configAvant, changes);
  const { data, error } = await supabase.from('reglages_modules')
    .upsert({ etablissement_id: etabId, module, config }, { onConflict: 'etablissement_id,module' })
    .select('config').single();
  if (error) {
    console.error('[reglages_modules] écriture', module, error);
    return {
      error: String(error.code) === '42501'
        ? 'Ce réglage est réservé à la direction de la maison.'
        : "L'enregistrement a échoué. Réessayez.",
    };
  }
  const r = { config: data?.config ?? config, status: 'ready', at: Date.now() };
  cache.set(`${etabId}:${module}`, r);
  return { error: null, config: r.config };
}

export function useReglagesModule(etabId, module) {
  const depart = etabId ? cache.get(`${etabId}:${module}`) : null;
  const [etat, setEtat] = useState(() => ({
    config: depart?.config || null,
    status: !etabId ? 'ready' : (depart?.status || 'loading'),
  }));

  const recharger = useCallback(async () => {
    if (!etabId) return;
    const r = await lire(etabId, module, { force: true });
    setEtat({ config: r.config, status: r.status });
  }, [etabId, module]);

  useEffect(() => {
    if (!etabId) { setEtat({ config: null, status: 'ready' }); return undefined; }
    let vivant = true;
    lire(etabId, module).then((r) => { if (vivant) setEtat({ config: r.config, status: r.status }); });
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload(['reglages_modules'], () => { if (vivant) recharger(); })
      : null;
    return () => { vivant = false; if (unsub) unsub(); };
  }, [etabId, module, recharger]);

  useReglageModifie(signalReglagesModule(module), () => recharger());

  // Écrit les clés changées ; les autres clés de la ligne sont gardées.
  const enregistrer = useCallback(async (changes) => {
    const r = await ecrireConfigModule(etabId, module, changes, cache.get(`${etabId}:${module}`)?.config ?? etat.config);
    if (!r.error) setEtat({ config: r.config, status: 'ready' });
    return { error: r.error };
  }, [etabId, module, etat.config]);

  const reglages = useMemo(() => lireReglagesModule(module, etat.config), [module, etat.config]);
  return { reglages, config: etat.config, status: etat.status, enregistrer, recharger };
}
