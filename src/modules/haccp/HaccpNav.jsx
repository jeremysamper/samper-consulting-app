import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION DU MODULE HACCP - gros boutons
//
// Remplace la rangée d'onglets compacts. En service, on vient dans HACCP pour
// trois gestes : relever une température, sortir une étiquette, photographier
// une étiquette fournisseur. Ces trois-là sont de grandes cibles posées en
// tête ; les écrans de consultation et de réglage (tableau de bord, contrôles
// hygiène, paramètres) restent à portée, en boutons plus petits dessous.
//
// Base de bordure en borderWidth/Style/Color : l'état actif ne surcharge que
// borderColor (cf. npm run lint:borders).
// ─────────────────────────────────────────────────────────────────────────────

const ns = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  // auto-fit : trois colonnes dès que la largeur le permet, deux ou une sinon.
  // Le plancher de 104 px garde trois tuiles côte à côte sur un téléphone.
  grillePrincipale: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8 },
  grilleSecondaire: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8 },
  principal: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4,
    minHeight: 84, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-xs)', minWidth: 0,
  },
  principalActif: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', boxShadow: 'var(--sh-sm)' },
  titre: { fontSize: 16, fontWeight: 600, lineHeight: 1.2, overflowWrap: 'break-word' },
  aide: { fontSize: 12, lineHeight: 1.3, opacity: 0.75 },
  secondaire: {
    minHeight: 44, padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--font)',
    fontSize: 13, fontWeight: 600, lineHeight: 1.2,
    background: 'var(--surface)', color: 'var(--text2)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, minWidth: 0,
  },
  secondaireActif: { background: 'var(--bg)', color: 'var(--text)', borderColor: 'var(--accent)' },
};

// tabs : [{ id, l, aide?, principal? }]
const HaccpNav = ({ tabs, active, onChange }) => {
  const principaux = tabs.filter(t => t.principal);
  const secondaires = tabs.filter(t => !t.principal);
  return (
    <nav className="haccp-nav no-print" style={ns.root} aria-label="Sections HACCP">
      <div style={ns.grillePrincipale}>
        {principaux.map(t => {
          const actif = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={actif}
              className="haccp-nav-principal"
              style={{ ...ns.principal, ...(actif ? ns.principalActif : null) }}
              onClick={() => onChange(t.id)}
            >
              <span className="haccp-nav-titre" style={ns.titre}>{t.l}</span>
              {t.aide && <span className="haccp-nav-aide" style={ns.aide}>{t.aide}</span>}
            </button>
          );
        })}
      </div>
      {secondaires.length > 0 && (
        <div style={ns.grilleSecondaire}>
          {secondaires.map(t => {
            const actif = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={actif}
                style={{ ...ns.secondaire, ...(actif ? ns.secondaireActif : null) }}
                onClick={() => onChange(t.id)}
              >
                {t.l}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
};

export default HaccpNav;
