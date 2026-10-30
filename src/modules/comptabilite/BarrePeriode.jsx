import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { TYPES_PERIODE } from './periodesCompta.js';

// ─────────────────────────────────────────────────────────────────────────────
// Barre de période de l'accueil : Mois, Trimestre, Année, Inventaire ; flèches
// précédent et suivant (jamais au-delà de la période en cours) ; actions de
// l'accueil (Réglages, plus tard Exporter). Sur un conteneur étroit
// (téléphone), les actions passent dans un seul « Gérer » (compta.css).
//
//   actions = [{ id, label, detail, onClick }]
// ─────────────────────────────────────────────────────────────────────────────

export default function BarrePeriode({ type, onType, libelle, peutPrecedent, peutSuivant, onPrecedent, onSuivant, actions = [] }) {
  return (
    <div className="compta-barre no-print" data-barre-periode="">
      <SegmentedTabs className="compta-barre-onglets" tabs={TYPES_PERIODE} active={type} onChange={onType} />
      <div className="compta-barre-nav">
        <button type="button" style={{ ...st.fleche, ...(peutPrecedent ? null : st.inactif) }} disabled={!peutPrecedent} onClick={onPrecedent} aria-label="Période précédente">
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span style={st.libelle} data-periode="">{libelle}</span>
        <button type="button" style={{ ...st.fleche, ...(peutSuivant ? null : st.inactif) }} disabled={!peutSuivant} onClick={onSuivant} aria-label="Période suivante">
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {actions.length > 0 && (
        <div className="compta-barre-actions">
          {actions.map(a => (
            <span key={a.id} className="compta-large">
              <Btn onClick={a.onClick} style={{ minHeight: 44 }}>{a.label}</Btn>
            </span>
          ))}
          <span className="compta-etroit">
            <BoutonActions
              id="compta-gerer"
              label="Gérer"
              style={st.gerer}
              titre="Gérer"
              sections={[{ items: actions.map(a => ({ titre: a.label, detail: a.detail, onClick: a.onClick })) }]}
            />
          </span>
        </div>
      )}
    </div>
  );
}

const st = {
  fleche: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0,
    borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer',
  },
  inactif: { opacity: 0.3, cursor: 'default' },
  libelle: {
    fontSize: 17, fontFamily: 'var(--font-serif)', color: 'var(--text)', minWidth: 0, textAlign: 'center',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px',
  },
  gerer: {
    minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
};
