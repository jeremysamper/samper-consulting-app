import React from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import { notify } from '../../components/toast/index.js';
import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { FENETRE_HAUSSES_JOURS, SEUIL_HAUSSE_DEFAUT, haussesPrix } from './analysesAchats.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hausses de prix fournisseur : seuil de l'établissement et hausses vues
// (migration 20261118_achats_hausses_prix).
//   - seuil : compta_reglages.seuil_hausse_prix_pct (5 par défaut) ; ligne ou
//     colonne absente : le défaut ;
//   - vues : achats_hausses_vues, partagées par la direction (un « vu » posé
//     par l'un retire la hausse chez les autres, en temps réel).
// Les hausses elles-mêmes se calculent depuis les documents d'achat déjà lus
// par l'écran (haussesPrix), sur les FENETRE_HAUSSES_JOURS derniers jours.
// ─────────────────────────────────────────────────────────────────────────────

const ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202', '42703', 'PGRST204']);
export const ID_REGLAGE_HAUSSES = 'achats_hausses';

export async function lireSeuilHausse(etabId) {
  const { data, error } = await supabase.from('compta_reglages')
    .select('seuil_hausse_prix_pct').eq('etablissement_id', etabId).maybeSingle();
  if (error) {
    if (ABSENTE.has(String(error.code))) return SEUIL_HAUSSE_DEFAUT;
    throw error;
  }
  const v = Number(data?.seuil_hausse_prix_pct);
  return Number.isFinite(v) && v > 0 ? v : SEUIL_HAUSSE_DEFAUT;
}

// Même écriture que les réglages de la Comptabilité : mise à jour, sinon
// création de la ligne de l'établissement (les autres colonnes à leur défaut).
export async function enregistrerSeuilHausse(etabId, pct, userId) {
  const colonnes = { seuil_hausse_prix_pct: pct, updated_by: userId };
  const maj = () => supabase.from('compta_reglages').update(colonnes).eq('etablissement_id', etabId).select('etablissement_id');
  let { data, error } = await maj();
  if (!error && (!data || !data.length)) {
    const ins = await supabase.from('compta_reglages').insert({ etablissement_id: etabId, ...colonnes });
    if (ins.error && String(ins.error.code) === '23505') ({ error } = await maj());
    else error = ins.error;
  }
  if (error) throw error;
}

// Map cle → { vuPar, vuLe }. null : table absente (migration non appliquée).
export async function lireHaussesVues(etabId) {
  const { data, error } = await supabase.from('achats_hausses_vues')
    .select('cle, vu_par, vu_le').eq('etablissement_id', etabId);
  if (error) {
    if (ABSENTE.has(String(error.code))) return null;
    throw error;
  }
  return new Map((data || []).map((r) => [r.cle, { vuPar: r.vu_par, vuLe: r.vu_le }]));
}

export async function marquerHausseVue(etabId, cle, userId) {
  const { error } = await supabase.from('achats_hausses_vues')
    .insert({ etablissement_id: etabId, cle, vu_par: userId });
  // Déjà marquée par quelqu'un d'autre : le but est atteint.
  if (error && String(error.code) !== '23505') throw error;
}

export async function remettreHausseAVoir(etabId, cle) {
  const { error } = await supabase.from('achats_hausses_vues')
    .delete().eq('etablissement_id', etabId).eq('cle', cle);
  if (error) throw error;
}

// Hausses de l'établissement, partagées en « à voir » et « vues ».
// `actif` : faux pour qui n'a pas le droit (rien n'est lu).
export function useHaussesPrix(etabId, docs, userId, { actif = true } = {}) {
  const [seuil, setSeuil] = React.useState(SEUIL_HAUSSE_DEFAUT);
  const [vues, setVues] = React.useState(() => new Map());
  // 'loading' | 'ready' | 'absente' | 'error'
  const [etat, setEtat] = React.useState('loading');

  const recharger = React.useCallback(async () => {
    if (!actif || !etabId) return;
    try {
      const [s, v] = await Promise.all([lireSeuilHausse(etabId), lireHaussesVues(etabId)]);
      setSeuil(s);
      if (v === null) { setVues(new Map()); setEtat('absente'); return; }
      setVues(v);
      setEtat('ready');
    } catch (err) {
      console.error('[hausses de prix]', err);
      // Les vues d'avant restent : une lecture en échec ne remet rien « à voir ».
      setEtat((e) => (e === 'loading' ? 'error' : e));
    }
  }, [etabId, actif]);

  React.useEffect(() => {
    setEtat('loading');
    setVues(new Map());
    if (!actif || !etabId) return undefined;
    recharger();
    const unsub = dbService.getRealtime()?.subscribeReload?.('achats_hausses_vues', recharger);
    return () => { unsub && unsub(); };
  }, [etabId, actif, recharger]);

  useReglageModifie(ID_REGLAGE_HAUSSES, recharger);

  const aujourdhui = zurichToday();
  const depuis = React.useMemo(() => isoDate(addDays(parseLocalDate(aujourdhui), -FENETRE_HAUSSES_JOURS)), [aujourdhui]);
  const toutes = React.useMemo(
    () => (actif ? haussesPrix(docs, { seuilPct: seuil, depuis }) : []),
    [docs, seuil, depuis, actif],
  );
  const aVoir = React.useMemo(() => toutes.filter((h) => !vues.has(h.cle)), [toutes, vues]);
  const dejaVues = React.useMemo(() => toutes.filter((h) => vues.has(h.cle)).map((h) => ({ ...h, vu: vues.get(h.cle) })), [toutes, vues]);

  // Mise à jour optimiste, défaite à la main en cas d'échec : relire la liste
  // ne rendrait rien si l'échec vient du réseau.
  const basculer = React.useCallback(async (cle, vue) => {
    const avant = vues.get(cle);
    setVues((m) => {
      const n = new Map(m);
      if (vue) n.set(cle, { vuPar: userId, vuLe: new Date().toISOString() });
      else n.delete(cle);
      return n;
    });
    try {
      if (vue) await marquerHausseVue(etabId, cle, userId);
      else await remettreHausseAVoir(etabId, cle);
    } catch (err) {
      console.error('[hausses de prix]', err);
      setVues((m) => {
        const n = new Map(m);
        if (avant) n.set(cle, avant); else n.delete(cle);
        return n;
      });
      notify("La hausse n'a pas pu être enregistrée. Réessayez dans un instant.", 'error');
    }
  }, [etabId, userId, vues]);

  return {
    etat, seuil, aVoir, dejaVues, fenetreJours: FENETRE_HAUSSES_JOURS,
    marquerVue: (cle) => basculer(cle, true),
    remettreAVoir: (cle) => basculer(cle, false),
  };
}
