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
        <span style={{ ...st.bouton, left: checked ? 19 : 3 }} />
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
  rail: { position: 'relative', display: 'block', width: 40, height: 24, borderRadius: 12, transition: 'background-color .15s' },
  bouton: {
    position: 'absolute', top: 3, width: 18, height: 18, borderRadius: 9,
    background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left .15s',
  },
};
