import React from 'react';

const SCORE_COLORS = {
  1: 'var(--success-strong)',
  2: '#22c55e',
  3: 'var(--warning-strong)',
  4: 'var(--danger-strong)',
  5: 'var(--danger-strong)',
};

export function SimulationPlatRow({ plat }) {
  const { nom, score, justification, suggestion, impact_si_simplifie } = plat;
  const color = SCORE_COLORS[score] || 'var(--text2)';

  return (
    <div style={cs.root}>
      <div style={cs.top}>
        <div style={cs.nom}>{nom}</div>
        <div style={cs.scoreArea}>
          <div style={cs.scoreBars}>
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                style={{
                  ...cs.bar,
                  background: i <= score ? color : 'var(--border)',
                }}
              />
            ))}
          </div>
          <span style={{ ...cs.scoreNum, color }}>{score}/5</span>
          {score >= 4 && <span style={cs.alertIcon}>⚠</span>}
        </div>
      </div>

      {justification && (
        <div style={cs.justif}>{justification}</div>
      )}

      {suggestion && score >= 4 && (
        <div style={cs.suggestion}>
          <span style={cs.suggestionIcon}>💡</span>
          <span>
            {suggestion}
            {impact_si_simplifie != null && (
              <span style={cs.impact}> → score {impact_si_simplifie}/5</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

const cs = {
  root: { padding: '10px 0', borderBottom: '1px solid var(--border)' },
  top: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  nom: { fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 },
  scoreArea: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  scoreBars: { display: 'flex', gap: 3 },
  bar: { width: 14, height: 14, borderRadius: 3 },
  scoreNum: { fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: 'right' },
  alertIcon: { fontSize: 13, color: 'var(--danger-strong)' },
  justif: {
    fontSize: 11, color: 'var(--text2)',
    marginTop: 4, lineHeight: 1.45,
  },
  suggestion: {
    marginTop: 6, fontSize: 11, color: 'var(--warning-text)',
    background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)',
    padding: '5px 10px', borderRadius: 6,
    lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: 6,
  },
  suggestionIcon: { flexShrink: 0, marginTop: 1 },
  impact: { fontWeight: 700, color: 'var(--success-strong)' },
};
