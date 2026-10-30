import React from 'react';
import { MESSAGE_ABSENTE } from './comptaService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Migration 20261030_comptabilite pas encore appliquée (D7) : l'écran le dit
// en une phrase, jamais une liste vide ni un plantage. `bandeau` : la version
// longue en tête de l'accueil, qui dit aussi ce qui se lit déjà.
// ─────────────────────────────────────────────────────────────────────────────

export default function EtatAbsent({ bandeau = false, children }) {
  return (
    <div role="status" data-compta-absente="" style={st.boite}>
      <span>{MESSAGE_ABSENTE}</span>
      {bandeau && (
        <>
          {' '}
          <span>Les achats et les marges se lisent déjà ; la saisie du chiffre d'affaires, les charges fixes, les salaires et la banque arriveront avec elle.</span>
        </>
      )}
      {children ? <> {children}</> : null}
    </div>
  );
}

const st = {
  boite: {
    padding: '10px 12px', borderRadius: 8,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--warning-bd)',
    background: 'var(--warning-bg-soft)', color: 'var(--warning-text)',
    fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--font)',
  },
};
