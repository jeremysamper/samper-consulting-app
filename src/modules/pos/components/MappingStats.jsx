/**
 * MappingStats - Compteur "X/Y plats mappés" + détail par statut
 */

/**
 * @param {{
 *   total:     number,
 *   mapped:    number,
 *   auto:      number,
 *   suggested: number,
 *   manual:    number,
 * }} props
 */
export function MappingStats({ total, mapped, auto: autoCount, suggested, manual }) {
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;

  return (
    <div style={{
      background:   'var(--surface)',
      border:       '1px solid var(--border)',
      borderRadius: 12,
      padding:      '14px 20px',
      display:      'flex',
      alignItems:   'center',
      gap:          24,
      flexWrap:     'wrap',
    }}>
      {/* Compteur principal */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
          {mapped}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>/ {total} plats mappés</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
          background: pct === 100 ? 'var(--success-bg-soft)' : 'var(--info-bg-soft)',
          color:      pct === 100 ? 'var(--success-text)' : 'var(--info-text)',
          border:     `1px solid ${pct === 100 ? 'var(--success-bd)' : '#bfdbfe'}`,
        }}>{pct}%</span>
      </div>

      {/* Séparateur */}
      <div style={{ width: 1, height: 32, background: 'var(--border)', flexShrink: 0 }} />

      {/* Détail par statut */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Pill color="var(--success-text)" bg="var(--success-bg-soft)" border="var(--success-bd)" icon="🟢" label="auto" count={autoCount} />
        <Pill color="var(--warning-text)" bg="var(--warning-bg-soft)" border="var(--warning-bd)" icon="🟡" label="suggestions" count={suggested} />
        <Pill color="var(--text2)" bg="var(--surface2)" border="var(--border)" icon="⚪" label="à mapper" count={manual} />
      </div>
    </div>
  );
}

function Pill({ color, bg, border, icon, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
    </div>
  );
}
