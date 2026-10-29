import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { mapAbsenceFromDB } from '../../utils/absences.js';
import { readJson } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { periodeEnCours, retardsDuJour, soldePersonne } from './soldesHeures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Contrats de travail (table contrats_travail, migration 20261030) et lectures
// du solde d'heures. Accès direct au client Supabase : legacySupabase.js n'en
// sait rien.
//
// Droits (RLS) : chacun lit son contrat ; qui gère le Planning lit et écrit
// ceux de l'établissement. La personne et l'établissement d'un contrat ne
// changent jamais (seules les colonnes du contrat sont modifiables).
// Statut 'absent' tant que la table n'existe pas : tout ce qui touche aux
// contrats se cache, sans erreur.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'contrats_travail';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

const MESSAGES_ERREUR = {
  '42501': 'Seuls ceux qui gèrent le planning peuvent saisir les contrats.',
  '23505': 'Cette personne a déjà un contrat sans date de fin : indiquez d\'abord la fin de l\'ancien.',
  '23514': 'Valeurs refusées : taux entre 1 et 100, heures par semaine entre 1 et 60, fin après le début.',
};

function messageErreur(error) {
  console.error('[contrats] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return 'Les contrats ne sont pas encore activés sur la base de données.';
  return MESSAGES_ERREUR[String(error.code || '')] || 'Erreur technique. Réessayez ou contactez le support.';
}

export function mapContratFromDB(r) {
  return {
    id: r.id,
    etablissementId: r.etablissement_id,
    profileId: r.profile_id,
    taux: Number(r.taux),
    heuresSemaine: Number(r.heures_semaine),
    vacancesJours: Number(r.vacances_jours),
    debut: r.debut,
    fin: r.fin || null,
    note: r.note || '',
  };
}

// Colonnes modifiables (grant de colonnes en base) : jamais la personne ni
// l'établissement dans une mise à jour.
const colonnesContrat = (c) => ({
  taux: Number(c.taux),
  heures_semaine: Number(c.heuresSemaine),
  vacances_jours: Number(c.vacancesJours),
  debut: c.debut,
  fin: c.fin || null,
  note: c.note ? String(c.note).trim() || null : null,
});

// Shifts et absences d'une période, lus en base (lecture stricte : une erreur
// remonte, un tableau vide veut dire « rien sur la période »).
export async function lirePeriode(etablissementId, debut, fin) {
  const bridge = dbService.getBridge();
  const [sh, ab] = await Promise.all([
    supabase.from('shifts').select('*').eq('etablissement_id', etablissementId).gte('date', debut).lte('date', fin).order('date').order('debut'),
    lireAbsences(etablissementId, debut, fin),
  ]);
  if (sh.error) throw sh.error;
  return { shifts: (sh.data || []).map(r => bridge.db.mapShiftFromDB(r)), absences: ab };
}

export async function lireAbsences(etablissementId, debut, fin) {
  const { data, error } = await supabase.from('absences').select('*')
    .eq('etablissement_id', etablissementId).lte('date_debut', fin).gte('date_fin', debut).limit(1000);
  if (error) {
    if (RELATION_ABSENTE.has(error.code)) return [];
    throw error;
  }
  return (data || []).map(mapAbsenceFromDB);
}

// ─── Contrats d'un établissement (ceux que la RLS laisse voir) ─────────────
export function useContrats(etablissementId) {
  const [contrats, setContrats] = useState([]);
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!etablissementId) {
      setContrats([]);
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const { data, error } = await supabase.from(TABLE).select('*').eq('etablissement_id', etablissementId);
      if (!mounted) return;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) { setContrats([]); setStatus('absent'); return; }
        console.error('[contrats] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }
      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setContrats((data || []).map(mapContratFromDB));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setContrats([]);
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
  }, [etablissementId]);

  // Crée (sans id) ou modifie un contrat. Rend { error } en clair.
  const enregistrer = useCallback(async (contrat) => {
    const requete = contrat.id
      ? supabase.from(TABLE).update(colonnesContrat(contrat)).eq('id', contrat.id).select().single()
      : supabase.from(TABLE).insert({ etablissement_id: etablissementId, profile_id: contrat.profileId, ...colonnesContrat(contrat) }).select().single();
    const { error } = await requete;
    reloadRef.current?.();
    return { error: error ? messageErreur(error) : null };
  }, [etablissementId]);

  return { contrats, status, enregistrer };
}

// ─── Chiffres de la direction : retards du jour, soldes négatifs du mois ───
// Le tableau de bord ne transmet pas l'établissement à ChiffresGestion : on
// lit le miroir sc_current_etab qu'écrit la coque (AppLayout), après le rendu
// (son effet passe après ceux des enfants, d'où l'attente d'une micro-tâche).
// Rien n'est lu au-delà des contrats tant que l'établissement n'en a aucun.
export function useRegulariteEquipe(actif) {
  const [etat, setEtat] = useState({ avecContrats: false });

  useEffect(() => {
    if (!actif) { setEtat({ avecContrats: false }); return undefined; }
    let vivant = true;
    const charger = async () => {
      await Promise.resolve();
      const etablissementId = readJson('sc_current_etab', null);
      if (!etablissementId) return;
      const aujourdhui = zurichToday();
      try {
        const { data, error } = await supabase.from(TABLE).select('*').eq('etablissement_id', etablissementId);
        if (error) throw error;
        const contrats = (data || []).map(mapContratFromDB);
        if (!contrats.length) { if (vivant) setEtat({ avecContrats: false }); return; }
        const periode = periodeEnCours(aujourdhui);
        const { shifts, absences } = await lirePeriode(etablissementId, periode.debut, aujourdhui);
        if (!vivant) return;
        const soldes = [...new Set(contrats.map(c => c.profileId))]
          .map(userId => soldePersonne({ userId, debut: periode.debut, fin: periode.fin, contrats, shifts, absences }))
          .filter(r => r.avecContrat);
        const negatifs = soldes.filter(r => r.solde < 0);
        setEtat({
          avecContrats: true,
          periode,
          retardsJour: retardsDuJour(shifts, aujourdhui),
          totalNegatif: negatifs.reduce((t, r) => t + r.solde, 0),
          personnesNegatives: negatifs.length,
        });
      } catch (err) {
        // Table absente ou lecture refusée : le bloc reste caché.
        if (!RELATION_ABSENTE.has(err?.code)) console.error('[contrats] chiffres de la direction', err);
      }
    };
    charger();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([TABLE, 'shifts', 'absences'], () => { if (vivant) charger(); })
      : null;
    return () => { vivant = false; if (unsub) unsub(); };
  }, [actif]);

  return etat;
}
