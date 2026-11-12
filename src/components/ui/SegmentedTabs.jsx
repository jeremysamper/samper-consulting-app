import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// SegmentedTabs - barre d'onglets compacte, une seule ligne, défilement
// horizontal si les onglets débordent. Remplace les anciennes rangées de
// pilules en flex-wrap qui empilaient les onglets sur plusieurs lignes en
// mobile (et mangeaient toute la hauteur).
//
// Direction Office : pas de piste ni de pilule, l'onglet actif est souligné
// d'un trait à l'encre --onglet, qui porte aussi son texte. Seule la barre de
// modes de la caisse (.caisse-modes) garde un aplat d'accent pour son mode
// actif. Aucune couleur en dur - tokens CSS uniquement. Le style, le
// défilement et le masquage de la scrollbar sont en CSS (.segmented-tabs dans
// app.css).
//
// Props :
//   tabs     : [{ id, label|l, icon? }]  - icon = noeud React optionnel
//              ou { divider: true }      - séparateur vertical entre groupes
//   active   : id de l'onglet actif
//   onChange : (id) => void
//   size     : 'sm' | undefined         - 'sm' → pilules plus compactes
//   retourLigne : true                  - au-delà de 768 px, les onglets
//              passent à la ligne au lieu de défiler (longues séries)
// ─────────────────────────────────────────────────────────────────────────────

export default function SegmentedTabs({ tabs, active, onChange, size, retourLigne = false, style = {}, className = '' }) {
  const list = Array.isArray(tabs) ? tabs : [];
  return (
    <div
      className={`segmented-tabs no-print${size === 'sm' ? ' segmented-tabs--sm' : ''}${retourLigne ? ' segmented-tabs--retour' : ''}${className ? ' ' + className : ''}`}
      role="tablist"
      style={style}
    >
      {list.map((tab, i) => {
        if (tab.divider) {
          return <span key={'divider-' + i} className="segmented-tabs-divider" aria-hidden="true" />;
        }
        const isActive = active === tab.id;
        const label = tab.label ?? tab.l;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segmented-tab${isActive ? ' is-active' : ''}`}
            onClick={() => onChange?.(tab.id)}
          >
            {tab.icon ? <span className="segmented-tab-icon">{tab.icon}</span> : null}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
