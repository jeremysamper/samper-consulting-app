import { useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase.js';
import { isoDate, parseLocalDate } from '../utils/dateHelpers.js';
import { useOrdreLectures } from './useOrdreLectures.js';
import { useResumeRefresh } from './useResumeRefresh.js';

function mapError(error) {
  if (!error) return null;
  console.error('[usePrevisionsSemaine] erreur Supabase', error);
  const MESSAGES = {
    'PGRST301': 'Session expirée. Reconnecte-toi.',
  };
  return MESSAGES[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

/**
 * Construit le squelette des 7 jours de la semaine avec zéro couvert partout.
 * Utilise parseLocalDate pour éviter le piège UTC (new Date('YYYY-MM-DD') = minuit UTC).
 */
function buildSemaineVide(dateDebutStr) {
  const base = parseLocalDate(dateDebutStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return {
      date_service:    isoDate(d),
      couverts_midi:   0,
      couverts_soir:   0,
      couverts_brunch: 0,
      nb_groupes:      0,
      tags_critiques:  [],
      total_couverts:  0,
    };
  });
}

export function usePrevisionsSemaine(etablissementId) {
  const [semaine, setSemaine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  // Relecture en échec alors qu'une semaine valide est affichée : elle reste
  // à l'écran, l'appelant le signale sans la remplacer.
  const [nonActualise, setNonActualise] = useState(false);

  // Deux flèches tapées vite, ou une reprise qui croise un retour de
  // modification, ne doivent pas afficher la semaine d'avant : voir
  // useOrdreLectures.
  const lectures   = useOrdreLectures();
  // Semaine (établissement + lundi) dont les chiffres sont à l'écran.
  const afficheRef = useRef(null);
  // Dernier lundi demandé : c'est lui que la reprise relit.
  const demandeRef = useRef(null);

  const fetchSemaine = useCallback(async (dateDebut) => {
    if (!etablissementId || !dateDebut) return;
    // Calcul plage en local (parseLocalDate évite le décalage UTC+x)
    const dateStr = typeof dateDebut === 'string' ? dateDebut : isoDate(dateDebut);
    const base    = parseLocalDate(dateStr);
    const dateFin = isoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 6));
    const cle     = `${etablissementId}|${dateStr}`;
    const lecture = lectures.lancer(cle);
    demandeRef.current = dateStr;

    // Semaine déjà affichée (reprise après veille, retour d'une modification) :
    // relecture SILENCIEUSE, sans repasser par l'état de chargement. Changement
    // de semaine : chargement normal, l'ancienne reste visible en attendant.
    const silencieux = afficheRef.current === cle;
    if (!silencieux) {
      setLoading(true);
      setError(null);
      setNonActualise(false);
    }

    let data = null;
    let err  = null;
    try {
      const t0 = performance.now();
      // Requête directe sur la table d'agrégats previsions_jour.
      // Remplace l'ancienne RPC get_semaine_previsions (JSONB + SECURITY DEFINER overhead).
      ({ data, error: err } = await supabase
        .from('previsions_jour')
        .select('date_service, couverts_midi, couverts_soir, couverts_brunch, nb_groupes, tags_critiques')
        .eq('etablissement_id', etablissementId)
        .gte('date_service', dateStr)
        .lte('date_service', dateFin)
        .order('date_service'));
      const t1 = performance.now();
      console.log(`[usePrevisionsSemaine] query ${(t1 - t0).toFixed(0)}ms`, { dateStr, dateFin, rows: data?.length ?? 0 });
    } catch (e) {
      err = e;
    }

    if (err) {
      const message = mapError(err);   // journalise aussi l'erreur
      if (!lecture.signalerEchec()) return;
      setLoading(false);
      if (silencieux) { setNonActualise(true); return; }
      // La semaine à l'écran n'est pas celle demandée : la laisser sous le
      // nouvel intitulé ferait lire les couverts d'une autre semaine.
      afficheRef.current = null;
      setSemaine(null);
      setError(message);
      return;
    }

    // Reconstituer les 7 jours : previsions_jour ne contient que les jours
    // ayant au moins une réservation (créée par trigger). Les jours vides
    // ne sont pas en base - on les complète avec des zéros.
    const byDate = Object.fromEntries((data || []).map((row) => [row.date_service, row]));
    const merged = buildSemaineVide(dateStr).map((jour) => {
      const row = byDate[jour.date_service];
      if (!row) return jour;
      const midi   = row.couverts_midi   ?? 0;
      const soir   = row.couverts_soir   ?? 0;
      const brunch = row.couverts_brunch ?? 0;
      return {
        date_service:    jour.date_service,
        couverts_midi:   midi,
        couverts_soir:   soir,
        couverts_brunch: brunch,
        nb_groupes:      row.nb_groupes ?? 0,
        tags_critiques:  Array.isArray(row.tags_critiques) ? row.tags_critiques : [],
        total_couverts:  midi + soir + brunch,
      };
    });

    if (!lecture.appliquer()) return;
    afficheRef.current = cle;
    setSemaine(merged);
    setLoading(false);
    setError(null);
    setNonActualise(false);
  }, [etablissementId, lectures]);

  // Réveil de la tablette, retour du réseau : resumeCoordinator décide du
  // moment (session saine d'abord), la relecture est silencieuse.
  useResumeRefresh(() => {
    if (demandeRef.current) fetchSemaine(demandeRef.current);
  });

  return { semaine, loading, error, nonActualise, fetchSemaine };
}
