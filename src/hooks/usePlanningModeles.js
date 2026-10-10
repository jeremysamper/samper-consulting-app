import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { MODELES_DEFAUT } from '../modules/planning/planningModeles.js';

// ─────────────────────────────────────────────────────────────────────────────
// usePlanningModeles - modèles d'horaires d'un établissement (table
// planning_modeles : nom + segments). Rucher et Woodland n'ont pas les mêmes
// services : chacun règle ses heures.
//
// Même contrat que usePlanningMasques :
//   status 'loading' | 'ready' | 'error' | 'absent' (table pas encore créée).
// Tant que l'établissement n'a rien réglé (ou sans la table), les modèles par
// défaut servent : la saisie en un geste marche toujours.
// Une lecture en échec ne vide jamais la liste ; elle est retentée.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'planning_modeles';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;
const REFUS = 'Seuls ceux qui gèrent le planning peuvent régler les modèles d\'horaires.';

function messageErreur(error) {
  console.error('[usePlanningModeles] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return 'Les modèles d\'horaires ne sont pas encore activés sur la base de données.';
  if (String(error.code) === '42501') return REFUS;
  return 'Erreur technique. Réessaie ou contacte le support.';
}

// Segment propre : heures HH:MM, pause entière, type connu ou 'simple'.
const segmentPropre = (s) => ({
  typeShift: ['midi', 'soir', 'longue', 'simple'].includes(s?.typeShift) ? s.typeShift : 'simple',
  debut: String(s?.debut || '').slice(0, 5),
  fin: String(s?.fin || '').slice(0, 5),
  pause: Math.max(0, Math.round(Number(s?.pause) || 0)),
});

const depuisLigne = (r) => ({
  id: r.id,
  nom: r.nom,
  ordre: r.ordre ?? 0,
  segments: (Array.isArray(r.segments) ? r.segments : []).map(segmentPropre).filter(s => s.debut && s.fin),
});

export function usePlanningModeles(etablissementId) {
  const [lignes, setLignes] = useState([]);
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!etablissementId) {
      setLignes([]);
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, nom, segments, ordre')
        .eq('etablissement_id', etablissementId);
      if (!mounted) return;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) { setLignes([]); setStatus('absent'); return; }
        console.error('[usePlanningModeles] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }
      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setLignes((data || []).map(depuisLigne));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setLignes([]);
    setStatus('loading');
    reload();

    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([TABLE], () => { if (mounted) reload(); })
      : null;

    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [etablissementId]);

  // Tri client (jamais dans .order()) : ordre puis nom.
  const regles = useMemo(
    () => [...lignes].filter(m => m.segments.length).sort((a, b) => (a.ordre - b.ordre) || a.nom.localeCompare(b.nom)),
    [lignes],
  );
  const personnalises = regles.length > 0;
  const modeles = personnalises ? regles : MODELES_DEFAUT;

  // Remplace tous les modèles de l'établissement par `liste`, d'un bloc, par la
  // fonction planning_modeles_remplacer : contrôle du droit et remplacement dans
  // la même transaction (un refus ne laisse jamais une liste à moitié écrite).
  // Une liste vide revient aux modèles par défaut.
  const enregistrer = useCallback(async (liste) => {
    const propres = liste
      .map(m => ({ nom: String(m.nom || '').trim(), segments: (m.segments || []).map(segmentPropre).filter(s => s.debut && s.fin) }))
      .filter(m => m.nom && m.segments.length);
    const { error } = await supabase.rpc('planning_modeles_remplacer', {
      p_etablissement_id: etablissementId,
      p_modeles: propres,
    });
    reloadRef.current?.();
    if (error) return { error: messageErreur(error) };
    return { error: null };
  }, [etablissementId]);

  return { modeles, personnalises, status, enregistrer };
}
