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
export function SelectionToolbar({
  count = 0, total = 0, allSelected = false, onToggleAll,
  onDelete, onExport, exportLabel = 'Exporter', onCancel, busy = false, children,
}) {
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

export default SelectionToolbar;
