import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../services/supabase.js';
import { useOrdreLectures } from '../../../hooks/useOrdreLectures.js';

// ═══════════════════════════════════════════════════════════════════════════
// Lecture du rapport des réservations : une requête sur la fenêtre entière
// (période, comparaison, carnets à venir) à chaque changement de filtre, plus
// les tables de salle et les réglages de capacité, lus une fois par
// établissement. Lecture seule ; la RLS (accès à l'établissement) suffit.
//
// Pas de temps réel : le rapport n'a pas à suivre le service à la seconde, un
// bouton « Actualiser » relit. Une relecture en échec garde les chiffres déjà
// affichés et le signale (bandeau), elle ne les remplace jamais par du vide.
// ═══════════════════════════════════════════════════════════════════════════

// Ni téléphone ni e-mail : le rapport n'en affiche pas et l'export n'en sort pas.
const COLONNES = [
  'id', 'date_service', 'service', 'heure_arrivee', 'nb_couverts', 'est_groupe', 'statut',
  'origine', 'client_id', 'passeport_gourmand', 'created_at', 'nom',
  'reservation_tables(table_id)', 'reservation_tags(type_tag, valeur)', 'resa_clients(prenom, nom)',
].join(', ');

// PostgREST plafonne une réponse (1000 lignes par défaut) sans le dire : on
// lit par pages jusqu'à la dernière, incomplète.
const PAGE = 1000;

async function lireReservations(etablissementId, debut, fin) {
  const lignes = [];
  for (let depuis = 0; ; depuis += PAGE) {
    const { data, error } = await supabase
      .from('reservations')
      .select(COLONNES)
      .eq('etablissement_id', etablissementId)
      .gte('date_service', debut)
      .lte('date_service', fin)
      .order('date_service')
      .order('id')
      .range(depuis, depuis + PAGE - 1);
    if (error) throw error;
    lignes.push(...(data || []));
    if (!data || data.length < PAGE) return lignes;
  }
}

async function lireReferentiel(etablissementId) {
  const [tables, parametres] = await Promise.all([
    supabase.from('salle_tables').select('id, nom, nb_places, zone, actif').eq('etablissement_id', etablissementId),
    supabase
      .from('reservation_en_ligne_parametres')
      .select('capacite_service, capacite_jours, horaires, jours_fermes, services_fermes')
      .eq('etablissement_id', etablissementId)
      .maybeSingle(),
  ]);
  if (tables.error) throw tables.error;
  if (parametres.error) throw parametres.error;
  return { tables: tables.data || [], parametres: parametres.data || null };
}

// status : loading (rien encore à l'écran) | ready | error (rien à l'écran).
// nonActualise : une relecture a échoué alors que des chiffres sont affichés.
export function useRapportReservations(etablissementId, debut, fin) {
  const [donnees, setDonnees] = useState(null);
  const [status, setStatus] = useState('loading');
  const [nonActualise, setNonActualise] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const lectures = useOrdreLectures();
  const referentielRef = useRef({ etab: null, valeur: null });
  const afficheRef = useRef(false);

  // Changement d'établissement : rien de l'ancien ne doit rester à l'écran.
  useEffect(() => {
    afficheRef.current = false;
    referentielRef.current = { etab: null, valeur: null };
    setDonnees(null);
    setStatus('loading');
    setNonActualise(false);
  }, [etablissementId]);

  const charger = useCallback(async ({ forcerReferentiel = false } = {}) => {
    if (!etablissementId || !debut || !fin) return;
    const lecture = lectures.lancer(`${etablissementId}|${debut}|${fin}`);
    setEnCours(true);
    try {
      const ref = referentielRef.current;
      const referentiel = !forcerReferentiel && ref.etab === etablissementId && ref.valeur
        ? Promise.resolve(ref.valeur)
        : lireReferentiel(etablissementId);
      const [lignes, valeurRef] = await Promise.all([lireReservations(etablissementId, debut, fin), referentiel]);
      if (!lecture.appliquer()) return;
      referentielRef.current = { etab: etablissementId, valeur: valeurRef };
      afficheRef.current = true;
      // La fenêtre lue voyage avec les lignes : tant qu'une nouvelle période
      // n'est pas lue, l'écran sait que ses lignes ne la couvrent pas.
      setDonnees({ lignes, ...valeurRef, debut, fin });
      setStatus('ready');
      setNonActualise(false);
    } catch (e) {
      console.error('[rapport réservations] lecture', e);
      if (!lecture.signalerEchec()) return;
      if (afficheRef.current) setNonActualise(true);
      else setStatus('error');
    } finally {
      setEnCours(false);
    }
  }, [etablissementId, debut, fin, lectures]);

  useEffect(() => { charger(); }, [charger]);

  const actualiser = useCallback(() => charger({ forcerReferentiel: true }), [charger]);

  return { donnees, status, nonActualise, enCours, actualiser };
}
