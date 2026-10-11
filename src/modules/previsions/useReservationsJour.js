import { useState, useEffect, useRef, useCallback } from 'react';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { useReservations } from '../../hooks/useReservations.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import { metaStatut } from './statutsReservation.js';
import { traiterDemande } from './reservationEnLigne.js';

// ═══════════════════════════════════════════════════════════════════════════
// Réservations d'un jour, et ce qu'on en fait pendant le service.
//
// Partagé par la vue jour et le mode service : les deux écrans lisent la même
// journée et cochent les mêmes arrivées. Deux copies de cette logique (lecture
// silencieuse, ordre des réponses, mise à jour optimiste) finiraient par
// diverger au premier correctif.
//
// `tempsReel` : le mode service reste ouvert tout le service sur l'iPad de
// l'entrée pendant qu'un autre poste coche des arrivées ou saisit un client
// de passage. Sans abonnement, chacun travaillerait sur une photo périmée.
// ═══════════════════════════════════════════════════════════════════════════

export function useReservationsJour(etablissementId, date, { refreshKey = 0, onChange, tempsReel = false } = {}) {
  const reservations = useReservations(etablissementId);
  const [resas,        setResas]        = useState(null);
  // Vrai d'entrée : sans ça le premier rendu, avant la première lecture,
  // annonçait « Aucune réservation ce jour ».
  const [loading,      setLoading]      = useState(Boolean(etablissementId && date));
  const [error,        setError]        = useState(null);
  const [nonActualise, setNonActualise] = useState(false);

  // Reprise, retour d'une modification, temps réel et bouton « Réessayer »
  // peuvent lancer des lectures qui se croisent : voir useOrdreLectures.
  const lectures   = useOrdreLectures();
  // Jour (établissement + date) dont les réservations sont à l'écran.
  const afficheRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    if (!etablissementId || !date) return;
    const cle     = `${etablissementId}|${date}`;
    const lecture = lectures.lancer(cle);
    // Ce jour est déjà affiché (reprise après veille, retour d'une
    // modification, événement temps réel) : relecture SILENCIEUSE. La liste et
    // le plan de salle restent montés, sans « Chargement… », et sont remplacés
    // à l'arrivée. Sinon on repart de zéro : les résas d'un autre jour sous ce
    // titre mentiraient.
    const silencieux = afficheRef.current === cle;
    if (!silencieux) {
      afficheRef.current = null;
      setResas(null);
      setLoading(true);
      setError(null);
      setNonActualise(false);
    }

    let res;
    try {
      res = await reservations.findByDate(date);
    } catch (e) {
      console.error('[useReservationsJour] lecture des réservations', e);
      res = { data: null, error: 'Erreur technique. Réessaie ou contacte le support.' };
    }

    if (res.error) {
      if (!lecture.signalerEchec()) return;
      setLoading(false);
      // Une liste valide n'est jamais écrasée par un échec : elle reste
      // affichée, avec un bandeau qui dit qu'elle n'a pas pu être actualisée.
      if (silencieux) setNonActualise(true);
      else setError(res.error);
      return;
    }
    if (!lecture.appliquer()) return;
    afficheRef.current = cle;
    setResas((res.data || []).filter((r) => r.statut !== 'annule'));
    setLoading(false);
    setError(null);
    setNonActualise(false);
  }, [etablissementId, date, reservations, lectures]);

  // refreshKey : une résa créée depuis le bandeau du module (ou modifiée par
  // une modale fermée avant la fin de son écriture) doit aussi apparaître ici.
  useEffect(() => { load(); }, [load, refreshKey]);

  // Réveil de la tablette, retour du réseau : resumeCoordinator décide du
  // moment (session saine d'abord), la relecture est silencieuse. En temps
  // réel, subscribeReload rejoue déjà la lecture à la reprise.
  useResumeRefresh(tempsReel ? null : load);

  useEffect(() => {
    if (!tempsReel) return undefined;
    const realtime = dbService.getBridge()?.realtime;
    if (!realtime?.subscribeReload) return undefined;
    const unsub = realtime.subscribeReload('reservations', load);
    return () => { unsub && unsub(); };
  }, [tempsReel, load]);

  // Mise à jour optimiste : pendant le service, cocher une arrivée doit
  // répondre au doigt et non au réseau. En cas d'échec on remet l'état
  // d'avant plutôt que de laisser l'écran mentir.
  const changerStatut = useCallback(async (resa, statut) => {
    const avant = resa.statut;
    setResas((prev) => (prev || []).map((r) => (r.id === resa.id ? { ...r, statut } : r)));
    const { error: err } = await reservations.setStatut(resa.id, statut);
    if (err) {
      setResas((prev) => (prev || []).map((r) => (r.id === resa.id ? { ...r, statut: avant } : r)));
      notify(err, 'error');
      return;
    }
    notify(`${resa.nom} : ${metaStatut(statut).label.toLowerCase()}`, 'success');
    // Un no-show sort des couverts prévus (trigger côté base) : la vue
    // semaine doit s'en apercevoir.
    if (statut === 'no_show' || avant === 'no_show') onChangeRef.current?.();
  }, [reservations]);

  // Demande en ligne confirmée ou refusée : le client est prévenu par e-mail,
  // le bandeau des demandes et la semaine se relisent. Rend vrai si la
  // demande a bien été traitée.
  const traiter = useCallback(async (resa, evenement) => {
    if (evenement === 'refus' && !window.confirm(`Refuser la demande de ${resa.nom} ?`)) return false;
    const res = await traiterDemande(resa, evenement);
    if (res.error) { notify(res.error, 'error'); return false; }
    notify(res.message, res.ton);
    load();
    onChangeRef.current?.();
    return true;
  }, [load]);

  return { resas, loading, error, nonActualise, load, changerStatut, traiter };
}
