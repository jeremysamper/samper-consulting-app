import { useCallback, useEffect, useRef, useState } from 'react';
import { LECTURES } from './lecturesFamilles.js';

// ═══════════════════════════════════════════════════════════════════════════
// Lectures du module Statistiques : une par famille et par fenêtre de dates
// (la période et, s'il y en a une, la comparaison), gardées tant que
// l'établissement ne change pas. La Comptabilité n'y passe pas : sa lecture
// est le hook useCompta, appelé par l'écran.
//
// États d'une lecture : 'loading', 'ready', 'error'. Une lecture en échec ne
// rend aucune donnée et se relance par reessayer(famille) : l'écran affiche
// « non lu », jamais un zéro (D9). Une famille en échec n'efface pas les
// autres.
//
// Sondes : le niveau de la caisse (direction ou cuisine) se demande une fois
// à la base, avant de proposer ses mesures.
// ═══════════════════════════════════════════════════════════════════════════

const cleDe = (famille, etabId, debut, fin) => (LECTURES[famille].sansFenetre ? `${famille}|${etabId}` : `${famille}|${etabId}|${debut}|${fin}`);

//   visibles : ids des familles que la personne voit
//   demandes : [{ famille, debut, fin }] à lire pour la vue affichée
export function useLectureStatistiques({ etabId, aujourdhui, visibles, demandes }) {
  const [lectures, setLectures] = useState({});
  const [sondes, setSondes] = useState({});
  const lancees = useRef(new Set());
  const etabRef = useRef(etabId);
  const [tour, setTour] = useState(0);

  // Changement d'établissement : rien de l'ancien ne doit rester.
  useEffect(() => {
    etabRef.current = etabId;
    lancees.current = new Set();
    setLectures({});
    setSondes({});
  }, [etabId]);

  const signatureVisibles = (visibles || []).join(',');
  useEffect(() => {
    if (!etabId) return;
    (visibles || []).filter((f) => LECTURES[f].sonder).forEach((f) => {
      const cle = `sonde|${f}|${etabId}`;
      if (lancees.current.has(cle)) return;
      lancees.current.add(cle);
      setSondes((s) => ({ ...s, [f]: { status: 'loading' } }));
      LECTURES[f].sonder(etabId, aujourdhui).then(
        (r) => { if (etabRef.current === etabId) setSondes((s) => ({ ...s, [f]: { status: 'ready', ...r } })); },
        (e) => {
          console.error('[statistiques] sonde', f, e);
          if (etabRef.current === etabId) setSondes((s) => ({ ...s, [f]: { status: 'error', erreur: e?.message || '' } }));
        },
      );
    });
  }, [etabId, aujourdhui, signatureVisibles, tour]);

  const signatureDemandes = (demandes || []).map((d) => `${d.famille}|${d.debut}|${d.fin}`).join(',');
  useEffect(() => {
    if (!etabId) return;
    (demandes || []).forEach(({ famille, debut, fin }) => {
      const def = LECTURES[famille];
      if (!def || def.parHook || !def.lire) return;
      const cle = cleDe(famille, etabId, debut, fin);
      if (lancees.current.has(cle)) return;
      lancees.current.add(cle);
      setLectures((l) => ({ ...l, [cle]: { status: 'loading', famille } }));
      def.lire(etabId, debut, fin).then(
        (data) => { if (etabRef.current === etabId) setLectures((l) => ({ ...l, [cle]: { status: 'ready', famille, data } })); },
        (e) => {
          console.error('[statistiques] lecture', famille, e);
          if (etabRef.current === etabId) setLectures((l) => ({ ...l, [cle]: { status: 'error', famille, erreur: e?.message || '' } }));
        },
      );
    });
  }, [etabId, signatureDemandes, tour]);

  // Lecture d'une famille pour une fenêtre : { status, data } ou undefined.
  const lectureDe = useCallback((famille, debut, fin) => lectures[cleDe(famille, etabId, debut, fin)], [lectures, etabId]);

  // Relance ce qui a échoué pour une famille (lectures et sonde).
  const reessayer = useCallback((famille) => {
    setLectures((l) => {
      const suite = { ...l };
      Object.keys(suite).forEach((cle) => {
        if (suite[cle].famille === famille && suite[cle].status === 'error') { delete suite[cle]; lancees.current.delete(cle); }
      });
      return suite;
    });
    setSondes((s) => {
      if (s[famille]?.status !== 'error') return s;
      const suite = { ...s };
      delete suite[famille];
      lancees.current.delete(`sonde|${famille}|${etabId}`);
      return suite;
    });
    setTour((n) => n + 1);
  }, [etabId]);

  return { sondes, lectureDe, reessayer };
}
