/**
 * MatchBadge — Badge coloré indiquant le statut et le score Dice
 *
 * Variantes :
 *   🟢 auto      → score ≥ 85 ou validation manuelle
 *   🟡 suggested → score 50–84, confirmation requise
 *   ⚪ manual    → score < 50 ou non calculé
 */

const BADGE_CONFIG = {
  auto: {
    dot:    '🟢',
    label:  'auto',
    color:  'var(--success-text)',
    bg:     'var(--success-bg-soft)',
    border: 'var(--success-bd)',
  },
  suggested: {
    dot:    '🟡',
    label:  'suggestion',
    color:  'var(--warning-text)',
    bg:     'var(--warning-bg-soft)',
    border: 'var(--warning-bd)',
  },
  manual: {
    dot:    '⚪',
    label:  'à mapper',
    color:  '#6b7280',
    bg:     '#f9fafb',
    border: '#d1d5db',
  },
};

/**
 * @param {{ status: 'auto'|'suggested'|'manual', score?: number }} props
 */
export function MatchBadge({ status, score }) {
  const cfg = BADGE_CONFIG[status] ?? BADGE_CONFIG.manual;

  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           4,
      padding:       '2px 8px',
      borderRadius:  12,
      fontSize:      11,
      fontWeight:    600,
      whiteSpace:    'nowrap',
      fontFamily:    'var(--font)',
      background:    cfg.bg,
      color:         cfg.color,
      border:        `1px solid ${cfg.border}`,
    }}>
      <span style={{ fontSize: 10 }}>{cfg.dot}</span>
      <span>{cfg.label}</span>
      {score != null && status !== 'manual' && (
        <span style={{ opacity: 0.75 }}>· {score}</span>
      )}
    </span>
  );
}
