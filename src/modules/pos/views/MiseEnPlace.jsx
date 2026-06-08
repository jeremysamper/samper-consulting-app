/**
 * MiseEnPlace — Vue 1 : Quantités à préparer pour J+1
 *
 * Affiche pour chaque plat mappé la prédiction de portions basée sur
 * la moyenne historique du même jour de semaine (14 jours).
 *
 * Permissions :
 *   Lecture + export : consultant, patron, resp_cuisine, cuisinier
 */

import { useMiseEnPlace } from '../hooks/useMiseEnPlace.js';
import { PosEmptyState }  from '../components/PosEmptyState.jsx';
import { PosExportButton } from '../components/PosExportButton.jsx';

const PRINT_ID = 'pos-print-mise-en-place';

// ── Badge fiabilité ───────────────────────────────────────────────

function ReliableBadge({ reliable, occurrences }) {
  if (reliable) {
    return (
      <span style={{
        fontSize:     11,
        fontWeight:   600,
        padding:      '2px 8px',
        borderRadius: 12,
        background:   'var(--success-bg)',
        color:        'var(--success-text)',
        whiteSpace:   'nowrap',
        flexShrink:   0,
      }}>
        🟢 fiable · {occurrences}×
      </span>
    );
  }
  return (
    <span style={{
      fontSize:     11,
      fontWeight:   600,
      padding:      '2px 8px',
      borderRadius: 12,
      background:   '#fef9c3',
      color:        'var(--warning-text)',
      whiteSpace:   'nowrap',
      flexShrink:   0,
    }}>
      ⚠ historique court · {occurrences} jour{occurrences !== 1 ? 's' : ''}
    </span>
  );
}

// ── Ligne de plat ─────────────────────────────────────────────────

function ItemRow({ item }) {
  return (
    <div style={{
      display:       'flex',
      alignItems:    'center',
      gap:           12,
      padding:       '11px 16px',
      background:    'var(--surface)',
      border:        '1px solid var(--border)',
      borderRadius:  8,
      flexWrap:      'wrap',
    }}>
      {/* Nom */}
      <div style={{
        flex:         '1 1 160px',
        fontSize:     14,
        fontWeight:   600,
        color:        'var(--text)',
        fontFamily:   'var(--font)',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {item.name}
      </div>

      {/* Flèche */}
      <div style={{ color: 'var(--text3)', fontSize: 14, flexShrink: 0 }}>→</div>

      {/* Quantité */}
      <div style={{
        fontSize:   22,
        fontWeight: 700,
        fontFamily: 'var(--font-serif)',
        color:      item.qty === 0 ? 'var(--text3)' : 'var(--text)',
        flexShrink: 0,
        minWidth:   48,
        textAlign:  'right',
      }}>
        {item.qty}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>
        portion{item.qty !== 1 ? 's' : ''}
      </div>

      {/* Badge */}
      <ReliableBadge reliable={item.reliable} occurrences={item.occurrences} />
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────

export default function MiseEnPlace({ etablissement, onNavigateToMapping }) {
  const { items, tomorrowLabel, unmappedCount, totalPosCount, loading, error, reload } =
    useMiseEnPlace(etablissement);

  const etabNom = etablissement?.nom ?? '';

  // ── États vides prioritaires ──────────────────────────────────
  if (loading)  return <PosEmptyState type="loading" />;
  if (error)    return <PosEmptyState type="error" message={error} onRetry={reload} />;

  if (totalPosCount === 0) return <PosEmptyState type="no_connection" />;
  if (items.length === 0 && unmappedCount === totalPosCount) {
    return <PosEmptyState type="no_mapping" onNavigateToMapping={onNavigateToMapping} />;
  }
  if (items.length === 0) {
    return <PosEmptyState type="no_sales" message="Aucune vente enregistrée sur les 14 derniers jours." />;
  }

  const mappedCount = items.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Barre d'actions (hors impression) */}
      <div className="no-print" style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            12,
        flexWrap:       'wrap',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          {mappedCount} plat{mappedCount !== 1 ? 's' : ''} mappé{mappedCount !== 1 ? 's' : ''}
          {unmappedCount > 0 && (
            <> · <span style={{ color: 'var(--text3)' }}>
              {unmappedCount} non mappé{unmappedCount !== 1 ? 's' : ''} exclus
            </span></>
          )}
        </div>
        <PosExportButton
          printId={PRINT_ID}
          title={`Mise en place — ${tomorrowLabel}`}
          etablissement={etablissement}
        />
      </div>

      {/* Zone imprimable */}
      <div id={PRINT_ID} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* En-tête contextuel à l'écran — retiré du PDF (l'en-tête branded Samper le remplace) */}
        <div className="no-print" style={{
          paddingBottom: 12,
          borderBottom:  '1px solid var(--border)',
          marginBottom:  4,
        }}>
          <div style={{
            fontSize:   18,
            fontWeight: 700,
            fontFamily: 'var(--font-serif)',
            color:      'var(--text)',
          }}>
            Mise en place — {tomorrowLabel}
          </div>
          {etabNom && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {etabNom}
            </div>
          )}
        </div>

        {/* Liste des plats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <ItemRow key={item.posItemId} item={item} />
          ))}
        </div>

        {/* Pied — plats exclus */}
        {unmappedCount > 0 && (
          <div style={{
            marginTop:  8,
            paddingTop: 10,
            borderTop:  '1px solid var(--border)',
            fontSize:   12,
            color:      'var(--text3)',
          }}>
            {unmappedCount} plat{unmappedCount !== 1 ? 's' : ''} non mappé{unmappedCount !== 1 ? 's' : ''} exclu{unmappedCount !== 1 ? 's' : ''} de ce calcul
            {onNavigateToMapping && (
              <button
                onClick={onNavigateToMapping}
                className="no-print"
                style={{
                  marginLeft:   6,
                  background:   'none',
                  border:       'none',
                  color:        'var(--accent)',
                  cursor:       'pointer',
                  fontSize:     12,
                  padding:      0,
                  fontFamily:   'var(--font)',
                  textDecoration: 'underline',
                }}
              >
                Aller au mapping →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
