import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Interrupteur ouvert / fermé (Rôles & accès, modules d'un établissement dans
// Paramètres) : une cible de 44 px au doigt, l'état lu par les lecteurs
// d'écran (role switch). Couleurs par jetons seulement.
// ─────────────────────────────────────────────────────────────────────────────

export default function Interrupteur({ checked, disabled = false, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{ ...st.cible, cursor: disabled ? 'default' : 'pointer' }}
    >
      <span aria-hidden="true" style={{ ...st.rail, background: checked ? 'var(--accent)' : 'var(--border2)', opacity: disabled ? 0.5 : 1 }}>
        <span style={{ ...st.bouton, transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

const st = {
  cible: {
    width: 56, height: 44, flexShrink: 0, padding: 0, margin: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none',
  },
  rail: { position: 'relative', display: 'block', width: 40, height: 24, borderRadius: 'var(--r-full)', transition: 'background-color var(--mvt-2) var(--courbe)' },
  bouton: {
    // Le bouton rond glisse par une translation, avec le ressort du socle.
    position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%',
    background: 'var(--surface)', boxShadow: 'var(--sh)', transition: 'transform var(--mvt-2) var(--courbe-ressort)',
  },
};
