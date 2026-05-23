/**
 * TopFlop — Vue 2 : Ranking des ventes POS sur période glissante
 *
 * Affiche le classement de tous les plats POS par volume vendu,
 * avec delta vs la période précédente équivalente.
 *
 * Permissions :
 *   Lecture : consultant, patron, resp_cuisine, cuisinier
 */

import { useState } from 'react';
import { useTopFlop }      from '../hooks/useTopFlop.js';
import { PosEmptyState }   from '../components/PosEmptyState.jsx';

const PERIODS = [
  { value: 7,  label: '7 jours' },
  { value: 14, label: '14 jours' },
  { value: 30, label: '30 jours' },
];

const FILTERS = [
  { value: 'all',   label: 'Tous' },
  { value: 'top10', label: 'Top 10' },
  { value: 'flop10', label: 'Flop 10' },
];

// ── Delta badge ───────────────────────────────────────────────────

function DeltaBadge({ delta, isNew }) {
  if (isNew) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
        background: '#dbeafe', color: '#1d4ed8',
      }}>
        Nouveau
      </span>
    );
  }
  if (delta === null) {
    return <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>;
  }

  let bg, color, arrow;
  if (delta >= 10)       { bg = '#dcfce7'; color = '#15803d'; arrow = '↑'; }
  else if (delta > -10)  { bg = 'var(--bg)'; color = 'var(--text2)'; arrow = '→'; }
  else if (delta > -25)  { bg = '#fef3c7'; color = '#92400e'; arrow = '↓'; }
  else                   { bg = '#fee2e2'; color = '#dc2626'; arrow = '↓↓'; }

  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
      background: bg, color,
      whiteSpace: 'nowrap',
    }}>
      {arrow} {delta > 0 ? '+' : ''}{delta}%
    </span>
  );
}

// ── Composant principal ───────────────────────────────────────────

export default function TopFlop({ etablissement, onNavigateToMapping }) {
  const [periodDays, setPeriodDays] = useState(7);
  const [filter, setFilter]         = useState('all');

  const { items, periodLabel, loading, error, reload } = useTopFlop(etablissement, periodDays);

  // ── Filtre top/flop ───────────────────────────────────────────
  const displayedItems = (() => {
    if (filter === 'top10')  return items.slice(0, 10);
    if (filter === 'flop10') return [...items].reverse().slice(0, 10).reverse();
    return items;
  })();

  // ── États vides ───────────────────────────────────────────────
  if (loading) return <PosEmptyState type="loading" />;
  if (error)   return <PosEmptyState type="error" message={error} onRetry={reload} />;
  if (items.length === 0) {
    return <PosEmptyState type="no_sales" message="Aucune vente sur cette période." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Contrôles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Période */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodDays(p.value)}
              style={{
                padding:    '5px 14px',
                borderRadius: 20,
                fontSize:   12,
                fontWeight: periodDays === p.value ? 700 : 500,
                fontFamily: 'var(--font)',
                cursor:     'pointer',
                border:     `1px solid ${periodDays === p.value ? 'var(--accent)' : 'var(--border)'}`,
                background: periodDays === p.value ? 'var(--accent)' : 'var(--surface)',
                color:      periodDays === p.value ? '#fff' : 'var(--text2)',
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Séparateur */}
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Filtre top/flop */}
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding:    '5px 14px',
                borderRadius: 20,
                fontSize:   12,
                fontWeight: filter === f.value ? 700 : 500,
                fontFamily: 'var(--font)',
                cursor:     'pointer',
                border:     `1px solid ${filter === f.value ? 'var(--nav)' : 'var(--border)'}`,
                background: filter === f.value ? 'var(--nav)' : 'var(--surface)',
                color:      filter === f.value ? '#fff' : 'var(--text2)',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* En-tête période */}
      <div style={{
        fontSize:   13,
        color:      'var(--text2)',
        fontStyle:  'italic',
        paddingBottom: 4,
        borderBottom:  '1px solid var(--border)',
      }}>
        {filter === 'top10'  ? 'Top 10 · ' : ''}
        {filter === 'flop10' ? 'Flop 10 · ' : ''}
        Semaine {periodLabel}
      </div>

      {/* Tableau */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* En-tête */}
        <div style={{
          display:    'grid',
          gridTemplateColumns: '32px 1fr 72px 80px 90px',
          gap:        8,
          padding:    '6px 14px',
          fontSize:   11,
          fontWeight: 700,
          color:      'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}>
          <div>#</div>
          <div>Plat</div>
          <div style={{ textAlign: 'right' }}>Cette pér.</div>
          <div style={{ textAlign: 'right' }}>Préc.</div>
          <div style={{ textAlign: 'center' }}>Variation</div>
        </div>

        {/* Lignes */}
        {displayedItems.map((item, idx) => {
          // Rang global (dans la liste complète triée)
          const globalRank = filter === 'flop10'
            ? items.length - displayedItems.length + idx + 1
            : idx + 1;

          return (
            <div
              key={item.posItemId}
              style={{
                display:    'grid',
                gridTemplateColumns: '32px 1fr 72px 80px 90px',
                gap:        8,
                padding:    '10px 14px',
                background: 'var(--surface)',
                border:     '1px solid var(--border)',
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              {/* Rang */}
              <div style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text3)',
                fontFamily: 'var(--font-serif)',
              }}>
                {globalRank}
              </div>

              {/* Nom */}
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.name}
              </div>

              {/* Qty A */}
              <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
                {item.qty_A}
              </div>

              {/* Qty B */}
              <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                {item.qty_B > 0 ? item.qty_B : '—'}
              </div>

              {/* Delta */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <DeltaBadge delta={item.delta} isNew={item.isNew} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pied */}
      {onNavigateToMapping && (
        <div style={{ fontSize: 12, color: 'var(--text3)', paddingTop: 4 }}>
          Seuls les plats POS avec au moins une vente sur la période sont affichés.{' '}
          <button
            onClick={onNavigateToMapping}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', fontSize: 12, padding: 0,
              fontFamily: 'var(--font)', textDecoration: 'underline',
            }}
          >
            Mapping plats →
          </button>
        </div>
      )}
    </div>
  );
}
