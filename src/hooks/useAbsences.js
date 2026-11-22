import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { addDays, isoDate, parseLocalDate } from '../utils/dateHelpers.js';
import { zurichToday } from '../utils/zurichTime.js';
import { estAcceptee, mapAbsenceFromDB } from '../utils/absences.js';

// ─────────────────────────────────────────────────────────────────────────────
// useAbsences - absences de l'équipe d'un établissement (table absences).
//
// Même contrat que useGroupes :
//   status 'loading' | 'ready' | 'error' | 'absent' (migration 20260929 pas
//   encore appliquée : le planning et le tableau de bord masquent alors tout ce
//   qui touche aux absences, sans erreur).
// Une lecture en échec ne vide jamais la liste affichée ; elle est retentée.
//
// Fenêtre : les absences qui ne sont pas finies avant `depuis` (deux mois en
// arrière par défaut, pour que le planning montre aussi les semaines passées).
// `assurerDepuis` abaisse le plancher quand le planning remonte plus loin.
//
// Demandes de congé (migration 20261122) : la table porte aussi les demandes
// en attente et les refus, que la RLS ne rend qu'à la personne concernée et à
// qui gère le planning. `absences` ne garde que les absences acceptées (les
// lecteurs d'avant la lisent sans rien changer) ; `demandes`, les demandes en
// attente ; `lignes`, tout ce que la RLS rend (Mon planning y lit les siennes).
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'absences';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

const MESSAGES_ERREUR = {
  '42501': 'Seule la direction peut saisir ou retirer une absence.',
  demande: 'Vous ne pouvez demander un congé que pour vous.',
  decision: 'Seule la personne qui gère le planning peut accepter ou refuser une demande.',
  '23514': 'La date de fin doit être le même jour ou après la date de début (un an au plus).',
  '23503': 'Équipier introuvable.',
};

function messageErreur(error) {
  if (!error) return null;
  console.error('[useAbsences] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return "Les absences ne sont pas encore activées sur la base de données.";
  return MESSAGES_ERREUR[String(error.code || '')] || 'Erreur technique. Réessayez ou contactez le support.';
}

const plancherParDefaut = () => isoDate(addDays(parseLocalDate(zurichToday()), -62));

export function useAbsences(etablissementId, { depuis: depuisInitial } = {}) {
  const [lignes, setLignes] = useState([]);
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const [depuis, setDepuis] = useState(() => depuisInitial || plancherParDefaut());
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
        .select('*')
        .eq('etablissement_id', etablissementId)
        .gte('date_fin', depuis)
        .order('date_debut', { ascending: true })
        .limit(1000);
      if (!mounted) return;

      if (error) {
        if (RELATION_ABSENTE.has(error.code)) {
          setLignes([]);
          setStatus('absent');
          return;
        }
        console.error('[useAbsences] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }

      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setLignes((data || []).map(mapAbsenceFromDB));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setStatus('loading');
    reload();

    // subscribeReload rejoue aussi la lecture au réveil de l'appareil.
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
  }, [etablissementId, depuis]);

  const reload = useCallback(() => reloadRef.current?.(), []);

  const assurerDepuis = useCallback((dateISO) => {
    if (!dateISO) return;
    setDepuis((actuel) => (dateISO < actuel ? dateISO : actuel));
  }, []);

  const actions = useMemo(() => {
    async function creer({ userId, motif, dateDebut, dateFin }) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          etablissement_id: etablissementId,
          user_id: userId,
          motif,
          date_debut: dateDebut,
          date_fin: dateFin || dateDebut,
        })
        .select()
        .single();
      if (error) return { data: null, error: messageErreur(error) };
      const a = mapAbsenceFromDB(data);
      setLignes((liste) => [...liste.filter((x) => x.id !== a.id), a]
        .sort((x, y) => x.dateDebut.localeCompare(y.dateDebut)));
      return { data: a, error: null };
    }

    // Demande de congé de l'employé, pour lui-même : la RLS refuse toute
    // autre personne et tout autre statut.
    async function demander({ userId, motif, dateDebut, dateFin }) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          etablissement_id: etablissementId,
          user_id: userId,
          motif,
          date_debut: dateDebut,
          date_fin: dateFin || dateDebut,
          statut: 'demande',
        })
        .select()
        .single();
      if (error) return { data: null, error: String(error.code) === '42501' ? MESSAGES_ERREUR.demande : messageErreur(error) };
      const a = mapAbsenceFromDB(data);
      setLignes((liste) => [...liste.filter((x) => x.id !== a.id), a]
        .sort((x, y) => x.dateDebut.localeCompare(y.dateDebut)));
      return { data: a, error: null };
    }

    // Accepter ou refuser une demande (qui gère le planning). Une mise à jour
    // refusée par la RLS ne lève pas d'erreur : on relit la ligne écrite.
    async function decider(id, accepter) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ statut: accepter ? 'acceptee' : 'refusee', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('statut', 'demande')
        .select();
      if (error) return { error: messageErreur(error) };
      if (!data || !data.length) return { error: MESSAGES_ERREUR.decision };
      const a = mapAbsenceFromDB(data[0]);
      setLignes((liste) => liste.map((x) => (x.id === a.id ? a : x)));
      return { error: null };
    }

    async function supprimer(id) {
      // La RLS ne lève pas d'erreur sur une suppression refusée : elle ne
      // supprime rien. On relit donc les lignes réellement supprimées.
      const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
      if (error) return { error: messageErreur(error) };
      if (!data || !data.length) return { error: MESSAGES_ERREUR['42501'] };
      setLignes((liste) => liste.filter((x) => x.id !== id));
      return { error: null };
    }

    return { creer, demander, decider, supprimer };
  }, [etablissementId]);

  const absences = useMemo(() => lignes.filter(estAcceptee), [lignes]);
  const demandes = useMemo(() => lignes.filter((a) => a.statut === 'demande'), [lignes]);

  return { absences, demandes, lignes, status, reload, assurerDepuis, ...actions };
}
