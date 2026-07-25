import React from 'react';
import { Btn } from './index.jsx';

// Barre d'outils du mode sélection multiple.
// S'affiche au-dessus d'une liste quand le mode sélection est actif.
//
// Props :
//   count        : nombre d'éléments sélectionnés
//   total        : nombre total d'éléments sélectionnables
//   allSelected  : tous les éléments sont-ils sélectionnés
//   onToggleAll  : () => void - tout sélectionner / tout désélectionner
//   onDelete     : () => void - supprimer la sélection (masqué si absent)
//   onExport     : () => void - exporter la sélection (masqué si absent)
//   exportLabel  : libellé du bouton d'export (défaut « Exporter »)
//   onCancel     : () => void - quitter le mode sélection
//   busy         : booléen - désactive les actions pendant un traitement
//   children     : actions supplémentaires propres au module, rendues avant Exporter
//   layout       : 'row' (défaut, pleine largeur) | 'stack' (colonne étroite)
//   headExtra    : layout='stack' - noeud posé dans la ligne de compteur
//                  (une recherche repliable, p.ex.) plutôt que sur sa propre rangée
//
// layout='stack' : dans une colonne de 280px, la rangée unique se replie en
// six lignes de boutons empilées qui poussent la liste hors de l'écran. La
// variante range le compteur sur une ligne et les actions en grille 2×N, avec
// des libellés courts (le compteur n'est plus répété sur chaque bouton).
export function SelectionToolbar({
  count = 0, total = 0, allSelected = false, onToggleAll,
  onDelete, onExport, exportLabel = 'Exporter', onCancel, busy = false, children,
  layout = 'row', headExtra = null,
}) {
  if (layout === 'stack') {
    return (
      <div className="no-print" style={s.stackWrap}>
        <div style={s.stackHead}>
          <span style={s.count}>
            {count}<span style={s.countTotal}> / {total}</span>
          </span>
          {onToggleAll && (
            <button style={s.linkBtn} onClick={onToggleAll} disabled={busy}>
              {allSelected ? 'Aucun' : 'Tout'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {headExtra}
          <button style={s.closeBtn} onClick={onCancel} disabled={busy} title="Quitter le mode sélection">✕</button>
        </div>
        {/* minmax(0,1fr) : sans le minimum à 0, un libellé en white-space:nowrap
            impose sa largeur à la colonne et la grille déborde du conteneur. */}
        <div style={s.stackGrid}>
          {children}
          {onExport && (
            <Btn small variant="ghost" onClick={onExport} disabled={count === 0 || busy}>{exportLabel}</Btn>
          )}
          {onDelete && (
            <Btn small variant="danger" onClick={onDelete} disabled={count === 0 || busy}>🗑 Supprimer</Btn>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="no-print"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 12px', margin: '0 0 12px', borderRadius: 8,
        background: 'var(--bg)', border: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
        {count} sélectionné{count > 1 ? 's' : ''}
        <span style={{ fontWeight: 400, color: 'var(--text2)' }}> / {total}</span>
      </span>
      {onToggleAll && (
        <Btn small variant="ghost" onClick={onToggleAll} disabled={busy}>
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </Btn>
      )}
      <div style={{ flex: 1 }} />
      {children}
      {onExport && (
        <Btn small variant="primary" onClick={onExport} disabled={count === 0 || busy}>
          {exportLabel} ({count})
        </Btn>
      )}
      {onDelete && (
        <Btn small variant="danger" onClick={onDelete} disabled={count === 0 || busy}>
          🗑 Supprimer ({count})
        </Btn>
      )}
      <Btn small variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Btn>
    </div>
  );
}

const s = {
  stackWrap: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--accent-bd)' },
  stackHead: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 },
  count: { fontSize: 13, fontWeight: 800, color: 'var(--text)' },
  countTotal: { fontWeight: 400, color: 'var(--text2)' },
  linkBtn: { background: 'none', border: 'none', padding: '2px 4px', color: 'var(--accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer' },
  closeBtn: { background: 'none', border: 'none', padding: '2px 4px', color: 'var(--text2)', fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', lineHeight: 1 },
  stackGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 },
};

export default SelectionToolbar;
