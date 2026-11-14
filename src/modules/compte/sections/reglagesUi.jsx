import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Pièces des sections de préférences (Apparence, Langue, Démarrage, Menu et
// gestes) : une ligne de réglage (titre, aide, contrôle) et un choix en
// pilules. Le choix reprend l'allure de SegmentedTabs (classes partagées,
// pilule choisie en aplat sombre) avec la sémantique d'un groupe de boutons
// radio : on choisit une valeur, on ne change pas d'onglet.
// ─────────────────────────────────────────────────────────────────────────────

export function Ligne({ titre, aide, children, colonne = false, derniere = false }) {
  return (
    <div style={{ ...ui.ligne, ...(colonne ? ui.ligneColonne : null), ...(derniere ? ui.ligneDerniere : null) }}>
      {/* En colonne, la base de 240 px deviendrait une hauteur : le texte prend la sienne. */}
      <div style={colonne ? ui.texteColonne : ui.texte}>
        <div style={ui.titre}>{titre}</div>
        {aide && <div style={ui.aide}>{aide}</div>}
      </div>
      <div style={colonne ? ui.controleColonne : ui.controle}>{children}</div>
    </div>
  );
}

export function ChoixPilules({ label, valeur, options, onChange }) {
  return (
    <div className="segmented-tabs segmented-tabs--retour" role="radiogroup" aria-label={label} style={ui.pilules}>
      {options.map((option) => {
        const choisie = option.id === valeur;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={choisie}
            className={`segmented-tab${choisie ? ' is-active' : ''}`}
            onClick={() => { if (!choisie) onChange(option.id); }}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const ui = {
  liste: { display: 'flex', flexDirection: 'column', maxWidth: 680, minWidth: 0 },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    padding: '16px 0', borderBottom: '1px solid var(--rule-soft)', minWidth: 0,
  },
  ligneColonne: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  ligneDerniere: { borderBottom: 'none' },
  texte: { flex: '1 1 240px', minWidth: 0 },
  texteColonne: { flex: '0 0 auto', minWidth: 0 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  aide: { fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 },
  controle: { flexShrink: 0 },
  controleColonne: { minWidth: 0 },
  pilules: { maxWidth: '100%' },
  pied: { display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 16 },
  btn44: { minHeight: 44 },
};
