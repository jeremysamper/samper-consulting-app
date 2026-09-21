import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { addDays, isoDate, parseLocalDate } from '../utils/dateHelpers.js';
import { zurichToday } from '../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// useGroupes - groupes réservés d'un établissement (table groupe_evenements).
//
// `status` dit ce qu'on détient réellement :
//   'loading' aucune lecture n'a encore abouti
//   'ready'   données fiables (la liste peut être légitimement vide)
//   'error'   la première lecture a échoué, rien à afficher
//   'absent'  la table n'existe pas : migration 20260920 pas encore appliquée
// Une lecture en échec ne vide JAMAIS la liste déjà affichée : une tablette qui
// sort de veille avec un JWT expiré ne doit pas annoncer « aucun groupe » à une
// brigade qui a un mariage samedi. Elle garde la dernière version et réessaie.
//
// Fenêtre de lecture : tout ce qui est postérieur à `depuis` (deux mois en
// arrière par défaut). Le volume est minuscule - quelques groupes par semaine -
// donc on ne pagine pas par mois : naviguer vers l'avenir ne relit rien, et
// `assurerDepuis` abaisse le plancher quand on remonte plus loin dans le passé.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'groupe_evenements';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;
const JOURS_PASSES_PAR_DEFAUT = 62;

const MESSAGES_ERREUR = {
  '23503': 'Établissement introuvable.',
  '23514': 'Une des valeurs saisies est refusée (couverts, type ou numéro de menu).',
  '42501': "Tu n'as pas les droits pour cette action.",
};

function messageErreur(error) {
  if (!error) return null;
  console.error('[useGroupes] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) {
    return "Le module Groupes n'est pas encore activé sur la base de données.";
  }
  return MESSAGES_ERREUR[String(error.code || '')]
    || 'Erreur technique. Réessaie ou contacte le support.';
}

export function mapGroupeFromDB(row) {
  if (!row) return null;
  return {
    id: row.id,
    etablissementId: row.etablissement_id,
    dateEvenement: row.date_evenement,
    heure: row.heure ? String(row.heure).slice(0, 5) : '',
    typeGroupe: row.type_groupe,
    menuNumero: row.menu_numero ?? null,
    nom: row.nom || '',
    contact: row.contact || '',
    nbPax: Number(row.nb_pax) || 0,
    allergenesIds: Array.isArray(row.allergenes_ids) ? row.allergenes_ids : [],
    allergiesNote: row.allergies_note || '',
    modifications: row.modifications || '',
    commentaires: row.commentaires || '',
    statut: row.statut || 'a_lire',
    luPar: row.lu_par || null,
    luAt: row.lu_at || null,
    pretPar: row.pret_par || null,
    pretAt: row.pret_at || null,
    modifieAt: row.modifie_at || null,
    annule: row.annule === true,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
  };
}

// Seuls les champs de contenu partent en base : l'état et ses horodatages sont
// posés par le trigger, jamais par le formulaire.
function contenuVersDB(g) {
  const texte = (v) => { const t = String(v ?? '').trim(); return t || null; };
  return {
    date_evenement: g.dateEvenement,
    heure: g.heure ? g.heure : null,
    type_groupe: g.typeGroupe,
    menu_numero: g.menuNumero || null,
    nom: String(g.nom || '').trim(),
    contact: texte(g.contact),
    nb_pax: Math.round(Number(g.nbPax) || 0),
    allergenes_ids: Array.isArray(g.allergenesIds) ? g.allergenesIds : [],
    allergies_note: texte(g.allergiesNote),
    modifications: texte(g.modifications),
    commentaires: texte(g.commentaires),
  };
}

const plancherParDefaut = () =>
  isoDate(addDays(parseLocalDate(zurichToday()), -JOURS_PASSES_PAR_DEFAUT));

export function useGroupes(etablissementId) {
  const [groupes, setGroupes] = useState([]);
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const [depuis, setDepuis] = useState(plancherParDefaut);
  const reloadRef = useRef(null);
  // Dernière liste connue, lue de façon synchrone par l'affichage optimiste.
  const groupesRef = useRef(groupes);
  groupesRef.current = groupes;

  useEffect(() => {
    if (!etablissementId) {
      setGroupes([]);
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
        .gte('date_evenement', depuis)
        .order('date_evenement', { ascending: true })
        .order('heure', { ascending: true, nullsFirst: true })
        .limit(2000);
      if (!mounted) return;

      if (error) {
        if (RELATION_ABSENTE.has(error.code)) {
          // Rien à réessayer : la table n'apparaîtra pas toute seule.
          console.warn('[useGroupes] table absente, migration non appliquée');
          setGroupes([]);
          setStatus('absent');
          return;
        }
        console.error('[useGroupes] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }

      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setGroupes((data || []).map(mapGroupeFromDB));
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

  // Abaisse le plancher de lecture quand le calendrier remonte avant lui.
  const assurerDepuis = useCallback((dateISO) => {
    if (!dateISO) return;
    setDepuis((actuel) => (dateISO < actuel ? dateISO : actuel));
  }, []);

  const actions = useMemo(() => {
    const remplacer = (row) => {
      const g = mapGroupeFromDB(row);
      if (!g) return;
      setGroupes((liste) => {
        const sans = liste.filter((x) => x.id !== g.id);
        return [...sans, g].sort((a, b) =>
          a.dateEvenement.localeCompare(b.dateEvenement) || (a.heure || '').localeCompare(b.heure || ''));
      });
    };

    async function creer(groupe) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...contenuVersDB(groupe), etablissement_id: etablissementId })
        .select()
        .single();
      if (error) return { data: null, error: messageErreur(error) };
      remplacer(data);
      return { data: mapGroupeFromDB(data), error: null };
    }

    async function modifier(id, groupe) {
      const { data, error } = await supabase
        .from(TABLE)
        .update(contenuVersDB(groupe))
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: messageErreur(error) };
      remplacer(data);
      return { data: mapGroupeFromDB(data), error: null };
    }

    // Affichage optimiste : la case change de couleur sous le doigt, la base
    // confirme (et pose « lu par » / l'heure) dans la foulée.
    async function changerStatut(id, statut) {
      const avant = groupesRef.current.find((g) => g.id === id) || null;
      setGroupes((liste) => liste.map((g) => (g.id === id ? { ...g, statut } : g)));
      const { data, error } = await supabase
        .from(TABLE)
        .update({ statut })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if (avant) setGroupes((liste) => liste.map((g) => (g.id === id ? avant : g)));
        return { data: null, error: messageErreur(error) };
      }
      remplacer(data);
      return { data: mapGroupeFromDB(data), error: null };
    }

    async function annuler(id, annule = true) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ annule: !!annule })
        .eq('id', id)
        .select()
        .single();
      if (error) return { data: null, error: messageErreur(error) };
      remplacer(data);
      return { data: mapGroupeFromDB(data), error: null };
    }

    return { creer, modifier, changerStatut, annuler };
  }, [etablissementId]);

  return { groupes, status, reload, assurerDepuis, ...actions };
}
