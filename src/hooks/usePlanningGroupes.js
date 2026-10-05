import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// usePlanningGroupes - groupes du Planning & Pointage d'un établissement
// (Salle, Cuisine, plus ceux ajoutés), affectation des personnes, et comptes
// de pointage partagés (migration 20261005_planning_groupes_postes).
//
// Même contrat que usePlanningMasques :
//   status 'loading' | 'ready' | 'error' | 'absent' (migration pas encore
//   appliquée : aucun groupe, le planning s'affiche comme avant).
// Une lecture en échec ne vide jamais ce qui est affiché ; elle est retentée.
//
// Groupe d'une personne (même règle que planning_groupe_de() en base) : son
// affectation, sinon le groupe de la famille de son rôle (serveur et hote en
// Salle, cuisinier et resp_cuisine en Cuisine), sinon aucun.
// ─────────────────────────────────────────────────────────────────────────────

const TABLES = ['planning_groupes', 'planning_groupe_membres', 'pointage_postes'];
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;
const REFUS_GROUPES = 'Seules les personnes qui gèrent le planning peuvent modifier les groupes.';
const REFUS_POSTES = 'Seuls le patron et le consultant peuvent régler les comptes de pointage partagés.';

export function familleDuRole(role) {
  if (role === 'serveur' || role === 'hote') return 'salle';
  if (role === 'cuisinier' || role === 'resp_cuisine') return 'cuisine';
  return null;
}

function messageErreur(error, refus) {
  console.error('[usePlanningGroupes] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return 'Les groupes ne sont pas encore activés sur la base de données.';
  if (String(error.code) === '42501') return refus;
  if (String(error.code) === '23505') return 'Un groupe porte déjà ce nom.';
  if (String(error.code) === '23514') return 'Nom de groupe invalide (1 à 40 caractères).';
  return 'Erreur technique. Réessaie ou contacte le support.';
}

export function usePlanningGroupes(etablissementId) {
  const [groupes, setGroupes] = useState([]);
  const [membres, setMembres] = useState([]); // [{ user_id, groupe_id }]
  const [postes, setPostes] = useState([]);   // [{ user_id, groupe_id }]
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!etablissementId) {
      setGroupes([]); setMembres([]); setPostes([]);
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const [g, m, p] = await Promise.all([
        supabase.from('planning_groupes').select('id, nom, famille, ordre').eq('etablissement_id', etablissementId),
        supabase.from('planning_groupe_membres').select('user_id, groupe_id').eq('etablissement_id', etablissementId),
        supabase.from('pointage_postes').select('user_id, groupe_id').eq('etablissement_id', etablissementId),
      ]);
      if (!mounted) return;

      const error = g.error || m.error || p.error;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) {
          setGroupes([]); setMembres([]); setPostes([]);
          setStatus('absent');
          return;
        }
        console.error('[usePlanningGroupes] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }

      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setGroupes(g.data || []);
      setMembres(m.data || []);
      setPostes(p.data || []);
      setStatus('ready');
    };

    reloadRef.current = reload;
    setGroupes([]); setMembres([]); setPostes([]);
    setStatus('loading');
    reload();

    // subscribeReload rejoue aussi la lecture au réveil de l'appareil.
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload(TABLES, () => { if (mounted) reload(); })
      : null;

    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [etablissementId]);

  // Groupes triés : ordre puis nom.
  const groupesTries = useMemo(
    () => [...groupes].sort((a, b) => (a.ordre - b.ordre) || a.nom.localeCompare(b.nom, 'fr')),
    [groupes]
  );

  const affectations = useMemo(() => {
    const map = new Map();
    membres.forEach((r) => map.set(r.user_id, r.groupe_id));
    return map;
  }, [membres]);

  // groupeDe(personne) → id du groupe, ou null (« Sans groupe »).
  const groupeDe = useCallback((personne) => {
    if (!personne) return null;
    const explicite = affectations.get(personne.id);
    if (explicite && groupes.some((g) => g.id === explicite)) return explicite;
    const famille = familleDuRole(personne.role);
    if (!famille) return null;
    return groupes.find((g) => g.famille === famille)?.id || null;
  }, [affectations, groupes]);

  // Comptes de pointage partagés : user_id → Set(groupe_id).
  const postesParCompte = useMemo(() => {
    const map = new Map();
    postes.forEach((r) => {
      if (!map.has(r.user_id)) map.set(r.user_id, new Set());
      map.get(r.user_id).add(r.groupe_id);
    });
    return map;
  }, [postes]);

  const creerGroupe = useCallback(async (nom) => {
    const propre = (nom || '').trim();
    if (!propre) return { error: 'Donne un nom au groupe.' };
    const ordre = groupes.reduce((max, g) => Math.max(max, g.ordre || 0), 0) + 1;
    const { data, error } = await supabase
      .from('planning_groupes')
      .insert({ etablissement_id: etablissementId, nom: propre, ordre })
      .select('id, nom, famille, ordre')
      .single();
    if (error) return { error: messageErreur(error, REFUS_GROUPES) };
    setGroupes((liste) => [...liste, data]);
    return { error: null };
  }, [etablissementId, groupes]);

  const renommerGroupe = useCallback(async (id, nom) => {
    const propre = (nom || '').trim();
    if (!propre) return { error: 'Donne un nom au groupe.' };
    // La RLS ne lève pas d'erreur sur une modification refusée : on relit.
    const { data, error } = await supabase
      .from('planning_groupes')
      .update({ nom: propre })
      .eq('id', id)
      .select('id, nom, famille, ordre');
    if (error) return { error: messageErreur(error, REFUS_GROUPES) };
    if (!data || !data.length) { reloadRef.current?.(); return { error: REFUS_GROUPES }; }
    setGroupes((liste) => liste.map((g) => (g.id === id ? data[0] : g)));
    return { error: null };
  }, []);

  const supprimerGroupe = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('planning_groupes')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) return { error: messageErreur(error, REFUS_GROUPES) };
    if (!data || !data.length) { reloadRef.current?.(); return { error: REFUS_GROUPES }; }
    setGroupes((liste) => liste.filter((g) => g.id !== id));
    setMembres((liste) => liste.filter((r) => r.groupe_id !== id));
    setPostes((liste) => liste.filter((r) => r.groupe_id !== id));
    return { error: null };
  }, []);

  // Change une personne de groupe. groupeId null = retour au groupe de son rôle.
  const affecter = useCallback(async (userId, groupeId) => {
    if (!groupeId) {
      const { error } = await supabase
        .from('planning_groupe_membres')
        .delete()
        .eq('etablissement_id', etablissementId)
        .eq('user_id', userId);
      if (error) return { error: messageErreur(error, REFUS_GROUPES) };
      setMembres((liste) => liste.filter((r) => r.user_id !== userId));
      return { error: null };
    }
    const { data, error } = await supabase
      .from('planning_groupe_membres')
      .upsert(
        { etablissement_id: etablissementId, user_id: userId, groupe_id: groupeId, updated_at: new Date().toISOString() },
        { onConflict: 'etablissement_id,user_id' }
      )
      .select('user_id, groupe_id');
    if (error) return { error: messageErreur(error, REFUS_GROUPES) };
    if (!data || !data.length) { reloadRef.current?.(); return { error: REFUS_GROUPES }; }
    setMembres((liste) => [...liste.filter((r) => r.user_id !== userId), data[0]]);
    return { error: null };
  }, [etablissementId]);

  // Rattache (actif = true) ou détache un compte de pointage partagé d'un groupe.
  const reglerPoste = useCallback(async (userId, groupeId, actif) => {
    if (actif) {
      const { error } = await supabase
        .from('pointage_postes')
        .upsert(
          { etablissement_id: etablissementId, user_id: userId, groupe_id: groupeId },
          { onConflict: 'user_id,groupe_id', ignoreDuplicates: true }
        );
      if (error) return { error: messageErreur(error, REFUS_POSTES) };
      setPostes((liste) => (liste.some((r) => r.user_id === userId && r.groupe_id === groupeId)
        ? liste : [...liste, { user_id: userId, groupe_id: groupeId }]));
      return { error: null };
    }
    const { data, error } = await supabase
      .from('pointage_postes')
      .delete()
      .eq('user_id', userId)
      .eq('groupe_id', groupeId)
      .select('user_id');
    if (error) return { error: messageErreur(error, REFUS_POSTES) };
    if (!data || !data.length) { reloadRef.current?.(); return { error: REFUS_POSTES }; }
    setPostes((liste) => liste.filter((r) => !(r.user_id === userId && r.groupe_id === groupeId)));
    return { error: null };
  }, [etablissementId]);

  return {
    status,
    groupes: groupesTries,
    affectations,
    groupeDe,
    postesParCompte,
    creerGroupe,
    renommerGroupe,
    supprimerGroupe,
    affecter,
    reglerPoste,
  };
}
