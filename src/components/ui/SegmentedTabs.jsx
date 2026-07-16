import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// SegmentedTabs - barre d'onglets compacte, une seule ligne, défilement
// horizontal si les onglets débordent. Remplace les anciennes rangées de
// pilules en flex-wrap qui empilaient les onglets sur plusieurs lignes en
// mobile (et mangeaient toute la hauteur).
//
// Style « segmented control » : une piste (var(--surface2)) contenant des
// pilules ; l'onglet actif est surélevé (fond var(--surface) + ombre légère).
// Aucune couleur en dur - tokens CSS uniquement. Le comportement scroll +
// masquage de la scrollbar est en CSS (.segmented-tabs dans app.css).
//
// Props :
//   tabs     : [{ id, label|l, icon? }]  - icon = noeud React optionnel
//   active   : id de l'onglet actif
//   onChange : (id) => void
//   size     : 'sm' | undefined         - 'sm' → pilules plus compactes
// ─────────────────────────────────────────────────────────────────────────────

export default function SegmentedTabs({ tabs, active, onChange, size, style = {}, className = '' }) {
  const list = Array.isArray(tabs) ? tabs : [];
  return (
    <div
      className={`segmented-tabs no-print${size === 'sm' ? ' segmented-tabs--sm' : ''}${className ? ' ' + className : ''}`}
      role="tablist"
      style={style}
    >
      {list.map((tab) => {
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
