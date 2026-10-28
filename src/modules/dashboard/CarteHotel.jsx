import React from 'react';
import { Carte } from './tableauUi.jsx';
import { arriveesDu, departsDu, enMaison, useChambres, useSejours } from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Aujourd'hui à l'hôtel » (branche Hôtel, lot H0) : les arrivées, les
// départs, les séjours en maison, les chambres prêtes et celles à faire, en
// grandes cartes, chacune menant à son module pour qui peut l'ouvrir. Rendue
// par le tableau de bord pour un établissement hôtelier seulement, quand le
// module Hébergement y est activé. Nombres et mots dans des nœuds séparés.
// ─────────────────────────────────────────────────────────────────────────────

export default function CarteHotel({ etabId, aujourdhui, peutOuvrir, ouvrir }) {
  const chambres = useChambres(etabId);
  const sejours = useSejours(etabId);
  if (chambres.status === 'absent' || sejours.status === 'absent') return null;

  const actives = chambres.rows.filter((c) => c.actif);
  const cartes = [
    { id: 'arrivees', page: 'hebergement', label: 'Arrivées', valeur: arriveesDu(sejours.rows, aujourdhui).length, unite: 'aujourd\'hui' },
    { id: 'departs', page: 'hebergement', label: 'Départs', valeur: departsDu(sejours.rows, aujourdhui).length, unite: 'aujourd\'hui' },
    { id: 'en_maison', page: 'hebergement', label: 'En maison', valeur: enMaison(sejours.rows).length, unite: 'séjours' },
    { id: 'pretes', page: 'etages', label: 'Chambres prêtes', valeur: actives.filter((c) => c.statutMenage === 'propre' || c.statutMenage === 'inspectee').length, unite: <><span>sur</span> <span>{actives.length}</span></> },
    { id: 'a_faire', page: 'etages', label: 'Chambres à faire', valeur: actives.filter((c) => c.statutMenage === 'a_faire' || c.statutMenage === 'en_cours').length, unite: 'à faire ou en cours' },
  ];
  const pret = chambres.status === 'ready' && sejours.status === 'ready';

  return (
    <Carte titre="Aujourd'hui à l'hôtel" sousTitre={pret ? null : 'Chargement…'}>
      <div style={s.grille}>
        {cartes.map((c) => {
          const contenu = (
            <>
              <span style={s.label}>{c.label}</span>
              <span style={s.valeur}>{pret ? c.valeur.toLocaleString('fr-CH') : '…'}</span>
              <span style={s.unite}>{c.unite}</span>
            </>
          );
          return peutOuvrir(c.page) ? (
            <button key={c.id} type="button" className="tdb-lien" data-hotel={c.id} onClick={() => ouvrir(c.page)} style={{ ...s.carte, cursor: 'pointer' }}>
              {contenu}
            </button>
          ) : (
            <div key={c.id} data-hotel={c.id} style={s.carte}>{contenu}</div>
          );
        })}
      </div>
    </Carte>
  );
}

const s = {
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 },
  carte: {
    display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, minHeight: 112, boxSizing: 'border-box', textAlign: 'left',
    padding: '16px 18px', borderRadius: 'var(--r)', background: 'var(--bg)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    fontFamily: 'var(--font)', color: 'var(--text)',
  },
  label: { fontSize: 14, fontWeight: 500, color: 'var(--text2)' },
  valeur: { fontFamily: 'var(--font-num)', fontSize: 38, lineHeight: 1.05, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  unite: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.3, marginTop: 'auto' },
};
