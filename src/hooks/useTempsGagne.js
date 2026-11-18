import { useEffect, useState } from 'react';
import { lireTempsGagne } from '../services/tempsGagne.js';
import { resumerTempsGagne } from '../services/tempsGagneBareme.js';
import { zurichLundi, zurichMinuitIso } from '../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Temps gagné de la semaine en cours (lundi 0 h à Zurich), pour le tableau de
// bord. La garde est posée par l'appelant (`enabled`, consultant et patron) :
// rien n'est lu sans elle.
//
// { statut: 'absent' | 'chargement' | 'pret' | 'erreur', lundi, totalSecondes, detail }
// 'absent' : garde fermée ou table pas encore créée ; le widget n'est pas rendu.
// ─────────────────────────────────────────────────────────────────────────────

const VIDE = { totalSecondes: 0, detail: [] };

export function useTempsGagne({ etabId, aujourdhui, enabled }) {
  const lundi = aujourdhui ? zurichLundi(aujourdhui) : null;
  const cle = enabled && etabId && lundi ? `${etabId}|${lundi}` : null;
  const [etat, setEtat] = useState({ cle: null, statut: 'absent', ...VIDE });

  useEffect(() => {
    if (!cle) return undefined;
    let vivant = true;
    lireTempsGagne(etabId, zurichMinuitIso(lundi))
      .then((r) => {
        if (!vivant) return;
        if (r.statut === 'pret') setEtat({ cle, statut: 'pret', ...resumerTempsGagne(r.lignes) });
        else setEtat((prec) => (prec.cle === cle && prec.statut === 'pret' ? prec : { cle, statut: r.statut, ...VIDE }));
      })
      .catch(() => { if (vivant) setEtat((prec) => (prec.cle === cle && prec.statut === 'pret' ? prec : { cle, statut: 'erreur', ...VIDE })); });
    return () => { vivant = false; };
  }, [cle, etabId, lundi]);

  if (!cle) return { statut: 'absent', lundi, ...VIDE };
  if (etat.cle !== cle) return { statut: 'chargement', lundi, ...VIDE };
  return { statut: etat.statut, lundi, totalSecondes: etat.totalSecondes, detail: etat.detail };
}
