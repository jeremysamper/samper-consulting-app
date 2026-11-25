import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { zurichAjouterJours } from '../../utils/zurichTime.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { h } from '../hebergement/hotelUi.jsx';
import { dateCourte, heureZurich, jourZurich, personnes, placesRestantes } from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Inscrire un séjour à une activité, en un toucher (plan 15, lot 6b). Rendu
// dans la fiche du séjour (Hébergement) et sur l'écran du séjour d'Activités :
// les activités des sept prochains jours, non annulées, avec leurs places ;
// « Inscrire » inscrit le séjour avec toutes ses personnes. Avant : Programme,
// l'activité, le séjour dans une liste, le nombre de personnes, « Inscrire ».
//
// Droits : toute l'équipe inscrit (RLS activite_inscriptions) ; la base
// refuse une activité complète.
// ─────────────────────────────────────────────────────────────────────────────

export default function InscriptionsSejour({ sejour, activites, inscriptions, aujourdhui, max = 6 }) {
  const [enCours, setEnCours] = React.useState('');
  const fin = zurichAjouterJours(aujourdhui, 7);
  const maintenant = new Date().toISOString();
  const prochaines = activites
    .filter((a) => !a.annulee && a.fin > maintenant && jourZurich(a.debut) >= aujourdhui && jourZurich(a.debut) <= fin && jourZurich(a.debut) <= sejour.depart)
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, max);
  if (!prochaines.length) return null;
  const nb = personnes(sejour);
  const inscriptionDe = (a) => inscriptions.rows.find((i) => i.activiteId === a.id && i.sejourId === sejour.id && i.statut !== 'annule') || null;

  const inscrire = async (a) => {
    setEnCours(a.id);
    const annulee = inscriptions.rows.find((i) => i.activiteId === a.id && i.sejourId === sejour.id && i.statut === 'annule');
    const r = annulee
      ? await inscriptions.modifier(annulee.id, { statut: 'inscrit', nb_personnes: nb })
      : await inscriptions.inserer({ activite_id: a.id, sejour_id: sejour.id, nb_personnes: nb });
    setEnCours('');
    if (r.error) notify(r.error, 'error');
    else notify('Séjour inscrit.', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-inscriptions-sejour="">
      <div style={h.sousTitre}>Activités des prochains jours</div>
      {prochaines.map((a) => {
        const inscrite = inscriptionDe(a);
        const restantes = placesRestantes(a, inscriptions.rows);
        const complet = restantes != null && restantes < nb;
        return (
          <div key={a.id} style={st.ligne}>
            <span style={{ flex: '1 1 180px', minWidth: 0 }}>
              <span style={{ fontSize: 'var(--t2)', color: 'var(--text)' }} data-no-translate>{a.titre}</span>
              <span style={{ ...h.detail, display: 'block' }}>
                {jourZurich(a.debut) === aujourdhui ? <span>aujourd'hui</span> : <span data-no-translate>{dateCourte(jourZurich(a.debut)).slice(0, 5)}</span>}
                {' '}<span data-no-translate>{heureZurich(a.debut)}</span>
                {restantes != null && <>, <span data-no-translate>{restantes}</span> <span>{restantes > 1 ? 'places libres' : 'place libre'}</span></>}
              </span>
            </span>
            {inscrite
              ? <Puce ton="success">Inscrit</Puce>
              : complet
                ? <Puce ton="danger">Complet</Puce>
                : <Btn onClick={() => inscrire(a)} disabled={!!enCours} style={{ minHeight: 44, flexShrink: 0 }}>Inscrire</Btn>}
          </div>
        );
      })}
    </div>
  );
}

const st = {
  ligne: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
};
