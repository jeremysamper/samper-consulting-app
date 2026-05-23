/**
 * MappingStats — Compteur "X/Y plats mappés" + détail par statut
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
          background: pct === 100 ? '#f0fdf4' : '#eff6ff',
          color:      pct === 100 ? '#15803d' : '#1d4ed8',
          border:     `1px solid ${pct === 100 ? '#86efac' : '#bfdbfe'}`,
        }}>{pct}%</span>
      </div>

      {/* Séparateur */}
      <div style={{ width: 1, height: 32, background: 'var(--border)', flexShrink: 0 }} />

      {/* Détail par statut */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Pill color="#15803d" bg="#f0fdf4" border="#86efac" icon="🟢" label="auto" count={autoCount} />
        <Pill color="#92400e" bg="#fffbeb" border="#fcd34d" icon="🟡" label="suggestions" count={suggested} />
        <Pill color="#6b7280" bg="#f9fafb" border="#d1d5db" icon="⚪" label="à mapper" count={manual} />
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
