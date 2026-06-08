import React from 'react';

export function SimulationResults({
  scoreMoyen, couvertsMin, couvertsMax,
  chargeBrigade, alerte, synthese,
  loading, hasResult,
}) {
  if (loading) {
    return (
      <div style={cs.root}>
        <div style={cs.skeleton} />
        <div style={{ ...cs.skeleton, height: 44 }} />
        <div style={{ ...cs.skeleton, height: 36 }} />
      </div>
    );
  }

  if (!hasResult) {
    return (
      <div style={cs.empty}>
        <div style={{ fontSize: 32, opacity: 0.25 }}>📊</div>
        <div style={cs.emptyText}>Lancez l'analyse IA pour obtenir les résultats</div>
      </div>
    );
  }

  const charge = Number(chargeBrigade) || 0;
  const chargeColor = charge >= 85 ? 'var(--danger-strong)' : charge >= 65 ? '#d97706' : 'var(--success-strong)';
  const scoreMoyenDisplay = typeof scoreMoyen === 'number' ? scoreMoyen.toFixed(1) : '—';

  return (
    <div style={cs.root}>
      {alerte && (
        <div style={cs.alerte}>
          ⚠ Charge élevée — risque en coup de feu
        </div>
      )}

      <div style={cs.kpisGrid}>
        <div style={cs.kpi}>
          <div style={cs.kpiLabel}>Complexité moy.</div>
          <div style={cs.kpiValue}>
            {scoreMoyenDisplay}
            <span style={cs.kpiSub}> / 5</span>
          </div>
        </div>
        <div style={cs.kpi}>
          <div style={cs.kpiLabel}>Couverts réalisables</div>
          <div style={cs.kpiValue}>
            {couvertsMin != null ? `${couvertsMin}–${couvertsMax}` : '—'}
          </div>
        </div>
      </div>

      <div style={cs.jaugeBlock}>
        <div style={cs.jaugeHeader}>
          <span style={cs.kpiLabel}>Charge brigade</span>
          <span style={{ ...cs.jaugePct, color: chargeColor }}>{charge}%</span>
        </div>
        <div style={cs.jaugeTrack}>
          <div
            style={{
              ...cs.jaugeFill,
              width: `${Math.min(100, charge)}%`,
              background: chargeColor,
            }}
          />
        </div>
      </div>

      {synthese && (
        <div style={cs.synthese}>
          <div style={cs.syntheseTitle}>Synthèse IA</div>
          <div style={cs.syntheseText}>{synthese}</div>
        </div>
      )}
    </div>
  );
}

const cs = {
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  skeleton: {
    height: 64, borderRadius: 8, background: 'var(--border)',
    opacity: 0.6, animation: 'pulse 1.5s ease-in-out infinite',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '32px 0', gap: 8,
  },
  emptyText: { fontSize: 12, color: 'var(--text3)', textAlign: 'center' },
  alerte: {
    padding: '10px 14px', borderRadius: 8,
    background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)',
    color: 'var(--danger-strong)', fontSize: 13, fontWeight: 600,
  },
  kpisGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  kpi: {
    background: 'var(--bg)', borderRadius: 8,
    padding: '12px 14px', border: '1px solid var(--border)',
  },
  kpiLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
  },
  kpiValue: {
    fontSize: 22, fontWeight: 700,
    fontFamily: 'var(--font-serif)', color: 'var(--text)',
  },
  kpiSub: { fontSize: 13, fontWeight: 400, color: 'var(--text2)' },
  jaugeBlock: {
    background: 'var(--bg)', borderRadius: 8,
    padding: '12px 14px', border: '1px solid var(--border)',
  },
  jaugeHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  jaugePct: { fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-serif)' },
  jaugeTrack: {
    height: 10, background: 'var(--border)',
    borderRadius: 5, overflow: 'hidden',
  },
  jaugeFill: { height: '100%', borderRadius: 5, transition: 'width 0.35s ease' },
  synthese: {
    background: 'var(--bg)', borderRadius: 8,
    padding: '12px 14px', border: '1px solid var(--border)',
  },
  syntheseTitle: {
    fontSize: 10, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  },
  syntheseText: { fontSize: 13, color: 'var(--text)', lineHeight: 1.65 },
};
