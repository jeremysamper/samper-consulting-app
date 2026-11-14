import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CarteRepere } from '../../components/ui/index.jsx';
import { Puce } from '../dashboard/tableauUi.jsx';
import { STATUTS_SEJOUR, PENSIONS, dateCourte, libelleDe, personnes, tonDe } from './hotelData.js';
import './hotel.css';

// ─────────────────────────────────────────────────────────────────────────────
// Briques partagées par les sept modules de l'hôtel : ligne de séjour, champ
// de formulaire, liste en carte, vide, accueil (direction Galet). Couleurs par
// jetons de thème seulement. Les noms d'hôtes, numéros de chambre et dates
// sont des données : ils vont dans leurs propres nœuds (data-no-translate pour
// les noms) et la phrase autour reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

export function LigneSejour({ sejour, chambre, onClick, aujourdhui }) {
  const s = sejour;
  const nuits = Math.max(1, Math.round((Date.parse(`${s.depart}T12:00:00`) - Date.parse(`${s.arrivee}T12:00:00`)) / 86400000));
  const contenu = (
    <>
      <span style={h.ligneGauche}>
        <span style={h.nomHote} data-no-translate>{s.nomHote}</span>
        <span style={h.detail}>
          <span data-no-translate>{dateCourte(s.arrivee)} - {dateCourte(s.depart)}</span>
          <span aria-hidden="true"> </span>
          <span>({nuits}</span>
          <span aria-hidden="true"> </span>
          <span>{nuits > 1 ? 'nuits' : 'nuit'})</span>
        </span>
      </span>
      <span style={h.ligneDroite}>
        <span style={h.chambre}>
          {chambre ? <><span>Chambre</span><span aria-hidden="true"> </span><span data-no-translate>{chambre.numero}</span></> : <span>Sans chambre</span>}
        </span>
        <span style={h.detail}>
          <span>{personnes(s)}</span>
          <span aria-hidden="true"> </span>
          <span>{personnes(s) > 1 ? 'personnes' : 'personne'}</span>
          <span aria-hidden="true"> </span>
          <span>{libelleDe(PENSIONS, s.pension)}</span>
        </span>
        <Puce ton={tonDe(STATUTS_SEJOUR, s.statut)}>
          {s.statut === 'prevu' && s.arrivee === aujourdhui ? 'Arrive aujourd\'hui' : libelleDe(STATUTS_SEJOUR, s.statut)}
        </Puce>
        <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text3)' }} />
      </span>
    </>
  );
  return (
    <button type="button" className="tdb-lien" onClick={onClick} style={h.ligne} data-sejour={s.id}>
      {contenu}
    </button>
  );
}

export function Champ({ label, children, large = false }) {
  return (
    <label style={{ ...h.champ, ...(large ? { gridColumn: '1 / -1' } : null) }}>
      <span style={h.champLabel}>{label}</span>
      {children}
    </label>
  );
}

// Vide, chargement, erreur de lecture : dans une carte, texte en --text3.
export function Vide({ children }) {
  return <div data-cadre="" style={h.vide}>{children}</div>;
}

// Une liste dans une carte blanche, ses lignes séparées par un filet doux.
// Sans ligne, rien n'est rendu (pas de carte vide).
export function Liste({ children }) {
  if (!React.Children.toArray(children).length) return null;
  return <div className="hotel-liste" data-cadre="" style={h.liste}>{children}</div>;
}

// Une carte blanche à titre (couverts d'un repas, registre du mois). La carte
// du tableau de bord ne porte pas data-cadre : hors de lui, elle s'aplatit.
export function CarteHotel({ titre, sousTitre, children }) {
  return (
    <section data-cadre="" style={{ ...h.carte, gap: 12 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <h2 style={h.carteTitre}>{titre}</h2>
        {sousTitre && <div style={h.detail}>{sousTitre}</div>}
      </header>
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

// Accueil d'un module de l'hôtel : le conteneur de requêtes et sa grille
// (hotel.css). Les enfants sont les tuiles du module puis ses repères.
export function PageHotel({ children }) {
  return (
    <div className="hotel-page">
      <div className="hotel-grille">{children}</div>
    </div>
  );
}

// La rangée de repères : les nombres que l'écran compte déjà, en grand. Rien
// n'est lu en plus. Crochets du banc : data-hotel-reperes, data-repere.
//   reperes : [{ id, Icone, valeur, libelle, detail }]
export function ReperesHotel({ reperes }) {
  const liste = reperes.filter(Boolean);
  if (!liste.length) return null;
  return (
    <div className="hotel-reperes" data-hotel-reperes="" style={{ '--hotel-n': liste.length }}>
      {liste.map((r) => (
        <CarteRepere key={r.id} data-repere={r.id} Icone={r.Icone} valeur={r.valeur} libelle={r.libelle} detail={r.detail} />
      ))}
    </div>
  );
}

export const h = {
  liste: {
    display: 'flex', flexDirection: 'column', minWidth: 0, padding: '4px 18px', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  // Ligne de liste : filet bas d'un pixel ; une ligne d'état (retard,
  // escalade) change la couleur du filet et prend un trait à gauche.
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%',
    minHeight: 'var(--ligne-aeree)', padding: '10px 0', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
    background: 'transparent', color: 'var(--text)', borderRadius: 0, fontFamily: 'var(--font)',
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  ligneEtat: { borderLeftWidth: 3, borderColor: 'var(--danger-bd)', paddingLeft: 10 },
  ligneGauche: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' },
  ligneDroite: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  nomHote: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chambre: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champLabel: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  saisie: {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box', fontSize: 'var(--t2)', fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)',
  },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 },
  vide: {
    padding: '18px 18px', fontSize: 'var(--t2)', color: 'var(--text3)', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  sousTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text2)', margin: '6px 0 0' },
  carteTitre: { margin: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' },
  erreur: { fontSize: 'var(--t2)', color: 'var(--danger-text)', lineHeight: 1.45 },
  // Carte blanche d'un bloc (chambre, passation) : porte data-cadre.
  carte: {
    display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '16px 18px', boxSizing: 'border-box',
    background: 'var(--zone)', color: 'var(--text)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
};
