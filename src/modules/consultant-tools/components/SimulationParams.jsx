import React from 'react';

const SEGMENTS = [
  { value: 'bistro', label: 'Bistro' },
  { value: 'gastro', label: 'Gastro' },
  { value: 'luxe', label: 'Luxe' },
];

const SERVICES = [
  { value: 'midi', label: 'Midi (2h)' },
  { value: 'soir', label: 'Soir (3h)' },
];

export function SimulationParams({
  nbCuisiniers, onNbCuisiniers,
  dureeService, onDureeService,
  segment, onSegment,
  onAnalyse, loading, hasPlats,
}) {
  return (
    <div style={cs.root}>
      <div style={cs.block}>
        <div style={cs.label}>Nombre de cuisiniers</div>
        <div style={cs.sliderRow}>
          <input
            type="range"
            min={1}
            max={10}
            value={nbCuisiniers}
            onChange={e => onNbCuisiniers(Number(e.target.value))}
            style={cs.slider}
          />
          <span style={cs.sliderValue}>{nbCuisiniers}</span>
        </div>
        <div style={cs.sliderHint}>1 - 10 cuisiniers</div>
      </div>

      <div style={cs.block}>
        <div style={cs.label}>Durée du service</div>
        <div style={cs.radioGroup}>
          {SERVICES.map(s => (
            <label
              key={s.value}
              style={{ ...cs.radio, ...(dureeService === s.value ? cs.radioActive : {}) }}
            >
              <input
                type="radio"
                name="dureeService"
                value={s.value}
                checked={dureeService === s.value}
                onChange={() => onDureeService(s.value)}
                style={{ display: 'none' }}
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div style={cs.block}>
        <div style={cs.label}>Segment</div>
        <div style={cs.radioGroup}>
          {SEGMENTS.map(s => (
            <label
              key={s.value}
              style={{ ...cs.radio, ...(segment === s.value ? cs.radioActive : {}) }}
            >
              <input
                type="radio"
                name="segment"
                value={s.value}
                checked={segment === s.value}
                onChange={() => onSegment(s.value)}
                style={{ display: 'none' }}
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={onAnalyse}
        disabled={loading || !hasPlats}
        style={{
          ...cs.btn,
          ...(loading || !hasPlats ? cs.btnDisabled : cs.btnActive),
        }}
      >
        {loading ? 'Analyse en cours…' : 'Analyser la carte IA'}
      </button>
    </div>
  );
}

const cs = {
  root: { display: 'flex', flexDirection: 'column', gap: 20 },
  block: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: {
    fontSize: 11, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  sliderRow: { display: 'flex', alignItems: 'center', gap: 12 },
  slider: { flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' },
  sliderValue: {
    fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-serif)',
    color: 'var(--text)', minWidth: 32, textAlign: 'center',
  },
  sliderHint: { fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' },
  radioGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  radio: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
    fontSize: 13, cursor: 'pointer', background: 'var(--bg)', color: 'var(--text2)',
    userSelect: 'none',
  },
  radioActive: {
    background: 'var(--accent)', color: '#fff',
    border: '1px solid var(--accent)', fontWeight: 600,
  },
  btn: {
    marginTop: 4, padding: '12px 0', borderRadius: 10, border: 'none',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%',
  },
  btnActive: { background: 'var(--accent)', color: '#fff' },
  btnDisabled: {
    background: 'var(--border)', color: 'var(--text3)',
    cursor: 'not-allowed', opacity: 0.6,
  },
};
