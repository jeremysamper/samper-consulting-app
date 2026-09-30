import { useState, useCallback, useRef, useEffect } from 'react';
import { dbService } from '../services/dbService.js';
import { isoDate, parseLocalDate } from '../utils/dateHelpers.js';
import { useReservations } from './useReservations.js';
import { useOrdreLectures } from './useOrdreLectures.js';
import { SERVICES_AFFICHES, serviceAffiche } from '../modules/previsions/statutsReservation.js';

// ═══════════════════════════════════════════════════════════════════════════
// La semaine du planning des réservations : les réservations elles-mêmes,
// jour par jour, et plus seulement leurs couverts.
//
// Le planning affiche les NOMS par service (demande de Jérémy, 30.09.2026) :
// l'agrégat previsions_jour ne suffit plus, on lit les réservations de la
// semaine et on recompte ici. Mêmes règles que le trigger qui tient
// previsions_jour : les annulées et les no-shows ne comptent pas dans les
// couverts, les allergènes critiques sont ceux des réservations comptées.
//
// Deux services seulement : le brunch est rangé avec le midi (voir
// serviceAffiche), c'est le midi du dimanche.
// ═══════════════════════════════════════════════════════════════════════════

function mapJour(dateService, resas) {
  const comptees = resas.filter((r) => r.statut !== 'no_show');
  const couverts = (svc) => comptees
    .filter((r) => serviceAffiche(r.service) === svc)
    .reduce((s, r) => s + (r.nb_couverts || 0), 0);
  const allergenes = new Set();
  for (const r of comptees) {
    for (const t of Array.isArray(r.reservation_tags) ? r.reservation_tags : []) {
      if (t.type_tag === 'allergene' && t.valeur) allergenes.add(t.valeur);
    }
  }
  const parService = {};
  for (const svc of SERVICES_AFFICHES) {
    parService[svc] = resas
      .filter((r) => serviceAffiche(r.service) === svc)
      .sort((a, b) => (a.heure_arrivee || '').localeCompare(b.heure_arrivee || ''));
  }
  const midi = couverts('midi');
  const soir = couverts('soir');
  return {
    date_service:    dateService,
    resas:           parService,
    couverts_midi:   midi,
    couverts_soir:   soir,
    nb_groupes:      comptees.filter((r) => r.est_groupe).length,
    tags_critiques:  [...allergenes].sort((a, b) => a.localeCompare(b)),
    total_couverts:  midi + soir,
  };
}

export function usePrevisionsSemaine(etablissementId) {
  const reservations = useReservations(etablissementId);
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
  // Semaine (établissement + lundi) dont les réservations sont à l'écran.
  const afficheRef = useRef(null);
  // Dernier lundi demandé : c'est lui que la reprise et le temps réel relisent.
  const demandeRef = useRef(null);

  const fetchSemaine = useCallback(async (dateDebut) => {
    if (!etablissementId || !dateDebut) return;
    // Calcul plage en local (parseLocalDate évite le décalage UTC+x)
    const dateStr = typeof dateDebut === 'string' ? dateDebut : isoDate(dateDebut);
    const base    = parseLocalDate(dateStr);
    const jours   = Array.from({ length: 7 }, (_, i) =>
      isoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
    const cle     = `${etablissementId}|${dateStr}`;
    const lecture = lectures.lancer(cle);
    demandeRef.current = dateStr;

    // Semaine déjà affichée (reprise après veille, retour d'une modification,
    // temps réel) : relecture SILENCIEUSE, sans repasser par l'état de
    // chargement. Changement de semaine : chargement normal, l'ancienne reste
    // visible en attendant.
    const silencieux = afficheRef.current === cle;
    if (!silencieux) {
      setLoading(true);
      setError(null);
      setNonActualise(false);
    }

    let res;
    try {
      res = await reservations.findByRange(jours[0], jours[6]);
    } catch (e) {
      console.error('[usePrevisionsSemaine] lecture de la semaine', e);
      res = { data: null, error: 'Erreur technique. Réessaie ou contacte le support.' };
    }

    if (res.error) {
      if (!lecture.signalerEchec()) return;
      setLoading(false);
      if (silencieux) { setNonActualise(true); return; }
      // La semaine à l'écran n'est pas celle demandée : la laisser sous le
      // nouvel intitulé ferait lire les réservations d'une autre semaine.
      afficheRef.current = null;
      setSemaine(null);
      setError(res.error);
      return;
    }

    const parJour = new Map(jours.map((j) => [j, []]));
    for (const r of res.data || []) parJour.get(r.date_service)?.push(r);
    const merged = jours.map((j) => mapJour(j, parJour.get(j)));

    if (!lecture.appliquer()) return;
    afficheRef.current = cle;
    setSemaine(merged);
    setLoading(false);
    setError(null);
    setNonActualise(false);
  }, [etablissementId, reservations, lectures]);

  // Temps réel : une demande arrivée du site ou une résa saisie sur un autre
  // poste apparaît dans le planning sans recharger. subscribeReload rejoue
  // aussi la lecture au réveil de la tablette (resumeCoordinator).
  useEffect(() => {
    const realtime = dbService.getBridge()?.realtime;
    if (!etablissementId || !realtime?.subscribeReload) return undefined;
    const unsub = realtime.subscribeReload('reservations', () => {
      if (demandeRef.current) fetchSemaine(demandeRef.current);
    });
    return () => { unsub && unsub(); };
  }, [etablissementId, fetchSemaine]);

  return { semaine, loading, error, nonActualise, fetchSemaine };
}
